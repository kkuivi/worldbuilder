import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

if (existsSync(resolve(root, ".env"))) {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

export const env = {
  port: Number(process.env.PORT ?? 8791),
  webPort: Number(process.env.WEB_PORT ?? 5174),
  llmKey: process.env.LLM_API_KEY ?? "",
  llmBase: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  llmFast: process.env.LLM_MODEL_FAST || "gpt-4o-mini",
  llmSmart: process.env.LLM_MODEL_SMART || process.env.LLM_MODEL_FAST || "gpt-4o-mini",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  relayKey: process.env.RELAY_API_KEY || process.env.RELAY_WORKSPACE || "",
  dataFile: resolve(root, ".data/rooms.json"),
};
