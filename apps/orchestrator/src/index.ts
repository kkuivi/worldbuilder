import { existsSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve, sep } from "node:path";
import type { Player, WorldState } from "@worldbuilder/contracts";
import { PLAYER_COLORS } from "@worldbuilder/contracts";
import { WorldRoom, type RoomDump } from "@worldbuilder/engine";
import { env } from "./env";
import { composeBatch, mirrorRelay, repairBatch } from "./llm";
import { loadDisk, loadRecent, saveDisk, upsertWorld, writeSnapshot, type SavedRoom } from "./persist";

interface SocketData {
  roomId: string;
}

const rooms = new Map<string, WorldRoom>();
const meta = new Map<string, { createdAt: string; updatedAt: string; createdBy: string }>();
const watched = new Set<string>();
const gathering = new Map<string, { until?: number; working: boolean }>();
type BunSocket = import("bun").ServerWebSocket<SocketData>;
const sockets = new Map<string, Set<BunSocket>>();
const quietTimers = new Map<string, ReturnType<typeof setTimeout>>();
const leaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function roomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i += 1) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return rooms.has(code) ? roomCode() : code;
}

function remember(room: WorldRoom, createdBy: string, createdAt = new Date().toISOString()): void {
  const current = meta.get(room.id);
  meta.set(room.id, {
    createdAt: current?.createdAt ?? createdAt,
    updatedAt: new Date().toISOString(),
    createdBy: current?.createdBy ?? createdBy,
  });
  scheduleSave();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const saved: Record<string, SavedRoom> = {};
    for (const [id, room] of rooms) {
      const info = meta.get(id);
      if (!room.started() || !info) continue;
      saved[id] = { ...room.dump(), createdAt: info.createdAt, updatedAt: info.updatedAt, createdBy: info.createdBy };
    }
    saveDisk(saved);
  }, 150);
}

function openRoom(id: string, dump?: RoomDump): WorldRoom {
  const existing = rooms.get(id);
  if (existing) return existing;
  const room = new WorldRoom(id);
  if (dump?.started) room.load(dump);
  rooms.set(id, room);
  sockets.set(id, sockets.get(id) ?? new Set());
  return room;
}

function broadcast(room: WorldRoom, afterSeq: number): void {
  const events = room.eventsSince(afterSeq);
  const clients = sockets.get(room.id);
  if (!clients || !events.length) return;
  for (const event of events) {
    const packet = JSON.stringify({ type: "event", event });
    for (const socket of clients) socket.send(packet);
  }
}

function armLease(room: WorldRoom, leaseUntil: number): void {
  const current = leaseTimers.get(room.id);
  if (current) clearTimeout(current);
  leaseTimers.set(
    room.id,
    setTimeout(() => {
      room.onAlarm(Date.now());
    }, Math.max(0, leaseUntil - Date.now())),
  );
}

function scheduleQuietSnapshot(room: WorldRoom): void {
  const current = quietTimers.get(room.id);
  if (current) clearTimeout(current);
  quietTimers.set(
    room.id,
    setTimeout(() => {
      const world = room.view();
      void writeSnapshot(world);
    }, 60_000),
  );
}

async function runBatch(room: WorldRoom): Promise<void> {
  const claimed = room.claimBatch("orchestrator");
  if (!claimed) return;
  armLease(room, claimed.leaseUntil);
  const world = room.view();
  const requests = claimed.requests.map((request) => ({
    ...request,
    playerName: world.players.find((player) => player.id === request.playerId)?.name ?? "Someone",
  }));
  const beforeStatus = room.currentSeq();
  const composed = await composeBatch(claimed.world, requests);
  for (const line of composed.lines) room.postStatus(line.text, line.from);
  broadcast(room, beforeStatus);
  void mirrorRelay(room.id, composed.lines);

  const before = room.currentSeq();
  let result = room.applyEdits(composed.batch);
  if (result.rejected.length > 0) {
    const repaired = await repairBatch(room.view(), composed.batch, result.rejected);
    if (repaired) result = room.applyEdits({ ...repaired, requestIds: composed.batch.requestIds, baseVersion: room.view().version });
  }
  broadcast(room, before);
  const next = room.view();
  remember(room, meta.get(room.id)?.createdBy ?? "agent");
  void upsertWorld(next, meta.get(room.id)?.createdBy ?? "agent");
  if (next.version % 5 === 0) void writeSnapshot(next);
  scheduleQuietSnapshot(room);
  console.log(`${room.id} v${result.version} applied ${result.applied} rejected ${result.rejected.length}`);
}

