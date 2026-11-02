import { HILL_MAX, ROOM_H, STORY_MAX, ROOM_W, SPRITES, canEnter, fitGrow, isSpriteId, inventModel, isFurniture, mapSize, modelFor, parseModel, portrayal, usableModel, } from "@worldbuilder/contracts";
const WATER_FORBIDDEN = new Set(["house", "tower", "castle", "tree"]);
export function cloneWorld(world) {
    return structuredClone(world);
}
function probeEntity(op, x, y) {
    const sprite = SPRITES[op.sprite];
    if (!sprite)
        return null;
    const label = op.label.trim();
    if (!label)
        return null;
    return {
        id: "probe",
        kind: sprite.kind,
        x,
        y,
        w: op.w ?? sprite.w,
        h: op.h ?? sprite.h,
        sprite: op.sprite,
        label,
        inside: op.inside,
        createdBy: "agent",
    };
}
function nearestOpen(world, entity) {
    const width = entity.inside ? ROOM_W : mapSize(world).w;
    const height = entity.inside ? ROOM_H : mapSize(world).h;
    let best = null;
    for (let y = 0; y <= height - entity.h; y += 1) {
        for (let x = 0; x <= width - entity.w; x += 1) {
            if (placementError(world, { ...entity, x, y }))
                continue;
            const dx = x - entity.x;
            const dy = y - entity.y;
            const score = Math.abs(dx) + Math.abs(dy) + (dy < 0 ? 3 : 0);
            if (!best || score < best.score)
                best = { x, y, score };
        }
    }
    return best ? { x: best.x, y: best.y } : null;
}
function roadRun(world, entity, x, y) {
    const along = (axis) => {
        const cells = [{ x, y }];
        for (const step of [1, -1]) {
            for (let i = 1; i <= 5; i += 1) {
                const next = { x: axis === "x" ? x + step * i : x, y: axis === "y" ? y + step * i : y };
                if (placementError(world, { ...entity, ...next }))
                    break;
                cells.push(next);
            }
        }
        return cells;
    };
    const east = along("x");
    const south = along("y");
    return south.length > east.length ? south : east;
}
export function nudgeRejectedPlaces(world, ops) {
    const draft = cloneWorld(world);
    const fixed = [];
    for (const op of ops) {
        if (op.op !== "place")
            continue;
        const seeded = probeEntity(op, op.x, op.y);
        if (!seeded)
            continue;
        const origin = placementError(draft, seeded) ? nearestOpen(draft, seeded) : { x: op.x, y: op.y };
        if (!origin)
            continue;
        const cells = op.sprite === "road" ? roadRun(draft, { ...seeded, ...origin }, origin.x, origin.y) : [origin];
        for (const cell of cells) {
            const entity = probeEntity(op, cell.x, cell.y);
            if (!entity || placementError(draft, entity))
                continue;
            draft.entities.push({ ...entity, id: `nudge_${fixed.length}` });
            fixed.push({ ...op, x: cell.x, y: cell.y });
        }
    }
    return fixed;
}
function inBounds(world, x, y, w, h) {
    const size = mapSize(world);
    return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= size.w && y + h <= size.h;
}
function tilesOf(x, y, w, h) {
    const tiles = [];
    for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1)
            tiles.push([x + dx, y + dy]);
    }
    return tiles;
}
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function terrainAt(world, x, y) {
    return world.terrain[y]?.[x] ?? null;
}
export function placementError(world, entity, ignoreId) {
    if (!isSpriteId(entity.sprite))
        return `unknown sprite ${entity.sprite}`;
    if (entity.inside)
        return interiorError(world, entity, ignoreId);
    if (!inBounds(world, entity.x, entity.y, entity.w, entity.h))
        return "outside the map";
    const tiles = tilesOf(entity.x, entity.y, entity.w, entity.h);
    const terrains = tiles.map(([x, y]) => terrainAt(world, x, y));
    if (terrains.some((terrain) => terrain == null))
        return "outside the map";
    if (WATER_FORBIDDEN.has(entity.kind) && terrains.some((terrain) => terrain === "water")) {
        return `${entity.kind} cannot sit on water`;
    }
    if (entity.kind === "bridge" && terrains.some((terrain) => terrain !== "water" && terrain !== "sand")) {
        return "bridge must sit on water or sand";
    }
    if (entity.kind === "road" && terrains.some((terrain) => terrain === "water")) {
        return "road cannot sit on water";
    }
    if (entity.kind === "boat" && terrains.every((terrain) => terrain !== "water")) {
        return "boat needs water";
    }
    const blocker = world.entities.find((other) => !other.inside && other.id !== ignoreId && overlaps(entity, other));
    if (blocker)
        return `overlaps ${blocker.label}`;
    return null;
}
function interiorError(world, entity, ignoreId) {
    const host = world.entities.find((other) => other.id === entity.inside);
    if (!host || !canEnter(host))
        return "that building has no interior";
    if (entity.x < 0 || entity.y < 0 || entity.x + entity.w > ROOM_W || entity.y + entity.h > ROOM_H)
        return "outside the room";
    const blocker = world.entities.find((other) => other.inside === entity.inside && other.id !== ignoreId && overlaps(entity, other));
    if (blocker)
        return `overlaps ${blocker.label}`;
    return null;
}
function rejectPaint(world, op) {
    if (!inBounds(world, op.x, op.y, op.w, op.h))
        return "paint is outside the map";
    return world.terrain[op.y]?.[op.x] ? null : "paint is outside the map";
}
function ensureRise(world) {
    const size = mapSize(world);
    const current = world.rise ?? [];
    const rise = [];
    for (let y = 0; y < size.h; y += 1) {
        const row = current[y] ?? [];
        rise.push(Array.from({ length: size.w }, (_, x) => Math.max(0, Math.min(HILL_MAX, Math.floor(row[x] ?? 0)))));
    }
    world.rise = rise;
    return rise;
}
function raiseGround(world, op) {
    if (!inBounds(world, op.x, op.y, op.w, op.h))
        return "raise is outside the map";
    const by = Math.max(1, Math.min(3, Math.floor(op.by)));
    const rise = ensureRise(world);
    let changed = false;
    for (const [x, y] of tilesOf(op.x, op.y, op.w, op.h)) {
        const next = Math.min(HILL_MAX, (rise[y]?.[x] ?? 0) + by);
        if (world.terrain[y][x] !== "stone" || next !== rise[y][x])
            changed = true;
        world.terrain[y][x] = "stone";
        rise[y][x] = Math.max(rise[y][x] ?? 0, next);
    }
    return changed ? null : "the hill is already as tall as it can be";
}
function growMap(world, op) {
    const size = mapSize(world);
    const margins = fitGrow(size.w, size.h, op);
    if (margins.north + margins.east + margins.south + margins.west === 0)
        return "the map is already as large as it can be";
    const nextH = size.h + margins.north + margins.south;
    const nextW = size.w + margins.west + margins.east;
    const terrain = [];
    for (let y = 0; y < nextH; y += 1) {
        const sourceY = Math.min(size.h - 1, Math.max(0, y - margins.north));
        const row = [];
        for (let x = 0; x < nextW; x += 1) {
            const sourceX = Math.min(size.w - 1, Math.max(0, x - margins.west));
            row.push(world.terrain[sourceY]?.[sourceX] ?? "grass");
        }
        terrain.push(row);
    }
    world.terrain = terrain;
    if (world.rise) {
        const rise = [];
        for (let y = 0; y < nextH; y += 1) {
            const sourceY = Math.min(size.h - 1, Math.max(0, y - margins.north));
            const row = [];
            for (let x = 0; x < nextW; x += 1) {
                const sourceX = Math.min(size.w - 1, Math.max(0, x - margins.west));
                row.push(world.rise[sourceY]?.[sourceX] ?? 0);
            }
            rise.push(row);
        }
        world.rise = rise;
    }
    if (margins.west || margins.north) {
        for (const entity of world.entities) {
            if (entity.inside)
                continue;
            entity.x += margins.west;
            entity.y += margins.north;
        }
    }
    return null;
}
let spawnCounter = 0;
function madeSprite(sprite, label, model) {
    const name = label.trim();
    const words = name.split(/\s+/);
    const short = words.length <= 2 && name.toLowerCase() !== "sign";
    const kind = portrayal(name);
    if ((sprite === "prop" || sprite === "sign") && kind === "tree") {
        return { sprite: /\bpines?\b/i.test(name) ? "tree_pine" : "tree_oak" };
    }
    if (sprite === "prop" || (sprite === "sign" && short)) {
        return { sprite: "prop", model: modelFor(name, model) };
    }
    const supplied = model?.trim();
    return { sprite, model: supplied && parseModel(supplied) ? supplied : undefined };
}
function nextModel(entity, label, supplied) {
    const name = label?.trim() || entity.label;
    const changed = Boolean(label?.trim() && label.trim() !== entity.label);
    if (portrayal(name) !== "custom" || isFurniture(name))
        return inventModel(name);
    if (supplied && usableModel(supplied))
        return supplied.trim();
    if (changed)
        return inventModel(name);
    return entity.model;
}
function nextEntityId() {
    spawnCounter += 1;
    return `ent_${Date.now().toString(36)}_${spawnCounter.toString(36)}`;
}
function applyOne(world, op, spawned, index) {
    if (op.op === "sky") {
        world.sky = op.value;
        return null;
    }
    if (op.op === "grow")
        return growMap(world, op);
    if (op.op === "paint") {
        const error = rejectPaint(world, op);
        if (error)
            return error;
        for (const [x, y] of tilesOf(op.x, op.y, op.w, op.h)) {
            world.terrain[y][x] = op.terrain;
            if (world.rise?.[y])
                world.rise[y][x] = 0;
        }
        return null;
    }
    if (op.op === "raise")
        return raiseGround(world, op);
    if (op.op === "place") {
        const made = madeSprite(op.sprite, op.label, op.model);
        const sprite = SPRITES[made.sprite];
        if (!sprite)
            return `unknown sprite ${op.sprite}`;
        const entity = {
            id: nextEntityId(),
            kind: sprite.kind,
            x: op.x,
            y: op.y,
            w: op.w ?? sprite.w,
            h: op.h ?? sprite.h,
            sprite: made.sprite,
            label: op.label.trim(),
            note: op.note?.trim() || undefined,
            model: made.model,
            inside: op.inside,
            createdBy: "agent",
        };
        if (!entity.label)
            return "place needs a label";
        const error = placementError(world, entity);
        if (error)
            return error;
        world.entities.push(entity);
        spawned.push({ index, id: entity.id });
        return null;
    }
    if (op.op === "remove") {
        const indexOf = world.entities.findIndex((entity) => entity.id === op.id);
        if (indexOf < 0)
            return `no entity ${op.id}`;
        const removed = world.entities[indexOf];
        world.entities.splice(indexOf, 1);
        if (removed && canEnter(removed)) {
            for (let i = world.entities.length - 1; i >= 0; i -= 1) {
                if (world.entities[i]?.inside === removed.id)
                    world.entities.splice(i, 1);
            }
        }
        return null;
    }
    if (op.op === "move") {
        const entity = world.entities.find((item) => item.id === op.id);
        if (!entity)
            return `no entity ${op.id}`;
        const next = { ...entity, x: op.x, y: op.y };
        const error = placementError(world, next, entity.id);
        if (error)
            return error;
        entity.x = op.x;
        entity.y = op.y;
        return null;
    }
    const entity = world.entities.find((item) => item.id === op.id);
    if (!entity)
        return `no entity ${op.id}`;
    if (op.stories !== undefined) {
        const stories = Math.max(1, Math.min(STORY_MAX, Math.floor(op.stories)));
        const growing = stories > (entity.stories ?? 1);
        if (!growing && op.label === undefined && op.sprite === undefined && op.note === undefined && op.model === undefined) {
            return "that building is already as tall as it can be";
        }
        if (growing)
            entity.stories = stories;
        if (op.label === undefined && op.sprite === undefined && op.note === undefined && op.model === undefined)
            return null;
    }
    const next = {
        ...entity,
        label: op.label?.trim() || entity.label,
        note: op.note !== undefined ? op.note.trim() || undefined : entity.note,
        sprite: op.sprite ?? entity.sprite,
        kind: op.sprite ? SPRITES[op.sprite].kind : entity.kind,
        model: nextModel(entity, op.label, op.model),
    };
    if (!next.label)
        return "label cannot be empty";
    if (op.sprite && (next.w !== entity.w || next.h !== entity.h)) {
        next.w = SPRITES[op.sprite].w;
        next.h = SPRITES[op.sprite].h;
    }
    const error = placementError(world, next, entity.id);
    if (error)
        return error;
    Object.assign(entity, next);
    return null;
}
export function applyOps(world, ops) {
    const draft = cloneWorld(world);
    const applied = [];
    const rejected = [];
    const spawned = [];
    ops.forEach((op, index) => {
        const reason = applyOne(draft, op, spawned, index);
        if (reason)
            rejected.push({ index, reason });
        else
            applied.push(op);
    });
    return { world: draft, applied, rejected, spawned };
}
