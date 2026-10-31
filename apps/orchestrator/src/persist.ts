import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WorldState } from "@worldbuilder/contracts";
import type { RoomDump } from "@worldbuilder/engine";
import { env } from "./env";

export interface SavedRoom extends RoomDump {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface DiskFile {
  rooms: Record<string, SavedRoom>;
}

let supabase: {
  from: (table: string) => {
    upsert: (value: unknown, options?: unknown) => Promise<{ error: { message: string } | null }>;
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => {
        limit: (count: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
      };
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        };
      };
    };
  };
} | null = null;

if (env.supabaseUrl && env.supabaseKey) {
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(env.supabaseUrl, env.supabaseKey) as unknown as NonNullable<typeof supabase>;
}

export function loadDisk(): Record<string, SavedRoom> {
  try {
    const parsed = JSON.parse(readFileSync(env.dataFile, "utf8")) as DiskFile;
    return parsed.rooms ?? {};
  } catch {
    return {};
  }
}

export function saveDisk(rooms: Record<string, SavedRoom>): void {
  mkdirSync(dirname(env.dataFile), { recursive: true });
  writeFileSync(env.dataFile, JSON.stringify({ rooms }));
}

export async function upsertWorld(world: WorldState, createdBy: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("worlds").upsert({
    id: world.worldId,
    name: world.name,
    created_by: createdBy,
    last_version: world.version,
    player_count: world.players.length,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("Supabase worlds:", error.message);
}

export async function writeSnapshot(world: WorldState): Promise<void> {
  if (!supabase) return;
  const { chat: _chat, ...state } = world;
  const { error } = await supabase.from("world_snapshots").upsert(
    { world_id: world.worldId, version: world.version, state },
    { onConflict: "world_id,version" },
  );
  if (error) console.warn("Supabase snapshot:", error.message);
}

export async function loadRecent(): Promise<Array<{ id: string; name: string; playerCount: number; updatedAt: string }>> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("worlds").select("id,name,player_count,updated_at").order("updated_at", { ascending: false }).limit(12);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    playerCount: Number(row.player_count ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  }));
}