function ensurePlayer(input: Partial<Player> | undefined, fallbackName: string): Player {
  const requested = input?.color ?? "";
  const color = (PLAYER_COLORS as readonly string[]).includes(requested) ? requested : PLAYER_COLORS[0];
  return {
    id: input?.id && input.id.length < 80 ? input.id : crypto.randomUUID(),
    name: (input?.name ?? fallbackName).trim().slice(0, 24) || fallbackName,
    color,
    joinedAt: new Date().toISOString(),
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-length") === "0") return {};
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

function lanHost(): string | null {
  try {
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family === "IPv4" && !entry.internal) return entry.address;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function snapshotList() {
  return [...rooms.values()]
    .filter((room) => room.started())
    .map((room) => {
      const world = room.view();
      const info = meta.get(room.id);
      return {
        id: room.id,
        name: world.name,
        playerCount: world.players.length,
        updatedAt: info?.updatedAt ?? "",
        version: world.version,
      };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

const disk = loadDisk();
for (const [id, saved] of Object.entries(disk)) {
  openRoom(id, saved);
  meta.set(id, { createdAt: saved.createdAt, updatedAt: saved.updatedAt, createdBy: saved.createdBy });
  watched.add(id);
}

setInterval(() => {
  for (const id of watched) {
    const room = rooms.get(id);
    if (!room?.started()) continue;
    const state = gathering.get(id) ?? { working: false };
    if (state.working) continue;
    const pending = room.pendingCount();
    if (!pending) {
      state.until = undefined;
      gathering.set(id, state);
      continue;
    }
    if (!state.until) {
      state.until = Date.now() + 2500;
      const before = room.currentSeq();
      room.postStatus(`Builder is reading ${pending} request${pending === 1 ? "" : "s"}`, "Builder");
      broadcast(room, before);
      gathering.set(id, state);
      continue;
    }
    if (Date.now() < state.until) continue;
    state.working = true;
    state.until = undefined;
    gathering.set(id, state);
    void runBatch(room).finally(() => {
      state.working = false;
    });
  }
}, 500);

function onSocketMessage(socket: BunSocket, raw: string | Buffer): void {
  const room = rooms.get(socket.data.roomId);
  if (!room?.started()) return;
  let message: { type?: string; player?: Player; playerId?: string; text?: string; since?: number };
  try {
    message = JSON.parse(String(raw));
  } catch {
    socket.send(JSON.stringify({ type: "error", error: "bad message" }));
    return;
  }
  try {
    const before = room.currentSeq();
    if (message.type === "join" && message.player) {
      const player = ensurePlayer(message.player, "Player");
      room.join(player);
      remember(room, meta.get(room.id)?.createdBy ?? player.id);
      socket.send(JSON.stringify({ type: "state", world: room.view(), events: room.eventsSince(0) }));
    } else if (message.type === "say" && message.playerId && message.text) {
      room.say(message.playerId, message.text);
      remember(room, meta.get(room.id)?.createdBy ?? message.playerId);
    } else if (message.type === "subscribe") {
      socket.send(JSON.stringify({ type: "state", world: room.view(), events: room.eventsSince(message.since ?? 0) }));
    }
    broadcast(room, before);
  } catch (error) {
    socket.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "request failed" }));
  }
}

Bun.serve<SocketData>({
  port: env.port,
  hostname: "0.0.0.0",
  fetch(request, server) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });

    if (url.pathname.startsWith("/ws/")) {
      const roomId = url.pathname.split("/")[2]?.toUpperCase() ?? "";
      const upgraded = server.upgrade(request, { data: { roomId } });
      return upgraded ? undefined : json({ error: "websocket upgrade failed" }, 400);
    }

    if (!url.pathname.startsWith("/api") && url.pathname !== "/health") {
      const page = serveWeb(url);
      if (page) return page;
    }

    return route(request, url);
  },
  websocket: {
    open(socket) {
      const room = rooms.get(socket.data.roomId);
      if (!room?.started()) {
        socket.close();
        return;
      }
      const group = sockets.get(socket.data.roomId) ?? new Set<BunSocket>();
      group.add(socket);
      sockets.set(socket.data.roomId, group);
      watched.add(socket.data.roomId);
    },
    message(socket, message) {
      onSocketMessage(socket, message);
    },
    close(socket) {
      sockets.get(socket.data.roomId)?.delete(socket);
    },
  },
});

