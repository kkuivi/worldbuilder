import { GRID_H, GRID_W, ROOM_H, ROOM_W, canEnter, mapSize } from "@worldbuilder/contracts";
import { applyOps } from "./apply.js";
function cleanSpot(spot, inside, world) {
    if (!spot || !Number.isInteger(spot.x) || !Number.isInteger(spot.y))
        return undefined;
    const w = spot.w == null ? 1 : spot.w;
    const h = spot.h == null ? 1 : spot.h;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
        return undefined;
    const width = inside ? ROOM_W : mapSize(world).w;
    const height = inside ? ROOM_H : mapSize(world).h;
    if (spot.x < 0 || spot.y < 0 || spot.x + w > width || spot.y + h > height)
        return undefined;
    return { x: spot.x, y: spot.y, w, h };
}
const LEASE_MS = 30_000;
const MAX_CHAT = 100;
const MAX_EVENTS = 200;
function highestIssuedId(roomId, dump) {
    const marker = `_${roomId}_`;
    const ids = [
        ...dump.queue.map((request) => request.id),
        ...dump.world.chat.flatMap((message) => [message.id, message.requestId ?? ""]),
        ...dump.world.entities.map((entity) => entity.id),
    ];
    let highest = 0;
    for (const id of ids) {
        const at = id.lastIndexOf(marker);
        if (at < 0)
            continue;
        const issued = Number(id.slice(at + marker.length));
        if (Number.isInteger(issued))
            highest = Math.max(highest, issued);
    }
    return highest;
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function rng(seed) {
    let state = seed || 1;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
function blankTerrain(fill) {
    return Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => fill));
}
function entity(id, sprite, kind, x, y, w, h, label) {
    return { id, sprite, kind, x, y, w, h, label, createdBy: "agent" };
}
export function starterWorld(worldId, name) {
    const random = rng(hashString(worldId));
    const terrain = blankTerrain("grass");
    const lakeX = 8 + Math.floor(random() * 6);
    const lakeY = 5 + Math.floor(random() * 4);
    const radiusX = 3;
    const radiusY = 2;
    for (let y = 0; y < GRID_H; y += 1) {
        for (let x = 0; x < GRID_W; x += 1) {
            const dx = (x - lakeX) / radiusX;
            const dy = (y - lakeY) / radiusY;
            if (dx * dx + dy * dy <= 1)
                terrain[y][x] = "water";
        }
    }
    for (let y = 0; y < GRID_H; y += 1) {
        for (let x = 0; x < GRID_W; x += 1) {
            if (terrain[y][x] !== "grass")
                continue;
            const nearWater = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ].some(([dx, dy]) => terrain[y + dy]?.[x + dx] === "water");
            if (nearWater)
                terrain[y][x] = "sand";
        }
    }
    const entities = [];
    const overlaps = (x, y, w, h) => entities.some((item) => x < item.x + item.w && x + w > item.x && y < item.y + item.h && y + h > item.y);
    const trees = ["tree_oak", "tree_pine", "tree_oak", "tree_pine"];
    for (let index = 0; index < trees.length; index += 1) {
        const options = [];
        for (let y = 0; y < GRID_H - 1; y += 1) {
            for (let x = 0; x < GRID_W; x += 1) {
                if (terrain[y][x] === "grass" && terrain[y + 1][x] === "grass" && !overlaps(x, y, 1, 2))
                    options.push([x, y]);
            }
        }
        const spot = options[Math.floor(random() * options.length)];
        if (!spot)
            break;
        const sprite = trees[index];
        entities.push(entity(`ent_start_tree_${index}`, sprite, "tree", spot[0], spot[1], 1, 2, sprite === "tree_oak" ? "Oak" : "Pine"));
    }
    for (let i = 0; i < 2; i += 1) {
        const options = [];
        for (let y = 0; y < GRID_H; y += 1) {
            for (let x = 0; x < GRID_W; x += 1) {
                if (terrain[y][x] === "grass" && !overlaps(x, y, 1, 1))
                    options.push([x, y]);
            }
        }
        const spot = options[Math.floor(random() * options.length)];
        if (!spot)
            break;
        entities.push(entity(`ent_start_rock_${i}`, "rock", "rock", spot[0], spot[1], 1, 1, "Rock"));
    }
    return {
        worldId,
        name,
        version: 1,
        terrain,
        entities,
        players: [],
        chat: [],
    };
}
export class WorldRoom {
    id;
    world = null;
    queue = [];
    events = [];
    seq = 0;
    idCounter = 0;
    constructor(id) {
        this.id = id;
    }
    dump() {
        return {
            world: this.world ? structuredClone(this.world) : starterWorld(this.id, "Untitled wilds"),
            queue: structuredClone(this.queue),
            events: structuredClone(this.events),
            seq: this.seq,
            started: this.world != null,
        };
    }
    load(dump) {
        if (!dump.started)
            return;
        this.world = dump.world;
        this.queue = dump.queue;
        this.events = dump.events;
        this.seq = dump.seq;
        this.idCounter = highestIssuedId(this.id, dump);
    }
    started() {
        return this.world != null;
    }
    currentSeq() {
        return this.seq;
    }
    start(name) {
        if (!this.world)
            this.world = starterWorld(this.id, name.trim() || "Untitled wilds");
        return this.view();
    }
    view() {
        if (!this.world)
            throw new Error("world has not started");
        return structuredClone(this.world);
    }
    pendingCount(now = Date.now()) {
        this.releaseExpired(now);
        return this.queue.filter((request) => request.status === "pending").length;
    }
    join(player) {
        const world = this.require();
        const name = player.name.trim().slice(0, 24);
        if (!name)
            throw new Error("name is required");
        const existing = world.players.find((item) => item.id === player.id);
        if (existing) {
            existing.name = name;
            existing.color = player.color;
        }
        else {
            world.players.push({ ...player, name });
            this.emit("player_joined", { player: { ...player, name } });
        }
        return this.view();
    }
    locate(playerId, inside) {
        const world = this.require();
        const player = world.players.find((item) => item.id === playerId);
        if (!player)
            return;
        const next = inside && world.entities.some((entity) => entity.id === inside && canEnter(entity)) ? inside : undefined;
        if (player.inside === next)
            return;
        player.inside = next;
        this.emit("player_joined", { player: { ...player } });
    }
    say(playerId, text, inside, focus, spot) {
        const world = this.require();
        const player = world.players.find((item) => item.id === playerId);
        if (!player)
            throw new Error("join the world before speaking");
        const clean = text.trim().slice(0, 400);
        if (!clean)
            throw new Error("say something first");
        const requestId = this.nextId("req");
        const message = {
            id: this.nextId("msg"),
            seq: this.seq + 1,
            at: new Date().toISOString(),
            from: playerId,
            role: "player",
            text: clean,
            requestId,
        };
        this.pushChat(message);
        this.queue.push({
            id: requestId,
            worldId: this.id,
            playerId,
            text: clean,
            at: message.at,
            inside,
            focus: focus && world.entities.some((entity) => entity.id === focus) ? focus : undefined,
            spot: cleanSpot(spot, inside, world),
            status: "pending",
        });
        this.emit("chat", { message });
        return { requestId, message };
    }
    claimBatch(workerId, now = Date.now()) {
        this.releaseExpired(now);
        const pending = this.queue.filter((request) => request.status === "pending");
        if (!pending.length || !this.world)
            return null;
        const leaseUntil = now + LEASE_MS;
        for (const request of pending) {
            request.status = "claimed";
            request.claimedBy = workerId;
            request.leaseUntil = leaseUntil;
        }
        return {
            requests: pending.map(({ status: _status, claimedBy: _claimedBy, leaseUntil: _leaseUntil, ...request }) => request),
            world: this.view(),
            baseVersion: this.world.version,
            leaseUntil,
        };
    }
    remove(id) {
        const world = this.require();
        const entity = world.entities.find((item) => item.id === id);
        if (!entity)
            return { ok: false, reason: "that is not on the map" };
        const result = applyOps(world, [{ op: "remove", id }]);
        if (result.applied.length === 0)
            return { ok: false, reason: result.rejected[0]?.reason ?? "that could not be removed" };
        this.world = result.world;
        this.world.version += 1;
        for (const player of this.world.players) {
            if (player.inside !== id)
                continue;
            player.inside = undefined;
            this.emit("player_joined", { player: { ...player } });
        }
        const previous = this.world.chat.at(-1);
        const message = previous ?? {
            id: this.nextId("msg"),
            seq: this.seq,
            at: new Date().toISOString(),
            from: "Director",
            role: "agent",
            text: "",
        };
        this.emit("edits", {
            version: this.world.version,
            sky: this.world.sky ?? "day",
            terrain: this.world.terrain,
            rise: this.world.rise,
            entities: this.world.entities,
            message,
            rejected: [],
            stale: false,
            colors: [],
            requestIds: [],
        });
        return { ok: true };
    }
    relocate(id, x, y) {
        const world = this.require();
        const entity = world.entities.find((item) => item.id === id);
        if (!entity)
            return { ok: false, reason: "that is not on the map" };
        const nextX = Math.round(x);
        const nextY = Math.round(y);
        if (entity.x === nextX && entity.y === nextY)
            return { ok: true };
        const result = applyOps(world, [{ op: "move", id, x: nextX, y: nextY }]);
        if (result.applied.length === 0)
            return { ok: false, reason: result.rejected[0]?.reason ?? "that spot is taken" };
        this.world = result.world;
        this.world.version += 1;
        const previous = this.world.chat.at(-1);
        const message = previous ?? {
            id: this.nextId("msg"),
            seq: this.seq,
            at: new Date().toISOString(),
            from: "Director",
            role: "agent",
            text: "",
        };
        this.emit("edits", {
            version: this.world.version,
            sky: this.world.sky ?? "day",
            terrain: this.world.terrain,
            rise: this.world.rise,
            entities: this.world.entities,
            message,
            rejected: [],
            stale: false,
            colors: [],
            requestIds: [],
        });
        return { ok: true };
    }
    applyEdits(batch, now = Date.now(), options) {
        const world = this.require();
        const known = batch.requestIds
            .map((id) => this.queue.find((request) => request.id === id && request.status !== "done") ?? this.queue.find((request) => request.id === id))
            .filter((request) => Boolean(request));
        const alreadyDone = batch.requestIds.length > 0 && known.length > 0 && known.every((request) => request.status === "done");
        if (alreadyDone && !options?.silent) {
            return { ok: true, version: world.version, applied: 0, rejected: [], stale: false };
        }
        const stale = batch.baseVersion !== world.version;
        const result = applyOps(world, batch.ops);
        this.world = result.world;
        const changed = result.applied.length > 0 || (!options?.silent && batch.reply.trim().length > 0);
        if (changed)
            this.world.version += 1;
        const message = options?.silent
            ? (this.world.chat.at(-1) ?? {
                id: this.nextId("msg"),
                seq: this.seq + 1,
                at: new Date(now).toISOString(),
                from: "Director",
                role: "agent",
                text: batch.reply.trim() || "I updated the map.",
                requestId: batch.requestIds[0],
            })
            : {
                id: this.nextId("msg"),
                seq: this.seq + 1,
                at: new Date(now).toISOString(),
                from: "Director",
                role: "agent",
                text: batch.reply.trim() || "I left the map as it was.",
                requestId: batch.requestIds[0],
            };
        if (!options?.silent)
            this.pushChat(message);
        for (const request of known) {
            request.status = "done";
            request.leaseUntil = undefined;
        }
        const colors = [
            ...new Set(batch.requestIds
                .map((id) => this.queue.find((request) => request.id === id)?.playerId)
                .map((playerId) => world.players.find((player) => player.id === playerId)?.color)
                .filter((color) => Boolean(color))),
        ];
        this.emit("edits", {
            version: this.world.version,
            sky: this.world.sky ?? "day",
            terrain: this.world.terrain,
            rise: this.world.rise,
            entities: this.world.entities,
            message,
            rejected: result.rejected,
            stale,
            colors,
            requestIds: batch.requestIds,
        });
        return {
            ok: result.rejected.length === 0,
            version: this.world.version,
            applied: result.applied.length,
            rejected: result.rejected,
            stale,
        };
    }
    postStatus(text, from = "Builder") {
        return this.emit("agent_status", { text, from });
    }
    releaseExpired(now = Date.now()) {
        let released = 0;
        for (const request of this.queue) {
            if (request.status === "claimed" && request.leaseUntil != null && request.leaseUntil <= now) {
                request.status = "pending";
                request.claimedBy = undefined;
                request.leaseUntil = undefined;
                released += 1;
            }
        }
        return released;
    }
    onAlarm(now = Date.now()) {
        return this.releaseExpired(now);
    }
    eventsSince(seq) {
        return this.events.filter((event) => event.seq > seq);
    }
    require() {
        if (!this.world)
            throw new Error("world has not started");
        return this.world;
    }
    pushChat(message) {
        if (!this.world)
            return;
        this.world.chat.push(message);
        if (this.world.chat.length > MAX_CHAT)
            this.world.chat.splice(0, this.world.chat.length - MAX_CHAT);
    }
    emit(kind, payload) {
        this.seq += 1;
        const event = { seq: this.seq, at: new Date().toISOString(), kind, payload };
        this.events.push(event);
        if (this.events.length > MAX_EVENTS)
            this.events.splice(0, this.events.length - MAX_EVENTS);
        return event;
    }
    nextId(prefix) {
        this.idCounter += 1;
        return `${prefix}_${this.id}_${this.idCounter}`;
    }
}
