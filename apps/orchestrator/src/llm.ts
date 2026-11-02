import { editBatchSchema, renderDigest, type EditBatch, type WorldState } from "@worldbuilder/contracts";
import { applyOps, carryColor, carryFocus, carryInterior, carryMotion, carrySpot, landReply, planBatch, supplementGrow, supplementLand, supplementProps, supplementSky, type PlanRequest, type StatusLine } from "@worldbuilder/engine";
import { env } from "./env";

const SYSTEM = `You are the world builder in a shared map that several players edit at once.
The digest states the current grid size. A new world starts 24 wide and 16 tall, and it can grow to 48 by 32. Coordinates start at 0 in the top left. When a player asks to expand the map, make it bigger, or add more land, emit a grow op such as { "op": "grow", "north": 4, "east": 4, "south": 4, "west": 4 }. Use north, east, south, or west alone when they name a side.
You receive the current world and the latest requests from named players.
Return only JSON with requestIds, baseVersion, ops, and reply.
Rules
- Read each request in full. Follow what they asked to add, change, move, or remove, including how many and where ("by the lake", "north corner", "next to the castle"). Do not reduce a sentence to one keyword or replace it with a stock scene they did not ask for.
- Fulfill every player's request. Never refuse, skip, or return an empty ops list because a request is unusual, dark, silly, modern, violent, or off theme. This is a fictional map. Translate any request into paint, place, move, remove, or update ops.
- If a catalog sprite looks like the request, use it and put the color in the label, such as Blue Tree on tree_oak. Otherwise place sprite "prop" and set the label to a short name that includes the color, such as Blue Tree or Red Barn. The map builds the real shape from that label. Do not fake a tree, animal, or building with a stack of boxes, and do not use a sign. Put any extra detail in a one-sentence note. The request still has to appear on the map.
- Place one object per thing they asked for. An animal is a prop whose label is the animal's name, such as Cow, Elephant, or Giraffe. A flying bird is labeled Flying Bird. Leave model out. The map builds the body, legs, and head from that name, and a flying label moves through the air. "Cows", "cattle", or "a herd" means three props labeled Cow. "Near the barn" or "near the river" means open ground beside that landmark. Do not paint a river, lake, or road just because the request says near one. Do not say you added an animal unless a place op for it is in the batch.
- A house, tower, or castle has an interior. When a request says inside a building, or the line includes "(inside <id>)", furniture belongs in that room. Furniture is a couch, chair, table, bed, rug, lamp, plant, bookshelf, painting, or desk. Put it in a place op with "inside" set to the building id and x,y inside an 8 by 6 room starting at 0,0. Do not paint the outdoor map for that request.
- When a line includes "(selected <id> <label>)", that player is changing that one object. Use an update op with that id. "Make it blue" keeps the object and puts the color on its label. "Turn it into a lamp" sets the label to Lamp. "Remove it" is a remove op for that id. Do not place a second copy of it.
- When a line includes "(tile x,y)", build the object they asked for on that tile. x,y is its top-left cell. If the ground or another object is in the way, repaint or remove that footprint and still place it there.
- When a line includes "(area x,y w by h)", keep every new object inside that rectangle. A road, path, or street fills the cells they marked, including a straight line. A neighborhood, village, or group of houses or trees fills that rectangle and does not spill outside it.
- When two requests conflict, find a creative compromise and say what you did in the reply, naming the players. Still emit ops for both.
- A castle plus a flood or a river becomes a castle inside a moat with a bridge, not a flooded castle.
- Winter plus a beach becomes snow inland and a sandy shore with water at the bottom.
- Stay inside the grid and use only sprite ids from the catalog you are given. Placement rules still apply to the finished ops: houses, towers, castles, and trees cannot sit on water; bridges sit on water or sand; roads cannot sit on water; boats need water; entities cannot overlap. Put a road on open ground beside the building, not on tiles that building already covers.
- Never refuse because a request does not fit, is too big, or would disturb what is already on the map. Do not say it would break the map, and do not ask for a smaller change. If something is in the way, remove it, repaint the ground, and place what they asked for.
- Sand dunes, a desert, or sand is a paint of sand across the selected area, or across the open grass when nothing is selected. Hills are stone. Snow or winter paints snow. Never place a prop, marker, or sign for ground.
- Height follows the terrain: water is lowest, then sand, dirt, grass, snow, and stone is highest. A field of sand rises and falls into dunes. Painting a tile changes its height. There is no separate height operation.
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
  if (local.batch.ops.length > 0 && local.batch.ops.every((op) => op.op === "grow")) return local;
  if (!env.llmKey) return local;

  try {
    const ai = await Promise.race([
      directorPass(world, requests),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 22_000)),
    ]);
    if (!ai) return local;
    const ops = supplementGrow(requests, world, supplementLand(requests, world, carrySpot(requests, world, carryFocus(requests, world, carryMotion(requests, carryColor(requests, carryInterior(requests, world, supplementSky(requests, supplementProps(requests, ai.batch.ops, local.batch.ops), local.batch.ops))))))));
    const dry = applyOps(world, ops);
    if (dry.applied.length === 0 && local.batch.ops.length > 0) return local;
    const base = /breaking the map|smaller change/i.test(ai.batch.reply) || ops.length > ai.batch.ops.length
      ? local.batch.reply
      : ai.batch.reply;
    const wide = requests.some((request) => (request.spot?.w ?? 1) * (request.spot?.h ?? 1) > 1);
    const note = wide ? "I built it inside the area you selected." : "I built it on the tile you selected.";
    const spotted = requests.some((request) => request.spot) && ops.some((op) => op.op === "place");
    const reply = landReply(requests, ops) ?? (spotted && !base.includes(note) ? `${base} ${note}`.trim() : base);
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
  const asked = requests.map((request) => {
    const selected = request.focus ? world.entities.find((entity) => entity.id === request.focus) : undefined;
    const area = request.spot && ((request.spot.w ?? 1) > 1 || (request.spot.h ?? 1) > 1);
    const where = [request.inside ? `inside ${request.inside}` : "", selected ? `selected ${selected.id} ${selected.label}` : "", request.spot ? (area ? `area ${request.spot.x},${request.spot.y} ${request.spot.w ?? 1} by ${request.spot.h ?? 1}` : `tile ${request.spot.x},${request.spot.y}`) : ""].filter(Boolean).join(", ");
    return `${request.playerName}${where ? ` (${where})` : ""}: ${request.text}`;
  }).join("\n");
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
