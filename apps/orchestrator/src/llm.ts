import { editBatchSchema, renderDigest, type EditBatch, type WorldState } from "@worldbuilder/contracts";
import { applyOps, carryColor, carryMotion, planBatch, supplementProps, supplementSky, type PlanRequest, type StatusLine } from "@worldbuilder/engine";
import { env } from "./env";

const SYSTEM = `You are the world builder in a shared map that several players edit at once.
The grid is 24 wide and 16 tall. Coordinates start at 0 in the top left.
You receive the current world and the latest requests from named players.
Return only JSON with requestIds, baseVersion, ops, and reply.
Rules
- Read each request in full. Follow what they asked to add, change, move, or remove, including how many and where ("by the lake", "north corner", "next to the castle"). Do not reduce a sentence to one keyword or replace it with a stock scene they did not ask for.
- Fulfill every player's request. Never refuse, skip, or return an empty ops list because a request is unusual, dark, silly, modern, violent, or off theme. This is a fictional map. Translate any request into paint, place, move, remove, or update ops.
- If a catalog sprite looks like the request, use it and put the color in the label, such as Blue Tree on tree_oak. Otherwise place sprite "prop" and set the label to a short name that includes the color, such as Blue Tree or Red Barn. The map builds the real shape from that label. Do not fake a tree, animal, or building with a stack of boxes, and do not use a sign. Put any extra detail in a one-sentence note. The request still has to appear on the map.
- Place one object per thing they asked for. An animal is a prop whose label is the animal's name, such as Cow, Elephant, or Giraffe. A flying bird is labeled Flying Bird. Leave model out. The map builds the body, legs, and head from that name, and a flying label moves through the air. "Cows", "cattle", or "a herd" means three props labeled Cow. "Near the barn" or "near the river" means open ground beside that landmark. Do not paint a river, lake, or road just because the request says near one. Do not say you added an animal unless a place op for it is in the batch.
- When two requests conflict, find a creative compromise and say what you did in the reply, naming the players. Still emit ops for both.
- A castle plus a flood or a river becomes a castle inside a moat with a bridge, not a flooded castle.
- Winter plus a beach becomes snow inland and a sandy shore with water at the bottom.
- Stay inside the grid and use only sprite ids from the catalog you are given. Placement rules still apply to the finished ops: houses, towers, castles, and trees cannot sit on water; bridges sit on water or sand; roads cannot sit on water; boats need water; entities cannot overlap. Put a road on open ground beside the building, not on tiles that building already covers.
- Never refuse because a request does not fit, is too big, or would disturb what is already on the map. Do not say it would break the map, and do not ask for a smaller change. If something is in the way, remove it, repaint the ground, and place what they asked for.
- Height follows the terrain: water is lowest, then sand, dirt, grass, snow, and stone is highest. Painting a tile changes its height. There is no separate height operation.
- Night and day change the whole sky. Emit { "op": "sky", "value": "night" } or "day". A note on a building does not make it night.
- Give each thing a sprite from the catalog and a label. Use notes for short lore, one sentence at most.
Ops are paint, place, move, remove, or update.`;

