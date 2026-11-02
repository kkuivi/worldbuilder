import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalModel } from "@worldbuilder/contracts";
import { env } from "./env";

const SHAPE_SYSTEM = `You design one object for a map made of simple 3D parts.
Return only JSON of the form {"model":"..."}.
The model is 4 to 12 lines separated by newline characters. Each line is: shape a b c RRGGBB x y z
shape is box, sphere, cone, or cylinder.
For a box, a is width, b is height, and c is depth.
For a sphere, a is the radius and b and c are 0.
For a cone or a cylinder, a is the radius, b is the height, and c is 0.
x and z are between -1 and 1. y is the center of the part and is between 0 and 1.6.
Every part sits on the ground or on another part, so y is at least half of that part's height.
Use the parts that make this one object recognizable. Include at least one sphere, cone, or cylinder.
Colors are 6 hex digits with no hash mark.`;

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let loaded = false;

function shapesFile(): string {
  return `${dirname(env.dataFile)}/shapes.json`;
}

function readCache(): void {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(readFileSync(shapesFile(), "utf8")) as Record<string, unknown>;
    for (const [key, spec] of Object.entries(parsed)) {
      if (typeof spec !== "string") continue;
      const accepted = canonicalModel(spec);
      if (accepted) memory.set(key, accepted);
    }
  } catch {
    loaded = true;
  }
}

function writeCache(): void {
  const file = shapesFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(Object.fromEntries(memory)));
}

function readModel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const model = (value as { model?: unknown }).model;
  if (typeof model === "string") return model;
  if (Array.isArray(model) && model.every((line) => typeof line === "string")) return model.join("\n");
  return null;
}

async function shapeHttp(key: string, extra: string): Promise<string | null> {
  if (!env.llmKey) return null;
  const response = await fetch(`${env.llmBase}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.llmKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.llmFast,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SHAPE_SYSTEM },
        { role: "user", content: `Build one ${key}. It should be recognizable from the side and sit on the ground.${extra ? ` ${extra}` : ""}` },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  return readModel(JSON.parse(content) as unknown);
}

async function askShape(key: string): Promise<string | null> {
  try {
    const first = await shapeHttp(key, "");
    const accepted = first ? canonicalModel(first) : null;
    if (accepted || first === null) return accepted;
  } catch {
    return null;
  }
  try {
    const second = await shapeHttp(key, "The last answer was rejected. Use 4 to 12 parts and at least one sphere, cone, or cylinder.");
    return second ? canonicalModel(second) : null;
  } catch {
    return null;
  }
}

export function lookupShape(key: string): Promise<string | null> {
  readCache();
  const saved = memory.get(key);
  if (saved) return Promise.resolve(saved);
  const running = pending.get(key);
  if (running) return running;
  const job = askShape(key).then((spec) => {
    if (!spec) {
      console.warn(`shape ${key} unavailable`);
      return null;
    }
    memory.set(key, spec);
    try {
      writeCache();
    } catch (error) {
      console.warn("shape cache skipped:", error instanceof Error ? error.message : error);
    }
    console.log(`shape ${key}`);
    return spec;
  }).finally(() => {
    pending.delete(key);
  });
  pending.set(key, job);
  return job;
}
