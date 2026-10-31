import {
  GRID_H,
  GRID_W,
  SPRITES,
  isSpriteId,
  type EditOp,
  type Entity,
  type EntityKind,
  type Terrain,
  type WorldState,
} from "@worldbuilder/contracts";

const WATER_FORBIDDEN = new Set<EntityKind>(["house", "tower", "castle", "tree"]);

export interface OpRejection {
  index: number;
  reason: string;
}

export interface ApplyOpsResult {
  world: WorldState;
  applied: EditOp[];
  rejected: OpRejection[];
  spawned: { index: number; id: string }[];
}

export function cloneWorld(world: WorldState): WorldState {
  return structuredClone(world);
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= GRID_W && y + h <= GRID_H;
}

function tilesOf(x: number, y: number, w: number, h: number): Array<[number, number]> {
  const tiles: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) tiles.push([x + dx, y + dy]);
  }
  return tiles;
}

function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function terrainAt(world: WorldState, x: number, y: number): Terrain | null {
  return world.terrain[y]?.[x] ?? null;
}

export function placementError(world: WorldState, entity: Entity, ignoreId?: string): string | null {
  if (!isSpriteId(entity.sprite)) return `unknown sprite ${entity.sprite}`;
  if (!inBounds(entity.x, entity.y, entity.w, entity.h)) return "outside the 24 by 16 grid";

  const tiles = tilesOf(entity.x, entity.y, entity.w, entity.h);
  const terrains = tiles.map(([x, y]) => terrainAt(world, x, y));
  if (terrains.some((terrain) => terrain == null)) return "outside the 24 by 16 grid";

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
  if (blocker) return `overlaps ${blocker.label}`;
  return null;
}

function rejectPaint(world: WorldState, op: Extract<EditOp, { op: "paint" }>): string | null {
  if (!inBounds(op.x, op.y, op.w, op.h)) return "paint is outside the grid";
  return world.terrain[op.y]?.[op.x] ? null : "paint is outside the grid";
}

let spawnCounter = 0;

function nextEntityId(): string {
  spawnCounter += 1;
  return `ent_${Date.now().toString(36)}_${spawnCounter.toString(36)}`;
}

function applyOne(world: WorldState, op: EditOp, spawned: { index: number; id: string }[], index: number): string | null {
  if (op.op === "paint") {
    const error = rejectPaint(world, op);
    if (error) return error;
    for (const [x, y] of tilesOf(op.x, op.y, op.w, op.h)) world.terrain[y][x] = op.terrain;
    return null;
  }

  if (op.op === "place") {
    const sprite = SPRITES[op.sprite];
    if (!sprite) return `unknown sprite ${op.sprite}`;
    const entity: Entity = {
      id: nextEntityId(),
      kind: sprite.kind,
      x: op.x,
      y: op.y,
      w: op.w ?? sprite.w,
      h: op.h ?? sprite.h,
      sprite: op.sprite,
      label: op.label.trim(),
      note: op.note?.trim() || undefined,
      createdBy: "agent",
    };
    if (!entity.label) return "place needs a label";
    const error = placementError(world, entity);
    if (error) return error;
    world.entities.push(entity);
    spawned.push({ index, id: entity.id });
    return null;
  }

  if (op.op === "remove") {
    const indexOf = world.entities.findIndex((entity) => entity.id === op.id);
    if (indexOf < 0) return `no entity ${op.id}`;
    world.entities.splice(indexOf, 1);
    return null;
  }

  if (op.op === "move") {
    const entity = world.entities.find((item) => item.id === op.id);
    if (!entity) return `no entity ${op.id}`;
    const next = { ...entity, x: op.x, y: op.y };
    const error = placementError(world, next, entity.id);
    if (error) return error;
    entity.x = op.x;
    entity.y = op.y;
    return null;
  }

  const entity = world.entities.find((item) => item.id === op.id);
  if (!entity) return `no entity ${op.id}`;
  const next: Entity = {
    ...entity,
    label: op.label?.trim() || entity.label,
    note: op.note !== undefined ? op.note.trim() || undefined : entity.note,
    sprite: op.sprite ?? entity.sprite,
    kind: op.sprite ? SPRITES[op.sprite].kind : entity.kind,
  };
  if (!next.label) return "label cannot be empty";
  if (op.sprite && (next.w !== entity.w || next.h !== entity.h)) {
    next.w = SPRITES[op.sprite].w;
    next.h = SPRITES[op.sprite].h;
  }
  const error = placementError(world, next, entity.id);
  if (error) return error;
  Object.assign(entity, next);
  return null;
}

export function applyOps(world: WorldState, ops: EditOp[]): ApplyOpsResult {
  const draft = cloneWorld(world);
  const applied: EditOp[] = [];
  const rejected: OpRejection[] = [];
  const spawned: { index: number; id: string }[] = [];

  ops.forEach((op, index) => {
    const reason = applyOne(draft, op, spawned, index);
    if (reason) rejected.push({ index, reason });
    else applied.push(op);
  });

  return { world: draft, applied, rejected, spawned };
}