function ensureModelKey(): void {
  if (env.llmKey && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.llmKey;
}

async function mastraObject(system: string, prompt: string, schema: unknown): Promise<unknown | null> {
  try {
    ensureModelKey();
    const { Agent } = await import("@mastra/core/agent");
    const agent = new Agent({
      id: "world-builder",
      name: "World Builder",
      instructions: system,
      model: `openai/${env.llmFast}`,
    });
    const response = await agent.generate(prompt, {
      structuredOutput: { schema: schema as never },
    });
    return response.object ?? null;
  } catch (error) {
    console.warn("Mastra structured output unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function httpObject(system: string, prompt: string): Promise<unknown | null> {
  if (!env.llmKey) return null;
  const response = await fetch(`${env.llmBase}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.llmKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.llmFast,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`model HTTP ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content) as unknown;
}

async function complete(system: string, prompt: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) {
  const fromHttp = await httpObject(system, prompt);
  const parsedHttp = fromHttp ? schema.safeParse(fromHttp) : null;
  if (parsedHttp?.success) return parsedHttp.data;
  const fromMastra = await mastraObject(system, prompt, schema);
  const parsedMastra = fromMastra ? schema.safeParse(fromMastra) : null;
  if (parsedMastra?.success) return parsedMastra.data;
  return null;
}

export async function composeBatch(world: WorldState, requests: PlanRequest[]): Promise<{ batch: EditBatch; lines: StatusLine[] }> {
  const local = planBatch(world, requests);
  if (!env.llmKey) return local;

  try {
    const ai = await Promise.race([
      directorPass(world, requests),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 22_000)),
    ]);
    if (!ai) return local;
    const ops = carryMotion(requests, carryColor(requests, supplementSky(requests, supplementProps(requests, ai.batch.ops, local.batch.ops), local.batch.ops)));
    const dry = applyOps(world, ops);
    if (dry.applied.length === 0 && local.batch.ops.length > 0) return local;
    const reply = /breaking the map|smaller change/i.test(ai.batch.reply) || ops.length > ai.batch.ops.length
      ? local.batch.reply
      : ai.batch.reply;
    return {
      batch: { ...ai.batch, requestIds: requests.map((request) => request.id), baseVersion: world.version, ops, reply },
      lines: ai.lines,
    };
  } catch (error) {
    console.warn("Builder fell back to the local team:", error instanceof Error ? error.message : error);
    return local;
  }
}

async function directorPass(world: WorldState, requests: PlanRequest[]): Promise<{ batch: EditBatch; lines: StatusLine[] } | null> {
  const asked = requests.map((request) => `${request.playerName}: ${request.text}`).join("\n");
  const people = who(requests);
  const merged = await complete(
    SYSTEM,
    `${renderDigest(world)}\n\nRequests, in full. Follow every part of each sentence, not a keyword from it:\n${asked}\n\nReturn the final EditBatch JSON. The reply should say what you did with the whole request. Include ops for every request. An empty ops array is only valid when every request asks for no change. requestIds must be ${JSON.stringify(requests.map((request) => request.id))} and baseVersion must be ${world.version}.`,
    editBatchSchema,
  );
  if (!merged) return null;
  const lines: StatusLine[] = [
    { from: "Director", text: `Reading the full request from ${people}.` },
    { from: "Director", text: "Placing what the message asked for." },
  ];
  return { batch: merged as EditBatch, lines };
}

function who(requests: PlanRequest[]): string {
  const names = [...new Set(requests.map((request) => request.playerName))];
  if (names.length === 0) return "someone";
  if (names.length === 1) return names[0] ?? "someone";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function repairBatch(world: WorldState, batch: EditBatch, rejected: { index: number; reason: string }[]): Promise<EditBatch | null> {
  if (!env.llmKey) return null;
  const result = await complete(
    SYSTEM,
    `${renderDigest(world)}\n\nThese ops were rejected:\n${JSON.stringify(rejected)}\n\nOriginal batch:\n${JSON.stringify(batch)}\n\nReturn a new EditBatch that fixes only the rejected ops.`,
    editBatchSchema,
  );
  return (result as EditBatch | null) ?? null;
}

export async function mirrorRelay(roomId: string, lines: StatusLine[]): Promise<void> {
  if (!env.relayKey) return;
  try {
    const { AgentRelay } = await import("@agent-relay/sdk");
    const relay = new AgentRelay({ workspaceKey: env.relayKey });
    const director = await relay.workspace.register({ name: "director", type: "agent" });
    const channel = `world-${roomId}`;
    await director.channels.create({ name: channel, topic: "Shared world" }).catch(() => undefined);
    for (const line of lines) {
      await director.sendMessage({ to: `#${channel}`, text: `${line.from}: ${line.text}` });
    }
  } catch (error) {
    console.warn("Agent Relay skipped:", error instanceof Error ? error.message : error);
  }
}
