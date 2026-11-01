import { agentProposalSchema, editBatchSchema, renderDigest, type EditBatch, type WorldState } from "@worldbuilder/contracts";
import { applyOps, planBatch, type PlanRequest, type StatusLine } from "@worldbuilder/engine";
import { env } from "./env";

const SYSTEM = `You are the world builder in a shared map that several players edit at once.
The grid is 24 wide and 16 tall. Coordinates start at 0 in the top left.
You receive the current world and the latest requests from named players.
Return only JSON with requestIds, baseVersion, ops, and reply.
Rules
- Fulfill every player's request. Never refuse, skip, or return an empty ops list because a request is unusual, dark, silly, modern, violent, or off theme. This is a fictional map. Translate any request into paint, place, move, remove, or update ops.
- If a catalog sprite looks like the request, use it. Otherwise place a sign and set the label to a short name of the thing, such as Car, Dragon, Plane, Horse, Robot, or Tent. The map draws that shape from the label. Do not stand in with a house, road, rock, or fence. Put any extra detail in a one-sentence note. The request still has to appear on the map.
- When two requests conflict, find a creative compromise and say what you did in the reply, naming the players. Still emit ops for both.
- A castle plus a flood or a river becomes a castle inside a moat with a bridge, not a flooded castle.
- Winter plus a beach becomes snow inland and a sandy shore with water at the bottom.
- Stay inside the grid and use only sprite ids from the catalog you are given. Placement rules still apply to the finished ops: houses, towers, castles, and trees cannot sit on water; bridges sit on water or sand; roads cannot sit on water; boats need water; entities cannot overlap.
- Never refuse because a request does not fit, is too big, or would disturb what is already on the map. Do not say it would break the map, and do not ask for a smaller change. If something is in the way, remove it, repaint the ground, and place what they asked for.
- Height follows the terrain: water is lowest, then sand, dirt, grass, snow, and stone is highest. Painting a tile changes its height. There is no separate height operation.
- Give each thing a sprite from the catalog and a label. Use notes for short lore, one sentence at most.
Ops are paint, place, move, remove, or update.`;

async function mastraObject(system: string, prompt: string, schema: unknown): Promise<unknown | null> {
  try {
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
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`model HTTP ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content) as unknown;
}

async function complete(system: string, prompt: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) {
  const fromMastra = await mastraObject(system, prompt, schema);
  const parsedMastra = fromMastra ? schema.safeParse(fromMastra) : null;
  if (parsedMastra?.success) return parsedMastra.data;
  const fromHttp = await httpObject(system, prompt);
  const parsedHttp = fromHttp ? schema.safeParse(fromHttp) : null;
  if (parsedHttp?.success) return parsedHttp.data;
  return null;
}

export async function composeBatch(world: WorldState, requests: PlanRequest[]): Promise<{ batch: EditBatch; lines: StatusLine[] }> {
  const local = planBatch(world, requests);
  if (!env.llmKey) return local;

  try {
    const ai = await Promise.race([
      directorPass(world, requests, local),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 14_000)),
    ]);
    if (!ai) return local;
    const dry = applyOps(world, ai.batch.ops);
    if (dry.applied.length === 0 && local.batch.ops.length > 0) return local;
    const reply = /breaking the map|smaller change/i.test(ai.batch.reply) ? local.batch.reply : ai.batch.reply;
    return {
      batch: { ...ai.batch, requestIds: requests.map((request) => request.id), baseVersion: world.version, ops: dry.applied, reply },
      lines: ai.lines,
    };
  } catch (error) {
    console.warn("Builder fell back to the local team:", error instanceof Error ? error.message : error);
    return local;
  }
}

async function directorPass(
  world: WorldState,
  requests: PlanRequest[],
  local: { batch: EditBatch; lines: StatusLine[] },
): Promise<{ batch: EditBatch; lines: StatusLine[] } | null> {
  const asked = requests.map((request) => `${request.playerName}: ${request.text}`).join("\n");
  const specialist = await Promise.all(
    (["architect", "naturalist", "storyteller"] as const).map(async (from) => {
      const result = await complete(
        `${SYSTEM}\nYou are the ${from}. Return JSON with from, ops, rationale, and concerns. Use from="${from}". concerns are placement notes only. Always include ops that carry out the requests. Do not recommend refusing.`,
        `${renderDigest(world)}\n\nRequests:\n${asked}\n\nDraft already proposed:\n${JSON.stringify(local.batch.ops).slice(0, 4000)}`,
        agentProposalSchema,
      );
      return result as { from: string; ops: EditBatch["ops"]; rationale: string; concerns: string[] } | null;
    }),
  );

  const lines: StatusLine[] = [{ from: "Director", text: local.lines[0]?.text ?? "Reading the requests." }];
  for (const proposal of specialist) {
    if (!proposal) continue;
    lines.push({ from: capitalize(proposal.from), text: proposal.rationale });
    for (const concern of proposal.concerns) lines.push({ from: capitalize(proposal.from), text: concern });
  }
  if (lines.length < 4) lines.push(...local.lines.slice(1));

  const merged = await complete(
    SYSTEM,
    `${renderDigest(world)}\n\nRequests:\n${asked}\n\nSpecialist proposals:\n${JSON.stringify(specialist.filter(Boolean))}\n\nReturn the final EditBatch JSON. Include ops for every request, using the closest catalog sprite and terrain when there is no exact match. An empty ops array is only valid when every request asks for no change. requestIds must be ${JSON.stringify(requests.map((request) => request.id))} and baseVersion must be ${world.version}.`,
    editBatchSchema,
  );
  if (!merged) return null;
  lines.push({ from: "Director", text: "Merging the proposals into one batch." });
  return { batch: merged as EditBatch, lines };
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

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
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
