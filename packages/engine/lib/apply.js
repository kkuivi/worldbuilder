import { GRID_H, GRID_W, SPRITES, isSpriteId, modelFor, parseModel, portrayal, } from "@worldbuilder/contracts";
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
        createdBy: "agent",
    };
}
function nearestOpen(world, entity) {
    let best = null;
    for (let y = 0; y <= GRID_H - entity.h; y += 1) {
        for (let x = 0; x <= GRID_W - entity.w; x += 1) {
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
function inBounds(x, y, w, h) {
    return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= GRID_W && y + h <= GRID_H;
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
    if (!inBounds(entity.x, entity.y, entity.w, entity.h))
        return "outside the 24 by 16 grid";
    const tiles = tilesOf(entity.x, entity.y, entity.w, entity.h);
    const terrains = tiles.map(([x, y]) => terrainAt(world, x, y));
    if (terrains.some((terrain) => terrain == null))
        return "outside the 24 by 16 grid";
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
    const blocker = world.entities.find((other) => other.id !== ignoreId && overlaps(entity, other));
    if (blocker)
        return `overlaps ${blocker.label}`;
    return null;
}
function rejectPaint(world, op) {
    if (!inBounds(op.x, op.y, op.w, op.h))
        return "paint is outside the grid";
    return world.terrain[op.y]?.[op.x] ? null : "paint is outside the grid";
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
function nextEntityId() {
    spawnCounter += 1;
    return `ent_${Date.now().toString(36)}_${spawnCounter.toString(36)}`;
}
function applyOne(world, op, spawned, index) {
    if (op.op === "sky") {
        world.sky = op.value;
        return null;
    }
    if (op.op === "paint") {
        const error = rejectPaint(world, op);
        if (error)
            return error;
        for (const [x, y] of tilesOf(op.x, op.y, op.w, op.h))
            world.terrain[y][x] = op.terrain;
        return null;
    }
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
        world.entities.splice(indexOf, 1);
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
    const next = {
        ...entity,
        label: op.label?.trim() || entity.label,
        note: op.note !== undefined ? op.note.trim() || undefined : entity.note,
        sprite: op.sprite ?? entity.sprite,
        kind: op.sprite ? SPRITES[op.sprite].kind : entity.kind,
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