function serveWeb(url: URL): Response | null {
  const indexPath = resolve(env.webRoot, "index.html");
  if (!existsSync(indexPath)) return null;

  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return new Response("not found", { status: 400 });
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(env.webRoot, relative);
  const rootPrefix = env.webRoot.endsWith(sep) ? env.webRoot : `${env.webRoot}${sep}`;
  if (target !== env.webRoot && !target.startsWith(rootPrefix)) return new Response("not found", { status: 404 });

  if (existsSync(target) && statSync(target).isFile()) {
    const headers = new Headers();
    if (relative.startsWith("assets/")) headers.set("cache-control", "public, max-age=31536000, immutable");
    if (relative === "index.html") headers.set("cache-control", "no-cache");
    return new Response(Bun.file(target), { headers });
  }
  if (relative.includes(".")) return new Response("not found", { status: 404 });
  return new Response(Bun.file(indexPath), { headers: { "cache-control": "no-cache" } });
}

async function route(request: Request, url: URL): Promise<Response> {
  if (url.pathname === "/health") return json({ ok: true });
  if (url.pathname === "/api/lan") {
    const host = lanHost();
    return json({ origin: host ? `http://${host}:${env.webPort}` : null });
  }
  if (url.pathname === "/api/worlds" && request.method === "GET") {
    const remote = await loadRecent();
    const local = snapshotList();
    const merged = new Map(local.map((world) => [world.id, world]));
    for (const world of remote) if (!merged.has(world.id)) merged.set(world.id, { ...world, version: 0 });
    return json({ worlds: [...merged.values()] });
  }

  if (url.pathname === "/api/worlds" && request.method === "POST") {
    const body = await readJson(request);
    const player = ensurePlayer(body.player as Partial<Player> | undefined, "Player");
    const id = roomCode();
    const room = openRoom(id);
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : "Untitled wilds";
    room.start(name);
    room.join(player);
    remember(room, player.id);
    watched.add(id);
    const world = room.view();
    void upsertWorld(world, player.id);
    return json({ roomId: id, player, world });
  }

  const match = url.pathname.match(/^\/api\/worlds\/([A-Za-z0-9]{4})(?:\/(join|say|state|watch|socket))?$/);
  if (!match) return json({ error: "not found" }, 404);
  const id = match[1].toUpperCase();
  const action = match[2] ?? "";
  const room = rooms.get(id);

  if (action === "state" && request.method === "GET") {
    if (!room?.started()) return json({ error: "world not found" }, 404);
    const since = Number(url.searchParams.get("since") ?? 0);
    return json({ world: room.view(), events: room.eventsSince(Number.isFinite(since) ? since : 0) });
  }

  if (action === "watch" && request.method === "POST") {
    if (!room?.started()) return json({ error: "world not found" }, 404);
    watched.add(id);
    return json({ ok: true });
  }

  if (action === "socket" && request.method === "POST") {
    if (!room?.started()) return json({ error: "world not found" }, 404);
    const host = request.headers.get("host") ?? `localhost:${env.port}`;
    const proto = request.headers.get("x-forwarded-proto") === "https" ? "wss" : "ws";
    return json({ websocketUrl: `${proto}://${host}/ws/${id}`, local: true });
  }

  if (action === "join" && request.method === "POST") {
    if (!room?.started()) return json({ error: "world not found" }, 404);
    const body = await readJson(request);
    const player = ensurePlayer(body.player as Partial<Player> | undefined, "Player");
    const before = room.currentSeq();
    room.join(player);
    remember(room, meta.get(id)?.createdBy ?? player.id);
    watched.add(id);
    broadcast(room, before);
    void upsertWorld(room.view(), meta.get(id)?.createdBy ?? player.id);
    return json({ player, world: room.view(), events: room.eventsSince(0) });
  }

  if (action === "say" && request.method === "POST") {
    if (!room?.started()) return json({ error: "world not found" }, 404);
    const body = await readJson(request);
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const text = typeof body.text === "string" ? body.text : "";
    const before = room.currentSeq();
    const said = room.say(playerId, text);
    remember(room, meta.get(id)?.createdBy ?? playerId);
    watched.add(id);
    broadcast(room, before);
    return json(said);
  }

  return json({ error: "not found" }, 404);
}

console.log(`world builder listening on http://localhost:${env.port}`);

export type { WorldState };
