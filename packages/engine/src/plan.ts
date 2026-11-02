import {
  GRID_H,
  GRID_W,
  MAP_STEP,
  ROOM_H,
  ROOM_W,
  SPRITES,
  canEnter,
  colorWord,
  coloredNouns,
  animalNames,
  fitGrow,
  furnitureNames,
  inventModel,
  isFurniture,
  mapSize,
  portrayal,
  type EditBatch,
  type EditOp,
  type Entity,
  type GrowMargins,
  type SpriteId,
  type Terrain,
  type WorldState,
} from "@worldbuilder/contracts";
import { applyOps, placementError } from "./apply.js";

export interface PlanRequest {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  inside?: string;
  focus?: string;
  spot?: { x: number; y: number; w?: number; h?: number };
}

export interface StatusLine {
  from: string;
  text: string;
}

const TAGS: Array<[RegExp, string]> = [
  [/castle|fortress|keep|palace/, "castle"],
  [/flood|moat|drown/, "flood"],
  [/river|stream|creek/, "river"],
  [/lake|pond/, "lake"],
  [/winter|snow|frozen|ice/, "winter"],
  [/beach|shore|ocean|sea/, "beach"],
  [/village|town|hamlet|houses/, "village"],
  [/forest|woods|grove|trees/, "forest"],
  [/tower|spire/, "tower"],
  [/bridge/, "bridge"],
  [/road|path|lane/, "road"],
  [/campfire|camp\b|fire/, "campfire"],
  [/boat|ship|sail/, "boat"],
  [/flower|garden/, "flowers"],
  [/knight/, "knight"],
  [/merchant|trader|shop/, "merchant"],
  [/child|kid/, "child"],
  [/villager|person|people|npc|character/, "villager"],
  [/cat/, "cat"],
  [/dog|hound/, "dog"],
  [/sign|plaque/, "sign"],
  [/well/, "well"],
  [/mountain|hill|cliff/, "hill"],
  [/dirt|mud/, "dirt"],
  [/desert|dune/, "desert"],
  [/remove|delete|clear away|get rid/, "remove"],
];

const PROPS: Array<[RegExp, string]> = [
  [/\b(cars?|trucks?|bus|buses|vans?|taxi|jeeps?|automobiles?|wagons?)\b/i, "Car"],
  [/\b(planes?|airplanes?|jets?|helicopters?|rockets?|spaceships?)\b/i, "Plane"],
  [/\b(dragons?|dinosaurs?|monsters?)\b/i, "Dragon"],
  [/\b(horses?|ponies|pony)\b/i, "Horse"],
  [/\b(cows?|cattle|bulls?|oxen|ox)\b/i, "Cow"],
  [/\b(birds?|eagles?|chickens?|ducks?)\b/i, "Bird"],
  [/\b(bikes?|bicycles?|motorcycles?|scooters?)\b/i, "Bike"],
  [/\btents?\b/i, "Tent"],
  [/\b(fish|fishes|sharks?|whales?)\b/i, "Fish"],
  [/\b(robots?|androids?)\b/i, "Robot"],
  [/\b(barrels?|kegs?)\b/i, "Barrel"],
  [/\b(chests?|treasures?)\b/i, "Chest"],
  [/\b(statues?|monuments?)\b/i, "Statue"],
  [/\bballoons?\b/i, "Balloon"],
  [/\bbenches\b|\bbench\b/i, "Bench"],
  [/\b(lanterns?|lamps?)\b/i, "Lamp"],
];

export function growAsk(text: string): GrowMargins | null {
  const lower = text.toLowerCase();
  const aboutMap = /\b(map|world|grid|land)\b/.test(lower) && /\b(expand|bigger|larger|enlarge|extend|grow|wider)\b/.test(lower);
  const moreRoom = /\bmore (land|room|space|ground)\b/.test(lower);
  const expandEdge = /\bexpand\b/.test(lower) && /\b(north|south|east|west)\b/.test(lower);
  if (!aboutMap && !moreRoom && !expandEdge) return null;
  if (!/\b(north|south|east|west)\b/.test(lower)) return { north: MAP_STEP, east: MAP_STEP, south: MAP_STEP, west: MAP_STEP };
  return {
    north: /\bnorth\b/.test(lower) ? 6 : 0,
    south: /\bsouth\b/.test(lower) ? 6 : 0,
    east: /\beast\b/.test(lower) ? 8 : 0,
    west: /\bwest\b/.test(lower) ? 8 : 0,
  };
}

function onlyGrow(text: string): boolean {
  if (!growAsk(text)) return false;
  const rest = text
    .toLowerCase()
    .replace(/\b(please|thanks|now|just|can you|could you|add|place|put|give us|give me)\b/g, " ")
    .replace(/\b(expand|bigger|larger|enlarge|extended|extend|grow|growing|wider|more)\b/g, " ")
    .replace(/\b(the|a|an|map|world|grid|land|room|space|ground|to|on|north|south|east|west|side|sides|make|made|it|should|be|and)\b/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
  return rest.length === 0;
}

function askedGrowth(requests: PlanRequest[]): GrowMargins | null {
  const margins = { north: 0, east: 0, south: 0, west: 0 };
  let found = false;
  for (const request of requests) {
    const asked = growAsk(request.text);
    if (!asked) continue;
    found = true;
    margins.north = Math.max(margins.north, asked.north);
    margins.east = Math.max(margins.east, asked.east);
    margins.south = Math.max(margins.south, asked.south);
    margins.west = Math.max(margins.west, asked.west);
  }
  return found ? margins : null;
}

function growOp(margins: GrowMargins): EditOp {
  return { op: "grow", north: margins.north, east: margins.east, south: margins.south, west: margins.west };
}

function growReply(width: number, height: number, margins: GrowMargins): string {
  const nextW = width + margins.west + margins.east;
  const nextH = height + margins.north + margins.south;
  if (nextW === width && nextH === height) return "The map is already as large as it can be.";
  return `I expanded the map to ${nextW} by ${nextH}.`;
}

export function supplementGrow(requests: PlanRequest[], world: WorldState, chosen: EditOp[]): EditOp[] {
  const asked = askedGrowth(requests);
  if (!asked) return chosen;
  const margins = fitGrow(mapSize(world).w, mapSize(world).h, asked);
  if (margins.north + margins.east + margins.south + margins.west === 0) return chosen;
  if (chosen.some((op) => op.op === "grow")) return chosen;
  return [...chosen, growOp(margins)].slice(0, 48);
}

export function skyAsk(requests: PlanRequest[]): "day" | "night" | null {
  const text = requests.map((request) => request.text).join(" \n ");
  let sky: "day" | "night" | null = null;
  for (const match of text.matchAll(/\b(night(?:time)?|night\s+time|after dark|moonlight|daytime|day\s+time|sunrise|morning|day)\b/gi)) {
    const word = match[1].toLowerCase();
    sky = word.startsWith("night") || word === "after dark" || word === "moonlight" ? "night" : "day";
  }
  return sky;
}

function sameKind(noun: string, label: string, sprite: SpriteId): boolean {
  const asked = portrayal(noun);
  if (asked === "tree" && (sprite === "tree_oak" || sprite === "tree_pine" || portrayal(label) === "tree")) return true;
  if (asked !== "custom" && portrayal(label) === asked) return true;
  const stem = noun.replace(/(es|s)$/, "");
  return stem.length > 2 && `${label} ${sprite}`.toLowerCase().includes(stem);
}

function motionedNouns(text: string): Array<{ motion: string; noun: string }> {
  const found: Array<{ motion: string; noun: string }> = [];
  const pattern = /\b(flying|swimming)\s+(?:little\s+|small\s+|large\s+|big\s+)?([a-z]{3,})/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]?.toLowerCase() ?? "";
    const noun = match[2]?.toLowerCase();
    if (!noun) continue;
    found.push({ motion: raw.charAt(0).toUpperCase() + raw.slice(1), noun });
  }
  return found;
}

export function carryMotion(requests: PlanRequest[], ops: EditOp[]): EditOp[] {
  const moves = requests.flatMap((request) => motionedNouns(request.text));
  if (!moves.length) return ops;
  return ops.map((op) => {
    if (op.op !== "place" || /\b(flying|swimming)\b/i.test(op.label)) return op;
    const hit = moves.find((move) => sameKind(move.noun, op.label, op.sprite));
    if (!hit) return op;
    return { ...op, label: `${hit.motion} ${op.label}`.slice(0, 40) };
  });
}

export function carryColor(requests: PlanRequest[], ops: EditOp[]): EditOp[] {
  const paints = requests.flatMap((request) => coloredNouns(request.text));
  if (!paints.length) return ops;
  return ops.map((op) => {
    if (op.op !== "place" || colorWord(op.label)) return op;
    const hit = paints.find((paint) => sameKind(paint.noun, op.label, op.sprite));
    if (!hit) return op;
    return { ...op, label: `${hit.color} ${op.label}`.slice(0, 40) };
  });
}

export function supplementSky(requests: PlanRequest[], chosen: EditOp[], _local: EditOp[]): EditOp[] {
  const wanted = skyAsk(requests);
  if (!wanted) return chosen;
  if (chosen.some((op) => op.op === "sky" && op.value === wanted)) return chosen;
  const next: EditOp[] = [];
  for (const op of chosen) if (op.op !== "sky") next.push(op);
  next.push({ op: "sky", value: wanted });
  return next.slice(0, 48);
}

function mentionedProps(requests: PlanRequest[]): string[] {
  const found: string[] = [];
  const text = requests.map((request) => request.text).join(" ");
  for (const [pattern, label] of PROPS) if (pattern.test(text) && !isFurniture(label) && !found.includes(label)) found.push(label);
  for (const label of animalNames(text)) if (!found.includes(label)) found.push(label);
  return found;
}

function hostFor(request: PlanRequest, world: WorldState): Entity | null {
  if (request.inside) {
    const direct = world.entities.find((entity) => entity.id === request.inside && canEnter(entity));
    if (direct) return direct;
  }
  const match = request.text.match(/\b(?:inside|into|in)\s+(?:the\s+)?([a-z0-9][a-z0-9 '-]{0,24})/i);
  if (!match?.[1]) return null;
  const phrase = (match[1].toLowerCase().split(/\b(?:and|with|so|then)\b/)[0] ?? "").trim();
  const keys = phrase.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  let best: { entity: Entity; score: number } | null = null;
  for (const entity of world.entities) {
    if (!canEnter(entity)) continue;
    const hay = `${entity.label} ${entity.kind}`.toLowerCase();
    let score = 0;
    for (const key of keys) if (hay.includes(key)) score += 2;
    if (/\b(house|cottage|cabin)\b/.test(phrase) && entity.kind === "house") score += 1;
    if (score > 0 && (!best || score > best.score)) best = { entity, score };
  }
  return best?.entity ?? null;
}

function roomSpot(world: WorldState, ops: EditOp[], hostId: string): { x: number; y: number } | null {
  const draft = applyOps(world, ops).world;
  for (let y = 0; y <= ROOM_H - 1; y += 1) {
    for (let x = 0; x <= ROOM_W - 1; x += 1) {
      const probe: Entity = {
        id: "probe",
        kind: "custom",
        x,
        y,
        w: 1,
        h: 1,
        sprite: "prop",
        label: "Furniture",
        inside: hostId,
        createdBy: "agent",
      };
      if (!placementError(draft, probe)) return { x, y };
    }
  }
  return null;
}

function titled(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(please|thanks|now)\b/gi, "")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 40);
}

function withoutColor(label: string): string {
  return label.replace(/^(?:red|blue|green|yellow|orange|purple|black|white|golden|gold|silver|pink|brown)\s+/i, "").trim();
}

export function wantsFocusEdit(text: string, entity: Entity): boolean {
  if (skyAsk([{ id: "focus", playerId: "focus", playerName: "focus", text }])) return false;
  const lower = text.toLowerCase();
  if (/\b(add|place|put|build|create)\b/.test(lower) && !/\b(it|this|that)\b/.test(lower)) return false;
  if (/\b(it|this|that)\b/.test(lower)) return true;
  const label = entity.label.toLowerCase();
  if (label.length > 2 && lower.includes(label)) return true;
  return /\b(remove|delete|rename|recolor|repaint)\b/.test(lower);
}

function focusEntity(request: PlanRequest, world: WorldState): Entity | null {
  if (!request.focus) return null;
  const entity = world.entities.find((item) => item.id === request.focus);
  if (!entity || !wantsFocusEdit(request.text, entity)) return null;
  return entity;
}

export function focusEdits(entity: Entity, text: string): EditOp[] {
  if (/\b(remove|delete|erase)\b/i.test(text)) return [{ op: "remove", id: entity.id }];
  let label = entity.label;
  const called = text.match(/\b(?:rename(?:\s+it)?|call\s+it|name\s+it)\s+(?:to\s+)?["']?([a-z0-9][a-z0-9 '-]{0,30})/i);
  const swapped = furnitureNames(text)[0] ?? animalNames(text)[0];
  const into = text.match(/\b(?:into|to)\s+(?:a|an)\s+([a-z][a-z0-9 '-]{1,30})/i);
  if (called?.[1]) label = titled(called[1]);
  else if (swapped && swapped.toLowerCase() !== withoutColor(entity.label).toLowerCase()) label = swapped;
  else if (into?.[1]) label = titled(into[1]);
  const color = colorWord(text);
  if (color) label = `${color} ${withoutColor(label)}`.trim();
  const noted = text.match(/\b(?:add\s+a\s+note|note|story)\s+(?:that\s+|about\s+)?(.{3,140})/i);
  const note = noted?.[1]?.trim();
  if (label === entity.label && !note) return [];
  const next: EditOp = { op: "update", id: entity.id, label: label.slice(0, 40) };
  if (note) next.note = note.slice(0, 160);
  const asTree = portrayal(label) === "tree";
  const asProp = portrayal(label) === "animal" || isFurniture(label) || (into?.[1] && portrayal(label) === "custom");
  const sprite = asTree ? (/\bpines?\b/i.test(label) ? "tree_pine" : "tree_oak") : asProp ? "prop" : undefined;
  if (sprite && sprite !== entity.sprite) return [{ ...next, sprite }];
  return [next];
}

function focusReply(ops: EditOp[]): string {
  const lines = ops.map((op) => {
    if (op.op === "remove") return "I removed the selected piece";
    if (op.op === "update" && op.label) return `I changed the selection to ${op.label}`;
    return "";
  });
  const text = lines.filter(Boolean).join(". ");
  return text ? `${text}.` : "";
}

export function carryFocus(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[] {
  const edits = requests.flatMap((request) => {
    const entity = focusEntity(request, world);
    return entity ? focusEdits(entity, request.text) : [];
  });
  if (!edits.length) return ops;
  const handled = requests.filter((request) => focusEntity(request, world)).length;
  if (handled === requests.length) return edits.slice(0, 48);
  const nouns = new Set(
    requests
      .filter((request) => focusEntity(request, world))
      .flatMap((request) => [...furnitureNames(request.text), ...animalNames(request.text)].map((label) => label.toLowerCase())),
  );
  const kept = ops.filter((op) => {
    if (op.op !== "place") return true;
    const label = op.label.toLowerCase();
    for (const noun of nouns) if (label.includes(noun)) return false;
    return true;
  });
  return [...edits, ...kept].slice(0, 48);
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

function spotBox(spot: PlanRequest["spot"], inside?: string, world?: WorldState): Area | null {
  if (!spot || !Number.isInteger(spot.x) || !Number.isInteger(spot.y)) return null;
  const w = spot.w == null ? 1 : spot.w;
  const h = spot.h == null ? 1 : spot.h;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return null;
  const width = inside ? ROOM_W : world ? mapSize(world).w : GRID_W;
  const height = inside ? ROOM_H : world ? mapSize(world).h : GRID_H;
  if (spot.x < 0 || spot.y < 0 || spot.x + w > width || spot.y + h > height) return null;
  return { x: spot.x, y: spot.y, w, h };
}

function placeFootprint(op: Extract<EditOp, { op: "place" }>): { w: number; h: number; kind: Entity["kind"] } {
  const name = op.label.trim();
  let sprite = op.sprite;
  if ((sprite === "prop" || sprite === "sign") && portrayal(name) === "tree") {
    sprite = /\bpines?\b/i.test(name) ? "tree_pine" : "tree_oak";
  }
  const info = SPRITES[sprite] ?? SPRITES[op.sprite];
  return { w: op.w ?? info.w, h: op.h ?? info.h, kind: info.kind };
}

function groundFor(kind: Entity["kind"], terrains: Terrain[]): Terrain | null {
  if (kind === "boat") return terrains.some((terrain) => terrain === "water") ? null : "water";
  if (kind === "bridge") return terrains.every((terrain) => terrain === "water" || terrain === "sand") ? null : "water";
  if (kind === "road" && terrains.some((terrain) => terrain === "water")) return "dirt";
  if ((kind === "house" || kind === "tower" || kind === "castle" || kind === "tree") && terrains.some((terrain) => terrain === "water")) {
    return "grass";
  }
  return null;
}

function covers(entity: Entity, x: number, y: number, w: number, h: number): boolean {
  return entity.x < x + w && entity.x + entity.w > x && entity.y < y + h && entity.y + entity.h > y;
}

function placeBelongs(request: PlanRequest, op: Extract<EditOp, { op: "place" }>): boolean {
  const text = request.text.toLowerCase();
  return op.label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
    .some((word) => text.includes(word));
}

function anchorPlace(world: WorldState, op: Extract<EditOp, { op: "place" }>, request: PlanRequest): EditOp[] {
  if (!request.spot) return [op];
  const footprint = placeFootprint(op);
  const room = request.inside;
  const width = room ? ROOM_W : mapSize(world).w;
  const height = room ? ROOM_H : mapSize(world).h;
  if (footprint.w > width || footprint.h > height) return [op];
  const x = Math.max(0, Math.min(request.spot.x, width - footprint.w));
  const y = Math.max(0, Math.min(request.spot.y, height - footprint.h));
  const { inside: _ignored, ...rest } = op;
  const placed: EditOp = room ? { ...rest, x, y, inside: room } : { ...rest, x, y };
  const prep: EditOp[] = [];
  if (!room) {
    const terrains: Terrain[] = [];
    for (let dy = 0; dy < footprint.h; dy += 1) {
      for (let dx = 0; dx < footprint.w; dx += 1) {
        const terrain = world.terrain[y + dy]?.[x + dx];
        if (terrain) terrains.push(terrain);
      }
    }
    const paint = groundFor(footprint.kind, terrains);
    if (paint) prep.push({ op: "paint", x, y, w: footprint.w, h: footprint.h, terrain: paint });
  }
  for (const entity of world.entities) {
    if (room ? entity.inside !== room : Boolean(entity.inside)) continue;
    if (covers(entity, x, y, footprint.w, footprint.h)) prep.push({ op: "remove", id: entity.id });
  }
  return [...prep, placed];
}

function areaIntent(text: string): "road" | "houses" | "trees" | null {
  if (/\b(roads?|paths?|lanes?|streets?)\b/i.test(text)) return "road";
  if (/\b(neighborhood|neighbourhood|houses|village|cottages|district)\b/i.test(text)) return "houses";
  if (/\b(forest|trees|woods|grove)\b/i.test(text)) return "trees";
  return null;
}

function areaCells(area: Area): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = area.y; y < area.y + area.h; y += 1) {
    for (let x = area.x; x < area.x + area.w; x += 1) cells.push({ x, y });
  }
  return cells.slice(0, 36);
}

function clipPaint(op: Extract<EditOp, { op: "paint" }>, area: Area): EditOp | null {
  const x = Math.max(op.x, area.x);
  const y = Math.max(op.y, area.y);
  const x2 = Math.min(op.x + op.w, area.x + area.w);
  const y2 = Math.min(op.y + op.h, area.y + area.h);
  if (x2 <= x || y2 <= y) return null;
  return { ...op, x, y, w: x2 - x, h: y2 - y };
}

function prepareFootprints(
  world: WorldState,
  cells: Array<{ x: number; y: number; w: number; h: number }>,
  inside: string | undefined,
  wetTerrain: Terrain | null,
): EditOp[] {
  const prep: EditOp[] = [];
  const removed = new Set<string>();
  for (const cell of cells) {
    if (!inside && wetTerrain) {
      let wet = false;
      for (let dy = 0; dy < cell.h; dy += 1) {
        for (let dx = 0; dx < cell.w; dx += 1) if (world.terrain[cell.y + dy]?.[cell.x + dx] === "water") wet = true;
      }
      if (wet) prep.push({ op: "paint", x: cell.x, y: cell.y, w: cell.w, h: cell.h, terrain: wetTerrain });
    }
    for (const entity of world.entities) {
      if (removed.has(entity.id)) continue;
      if (inside ? entity.inside !== inside : Boolean(entity.inside)) continue;
      if (!covers(entity, cell.x, cell.y, cell.w, cell.h)) continue;
      removed.add(entity.id);
      prep.push({ op: "remove", id: entity.id });
    }
  }
  return prep;
}

function stamp(sprite: SpriteId, label: string, x: number, y: number, inside?: string): Extract<EditOp, { op: "place" }> {
  const info = SPRITES[sprite];
  return {
    op: "place",
    kind: info.kind,
    x,
    y,
    sprite,
    label,
    ...(inside ? { inside } : {}),
    ...(sprite === "prop" ? { model: inventModel(label) } : {}),
  };
}

function packInArea(
  world: WorldState,
  area: Area,
  request: PlanRequest,
  prototypes: Array<Extract<EditOp, { op: "place" }>>,
  fill: boolean,
): EditOp[] {
  const loose = area.w === 1 || area.h === 1;
  const limitW = request.inside ? ROOM_W : mapSize(world).w;
  const limitH = request.inside ? ROOM_H : mapSize(world).h;
  const seeds = prototypes.length ? prototypes : landscapeTerrain(request.text) ? [] : [stamp("prop", "Marker", area.x, area.y, request.inside)];
  if (!seeds.length) return [];
  const copies = fill
    ? Array.from({ length: 12 }, (_, index) => seeds[index % seeds.length]!).filter((item): item is Extract<EditOp, { op: "place" }> => Boolean(item))
    : seeds;
  const spots: Array<{ x: number; y: number; w: number; h: number }> = [];
  const placed: Array<Extract<EditOp, { op: "place" }>> = [];
  for (const proto of copies) {
    const foot = placeFootprint(proto);
    let found: { x: number; y: number } | null = null;
    for (let y = area.y; y < area.y + area.h && !found; y += 1) {
      for (let x = area.x; x < area.x + area.w; x += 1) {
        const insideArea = loose || (x + foot.w <= area.x + area.w && y + foot.h <= area.y + area.h);
        const onMap = x + foot.w <= limitW && y + foot.h <= limitH;
        const blocked = spots.some((spot) => spot.x < x + foot.w && spot.x + spot.w > x && spot.y < y + foot.h && spot.y + spot.h > y);
        if (!insideArea || !onMap || blocked) continue;
        found = { x, y };
        break;
      }
    }
    if (!found) break;
    spots.push({ x: found.x, y: found.y, w: foot.w, h: foot.h });
    const { inside: _ignored, ...rest } = proto;
    placed.push(request.inside ? { ...rest, x: found.x, y: found.y, inside: request.inside } : { ...rest, x: found.x, y: found.y });
    if (placed.length >= (fill ? 12 : seeds.length)) break;
  }
  const wet = placed.some((op) => placeFootprint(op).kind === "tree") ? "grass" : null;
  return [...prepareFootprints(world, spots, request.inside, wet), ...placed];
}

function roadsIn(world: WorldState, area: Area, inside?: string): EditOp[] {
  const cells = areaCells(area).map((cell) => ({ ...cell, w: 1, h: 1 }));
  const roads = cells.map((cell) => stamp("road", "Road", cell.x, cell.y, inside));
  return [...prepareFootprints(world, cells, inside, "dirt"), ...roads];
}

function landscapeTerrain(text: string): Terrain | null {
  const lower = text.toLowerCase();
  if (/\b(beach|shore|ocean|sea|river|stream|creek|lake|pond|moat|flood)\b/.test(lower)) return null;
  if (/\b(dunes?|desert|sand)\b/.test(lower)) return "sand";
  if (/\b(snow|winter|frozen|ice)\b/.test(lower)) return "snow";
  if (/\b(dirt|mud)\b/.test(lower)) return "dirt";
  if (/\b(mountain|hill|cliff)\b/.test(lower)) return "stone";
  return null;
}

function duneWords(text: string): boolean {
  return /\b(dunes?|desert)\b/i.test(text);
}

function isPlaceholder(op: EditOp): boolean {
  if (op.op !== "place") return false;
  return /^(marker|(sand )?dunes?|desert|sand)$/i.test(op.label.trim());
}

function widenPatch(area: Area, world: WorldState): Area {
  if (area.w >= 4 && area.h >= 3) return area;
  const span = mapSize(world);
  const w = Math.min(span.w, Math.max(area.w, 6));
  const h = Math.min(span.h, Math.max(area.h, 4));
  const x = Math.max(0, Math.min(area.x - Math.floor((w - area.w) / 2), span.w - w));
  const y = Math.max(0, Math.min(area.y - Math.floor((h - area.h) / 2), span.h - h));
  return { x, y, w, h };
}

function landscapePaint(request: PlanRequest, world: WorldState): EditOp | null {
  const terrain = landscapeTerrain(request.text);
  const area = spotBox(request.spot, request.inside, world);
  if (!terrain || !area || request.inside) return null;
  const patch = duneWords(request.text) ? widenPatch(area, world) : area;
  return { op: "paint", x: patch.x, y: patch.y, w: patch.w, h: patch.h, terrain };
}

function applyLandscape(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[] | null {
  if (requests.length !== 1) return null;
  const request = requests[0];
  if (!request?.spot || focusEntity(request, world) || !landscapeTerrain(request.text)) return null;
  const paint = landscapePaint(request, world);
  if (!paint) return null;
  const kept = ops.filter((op) => op.op !== "paint" && !isPlaceholder(op));
  return [...kept, paint];
}

export function landReply(requests: PlanRequest[], ops: EditOp[]): string | null {
  if (requests.length !== 1) return null;
  const request = requests[0];
  const terrain = request ? landscapeTerrain(request.text) : null;
  if (!request || !terrain) return null;
  if (ops.some((op) => op.op === "place" || op.op === "remove" || op.op === "update" || op.op === "move")) return null;
  if (!ops.some((op) => op.op === "paint" && op.terrain === terrain)) return null;
  const wide = Boolean(request.spot && ((request.spot.w ?? 1) > 1 || (request.spot.h ?? 1) > 1));
  if (duneWords(request.text) && wide) return "I raised sand dunes across the area you selected.";
  if (duneWords(request.text) && request.spot) return "I raised sand dunes around the tile you selected.";
  if (duneWords(request.text)) return "I turned the open ground into sand dunes.";
  if (wide) return `I painted ${terrain} across the area you selected.`;
  if (request.spot) return `I painted ${terrain} on the tile you selected.`;
  return `I painted the ground ${terrain}.`;
}

export function supplementLand(requests: PlanRequest[], world: WorldState, chosen: EditOp[]): EditOp[] {
  if (requests.length !== 1) return chosen;
  const request = requests[0];
  const terrain = request ? landscapeTerrain(request.text) : null;
  if (!request || !terrain || request.inside || focusEntity(request, world)) return chosen;
  const next = chosen.filter((op) => !isPlaceholder(op));
  const painted = next.filter((op): op is Extract<EditOp, { op: "paint" }> => op.op === "paint" && op.terrain === terrain);
  const cells = painted.reduce((sum, op) => sum + op.w * op.h, 0);
  if (request.spot) {
    if (cells > 0) return next.slice(0, 48);
    const paint = landscapePaint(request, world);
    return paint ? [...next, paint].slice(0, 48) : next;
  }
  if (cells >= 12) return next.slice(0, 48);
  const paints: EditOp[] = [];
  const sources: Terrain[] = terrain === "sand" ? ["grass", "dirt", "snow"] : terrain === "snow" ? ["grass", "sand", "dirt"] : terrain === "dirt" ? ["grass"] : ["grass", "dirt"];
  paintMatching(world, paints, sources, terrain);
  const withoutTiny = next.filter((op) => !(op.op === "paint" && op.terrain === terrain));
  return [...paints, ...withoutTiny].slice(0, 48);
}

function fitRequestToArea(ops: EditOp[], request: PlanRequest, world: WorldState, area: Area, only: boolean): EditOp[] {
  const intent = areaIntent(request.text);
  const mine = (op: Extract<EditOp, { op: "place" }>) => (only && intent ? true : placeBelongs(request, op));
  const kept: EditOp[] = [];
  const places: Array<Extract<EditOp, { op: "place" }>> = [];
  for (const op of ops) {
    if (op.op === "paint") {
      const clipped = clipPaint(op, area);
      if (clipped) kept.push(clipped);
      continue;
    }
    if (op.op === "place" && mine(op)) {
      places.push(op);
      continue;
    }
    kept.push(op);
  }
  if (intent === "road") return [...kept.filter((op) => op.op !== "paint"), ...roadsIn(world, area, request.inside)];
  if (intent === "houses") return [...kept, ...packInArea(world, area, request, [stamp("house_small", "Cottage", area.x, area.y, request.inside)], true)];
  if (intent === "trees") return [...kept, ...packInArea(world, area, request, [stamp("tree_oak", "Oak", area.x, area.y, request.inside)], true)];
  return [...kept, ...packInArea(world, area, request, places.length ? places : ops.flatMap((op) => (op.op === "place" ? [op] : [])).slice(0, 1), false)];
}

export function carrySpot(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[] {
  const landscape = applyLandscape(requests, world, ops);
  if (landscape) return landscape.slice(0, 48);
  const pinned = requests.filter((request) => spotBox(request.spot, request.inside, world) && !focusEntity(request, world));
  if (!pinned.length) return ops;
  let next = ops;
  const singles = pinned.filter((request) => {
    const area = spotBox(request.spot, request.inside, world);
    return area && area.w * area.h === 1;
  });
  for (const request of pinned) {
    const area = spotBox(request.spot, request.inside, world);
    if (!area || area.w * area.h === 1) continue;
    next = fitRequestToArea(next, request, world, area, requests.length === 1);
  }
  if (!singles.length) return next.slice(0, 48);
  const anchored = new Set<number>();
  const laid: EditOp[] = [];
  for (const op of next) {
    if (op.op !== "place") {
      laid.push(op);
      continue;
    }
    const matched = singles.findIndex((request, index) => !anchored.has(index) && placeBelongs(request, op));
    const chosen = matched >= 0 ? matched : singles.length === 1 && pinned.length === 1 && !anchored.has(0) ? 0 : -1;
    if (chosen < 0) {
      laid.push(op);
      continue;
    }
    anchored.add(chosen);
    const request = singles[chosen];
    laid.push(...(request ? anchorPlace(world, op, request) : [op]));
  }
  return laid.slice(0, 48);
}

function addInside(world: WorldState, ops: EditOp[], host: Entity, label: string): void {
  const spot = roomSpot(world, ops, host.id);
  if (!spot) return;
  ops.push({ op: "place", kind: "custom", x: spot.x, y: spot.y, sprite: "prop", label, inside: host.id, model: inventModel(label) });
}

export function carryInterior(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[] {
  const tagged = ops.map((op) => {
    if (op.op !== "place" || op.inside || !isFurniture(op.label)) return op;
    const request =
      requests.find((item) => furnitureNames(item.text).some((label) => op.label.toLowerCase().includes(label.toLowerCase()))) ??
      requests.find((item) => item.inside || /\b(?:inside|into|in)\s+/i.test(item.text));
    const host = request ? hostFor(request, world) : null;
    if (!host) return op;
    return { ...op, inside: host.id };
  });
  const fitted: EditOp[] = [];
  for (const op of tagged) {
    if (op.op !== "place" || !op.inside) {
      fitted.push(op);
      continue;
    }
    const w = op.w ?? 1;
    const h = op.h ?? 1;
    const fits = op.x >= 0 && op.y >= 0 && op.x + w <= ROOM_W && op.y + h <= ROOM_H;
    if (fits) {
      fitted.push(op);
      continue;
    }
    const spot = roomSpot(world, fitted, op.inside);
    fitted.push(spot ? { ...op, x: spot.x, y: spot.y, w: 1, h: 1 } : op);
  }
  return fitted;
}

const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

const LANDMARKS: Record<string, string[]> = {
  barn: ["barn", "ranch", "stable", "farmhouse", "farm"],
  ranch: ["ranch", "barn", "farm"],
  stable: ["stable", "barn", "ranch"],
  skyscraper: ["skyscraper", "tower"],
  store: ["store", "shop"],
};

function howMany(requests: PlanRequest[], label: string): number {
  const text = requests.map((request) => request.text).join(" ");
  const numbered = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight)\b/i);
  if (numbered) {
    const count = COUNTS[numbered[1].toLowerCase()] ?? Number(numbered[1]);
    if (count >= 1 && count <= 8) return count;
  }
  if (new RegExp(`\\b${label.toLowerCase()}s\\b|\\bcattle\\b|\\bherd\\b`, "i").test(text)) return 3;
  return 1;
}

function named(label: string, expected: string): boolean {
  return new RegExp(`\\b${expected}s?\\b`, "i").test(label) && label.trim().length <= expected.length + 16;
}

function landmark(requests: PlanRequest[], world: WorldState): Entity | null {
  const text = requests.map((request) => request.text).join(" ");
  const match = text.match(/\b(?:near|by|beside|next to|around|in front of|behind)\s+(?:the\s+)?([a-z][a-z0-9 '-]{1,32})/i);
  if (!match?.[1]) return null;
  const phrase = match[1].toLowerCase().split(/\b(?:and|with|so|then)\b/)[0] ?? "";
  const keys = phrase.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const sentences = requests.map((request) => request.text.trim().replace(/\s+/g, " ").slice(0, 40).toLowerCase());
  let best: { entity: Entity; score: number } | null = null;
  for (const entity of world.entities) {
    if (entity.sprite === "sign" && sentences.includes(entity.label.trim().toLowerCase())) continue;
    const hay = `${entity.label} ${entity.note ?? ""} ${entity.kind} ${entity.sprite}`.toLowerCase();
    let score = 0;
    for (const key of keys) {
      const names = LANDMARKS[key] ?? [key];
      if (names.some((name) => hay.includes(name))) score += names[0] === key && hay.includes(key) ? 2 : 1;
    }
    if (entity.kind === "house" || entity.kind === "tower" || entity.kind === "castle") score += score > 0 ? 3 : 0;
    if (score > 0 && (!best || score > best.score)) best = { entity, score };
  }
  return best?.entity ?? null;
}

function addNear(
  world: WorldState,
  ops: EditOp[],
  anchor: Entity,
  sprite: SpriteId,
  label: string,
  note: string | undefined,
  terrainOk: (terrain: Terrain) => boolean,
): void {
  const draft = applyOps(world, ops).world;
  const info = SPRITES[sprite];
  const span = mapSize(draft);
  let best: { x: number; y: number; dist: number } | null = null;
  for (let y = 0; y <= span.h - info.h; y += 1) {
    for (let x = 0; x <= span.w - info.w; x += 1) {
      let ground = true;
      for (let dy = 0; dy < info.h && ground; dy += 1) {
        for (let dx = 0; dx < info.w; dx += 1) if (!terrainOk(draft.terrain[y + dy][x + dx])) ground = false;
      }
      if (!ground) continue;
      const probe: Entity = {
        id: "probe",
        kind: info.kind,
        x,
        y,
        w: info.w,
        h: info.h,
        sprite,
        label,
        createdBy: "agent",
      };
      if (placementError(draft, probe)) continue;
      const dist =
        Math.abs(x + info.w / 2 - (anchor.x + anchor.w / 2)) + Math.abs(y + info.h / 2 - (anchor.y + anchor.h / 2));
      if (!best || dist < best.dist) best = { x, y, dist };
    }
  }
  if (!best) {
    addPlace(world, ops, sprite, label, note, terrainOk);
    return;
  }
  ops.push({ op: "place", kind: info.kind, x: best.x, y: best.y, sprite, label, note, ...(sprite === "prop" ? { model: inventModel(label) } : {}) });
}

function dropSentenceSigns(world: WorldState, ops: EditOp[], requests: PlanRequest[]): void {
  for (const request of requests) {
    const label = request.text.trim().replace(/\s+/g, " ").slice(0, 40);
    for (const entity of world.entities) {
      if (entity.sprite === "sign" && entity.label === label) ops.push({ op: "remove", id: entity.id });
    }
  }
}

export function supplementProps(requests: PlanRequest[], chosen: EditOp[], local: EditOp[]): EditOp[] {
  const wanted = mentionedProps(requests);
  if (!wanted.length) return chosen;
  const extras: EditOp[] = [];
  for (const label of wanted) {
    if (chosen.some((op) => op.op === "place" && named(op.label, label))) continue;
    extras.push(...local.filter((op) => op.op === "place" && named(op.label, label)));
  }
  const removes = local.filter((op) => op.op === "remove");
  if (!extras.length && removes.length === 0) return chosen;
  return [...removes, ...chosen, ...extras].slice(0, 48);
}

function tagsFor(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text
    .toLowerCase()
    .replace(/\b(?:near|by|beside|next to|around|in front of|behind|across|over)\s+(?:the\s+)?[a-z0-9][a-z0-9 '-]{0,24}/g, " ");
  for (const [pattern, tag] of TAGS) if (pattern.test(lower)) found.add(tag);
  return found;
}

function names(requests: PlanRequest[], predicate: (tags: Set<string>) => boolean): string[] {
  const found: string[] = [];
  for (const request of requests) {
    if (predicate(tagsFor(request.text)) && !found.includes(request.playerName)) found.push(request.playerName);
  }
  return found;
}

function joinNames(list: string[]): string {
  if (list.length === 0) return "someone";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function paintRect(ops: EditOp[], x: number, y: number, w: number, h: number, terrain: Terrain, bounds = { w: GRID_W, h: GRID_H }): void {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(bounds.w, x + w);
  const bottom = Math.min(bounds.h, y + h);
  if (right <= left || bottom <= top) return;
  ops.push({ op: "paint", x: left, y: top, w: right - left, h: bottom - top, terrain });
}

function paintMatching(world: WorldState, ops: EditOp[], sources: Terrain[], terrain: Terrain): void {
  const strips: Array<{ x: number; y: number; w: number; h: number }> = [];
  const span = mapSize(world);
  for (let y = 0; y < span.h; y += 1) {
    let x = 0;
    while (x < span.w) {
      if (!sources.includes(world.terrain[y][x])) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < span.w && sources.includes(world.terrain[y][x])) x += 1;
      const previous = strips.find((strip) => strip.x === start && strip.w === x - start && strip.y + strip.h === y);
      if (previous) previous.h += 1;
      else strips.push({ x: start, y, w: x - start, h: 1 });
    }
  }
  strips.sort((a, b) => b.w * b.h - a.w * a.h);
  for (const strip of strips.slice(0, 12)) ops.push({ op: "paint", ...strip, terrain });
}

function clearFootprint(world: WorldState, ops: EditOp[], x: number, y: number, w: number, h: number): void {
  for (const entity of world.entities) {
    const hits = entity.x < x + w && entity.x + entity.w > x && entity.y < y + h && entity.y + entity.h > y;
    if (hits && !ops.some((op) => op.op === "remove" && op.id === entity.id)) ops.push({ op: "remove", id: entity.id });
  }
}

function moatOrigin(world: WorldState): { x: number; y: number } {
  let open: { x: number; y: number; score: number } | null = null;
  let crowded: { x: number; y: number; overlaps: number } | null = null;
  const span = mapSize(world);
  for (let y = 0; y <= span.h - 7; y += 1) {
    for (let x = 0; x <= span.w - 7; x += 1) {
      let score = y;
      let blocked = false;
      let overlaps = 0;
      for (const entity of world.entities) {
        const hits = entity.x < x + 7 && entity.x + entity.w > x && entity.y < y + 7 && entity.y + entity.h > y;
        if (!hits) continue;
        overlaps += 1;
        if (entity.createdBy !== "agent") blocked = true;
        else score += 2;
      }
      if (!crowded || overlaps < crowded.overlaps) crowded = { x, y, overlaps };
      if (blocked) continue;
      if (!open || score < open.score) open = { x, y, score };
    }
  }
  const spot = open ?? crowded ?? { x: 0, y: 0 };
  return { x: spot.x, y: spot.y };
}

function addPlace(
  world: WorldState,
  ops: EditOp[],
  sprite: SpriteId,
  label: string,
  note: string | undefined,
  terrainOk: (terrain: Terrain) => boolean,
): boolean {
  const info = SPRITES[sprite];
  const draft = applyOps(world, ops).world;
  const span = mapSize(draft);
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y <= span.h - info.h; y += 1) {
    for (let x = 0; x <= span.w - info.w; x += 1) {
      let ok = true;
      for (let dy = 0; dy < info.h && ok; dy += 1) {
        for (let dx = 0; dx < info.w; dx += 1) if (!terrainOk(draft.terrain[y + dy][x + dx])) ok = false;
      }
      if (!ok) continue;
      const probe: Entity = {
        id: "probe",
        kind: info.kind,
        x,
        y,
        w: info.w,
        h: info.h,
        sprite,
        label,
        createdBy: "agent",
      };
      if (!placementError(draft, probe)) candidates.push({ x, y });
    }
  }
  let spot = candidates[Math.floor(candidates.length / 3)] ?? candidates[0];
  if (!spot) {
    spot = openSpot(draft, info.w, info.h, terrainOk);
    clearFootprint(world, ops, spot.x, spot.y, info.w, info.h);
    if (tilesNeedTerrain(draft, spot.x, spot.y, info.w, info.h, terrainOk)) {
      ops.push({ op: "paint", x: spot.x, y: spot.y, w: info.w, h: info.h, terrain: terrainFor(terrainOk) });
    }
  }
  ops.push({ op: "place", kind: info.kind, x: spot.x, y: spot.y, sprite, label, note, ...(sprite === "prop" ? { model: inventModel(label) } : {}) });
  return true;
}

const PLACEABLE: Terrain[] = ["grass", "sand", "dirt", "snow", "stone", "water"];

function terrainFor(ok: (terrain: Terrain) => boolean): Terrain {
  return PLACEABLE.find((terrain) => ok(terrain)) ?? "grass";
}

function tilesNeedTerrain(
  world: WorldState,
  x: number,
  y: number,
  w: number,
  h: number,
  ok: (terrain: Terrain) => boolean,
): boolean {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) if (!ok(world.terrain[y + dy][x + dx])) return true;
  }
  return false;
}

function openSpot(
  world: WorldState,
  w: number,
  h: number,
  terrainOk: (terrain: Terrain) => boolean,
): { x: number; y: number } {
  let best = { x: 0, y: 0, score: Number.POSITIVE_INFINITY };
  const span = mapSize(world);
  for (let y = 0; y <= span.h - h; y += 1) {
    for (let x = 0; x <= span.w - w; x += 1) {
      let overlaps = 0;
      for (const entity of world.entities) {
        const hits = entity.x < x + w && entity.x + entity.w > x && entity.y < y + h && entity.y + entity.h > y;
        if (hits) overlaps += 1;
      }
      let repaint = 0;
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) if (!terrainOk(world.terrain[y + dy][x + dx])) repaint += 1;
      }
      const score = overlaps * 100 + repaint;
      if (score < best.score) best = { x, y, score };
    }
  }
  return { x: best.x, y: best.y };
}

const LAND = new Set<Terrain>(["grass", "sand", "snow", "dirt", "stone"]);

export function planBatch(world: WorldState, incoming: PlanRequest[]): { batch: EditBatch; lines: StatusLine[] } {
  const direct: EditOp[] = [];
  const requests = incoming.filter((request) => {
    const entity = focusEntity(request, world);
    if (!entity) return true;
    const edits = focusEdits(entity, request.text);
    if (!edits.length) return true;
    direct.push(...edits);
    return false;
  });
  if (!requests.length) {
    const everyone = joinNames([...new Set(incoming.map((request) => request.playerName))]);
    return {
      batch: {
        requestIds: incoming.map((request) => request.id),
        baseVersion: world.version,
        ops: direct.slice(0, 48),
        reply: focusReply(direct),
      },
      lines: [{ from: "Director", text: `Changing what ${everyone} selected.` }],
    };
  }
  if (incoming.length > 0 && incoming.every((request) => onlyGrow(request.text))) {
    const size = mapSize(world);
    const margins = fitGrow(size.w, size.h, askedGrowth(incoming) ?? { north: 0, east: 0, south: 0, west: 0 });
    const grew = margins.north + margins.east + margins.south + margins.west > 0;
    return {
      batch: {
        requestIds: incoming.map((request) => request.id),
        baseVersion: world.version,
        ops: grew ? [growOp(margins)] : [],
        reply: growReply(size.w, size.h, margins),
      },
      lines: [{ from: "Director", text: grew ? "Opening more ground around the map." : "The map has no room left to grow." }],
    };
  }
  const allTags = new Set<string>();
  for (const request of requests) for (const tag of tagsFor(request.text)) allTags.add(tag);

  const wantMoat = allTags.has("castle") && (allTags.has("flood") || allTags.has("river"));
  const wantShore = allTags.has("winter") && allTags.has("beach");
  const castlePeople = names(requests, (tags) => tags.has("castle"));
  const waterPeople = names(requests, (tags) => tags.has("flood") || tags.has("river"));
  const winterPeople = names(requests, (tags) => tags.has("winter"));
  const beachPeople = names(requests, (tags) => tags.has("beach"));
  const everyone = joinNames([...new Set(requests.map((request) => request.playerName))]);

  const terrainOps: EditOp[] = [];
  const buildOps: EditOp[] = [];
  const storyOps: EditOp[] = [];
  const concerns: string[] = [];
  const span = mapSize(world);

  if (wantShore) {
    paintRect(terrainOps, 0, 0, span.w, Math.max(1, span.h - 5), "snow", span);
    paintRect(terrainOps, 0, Math.max(0, span.h - 5), span.w, 2, "sand", span);
    paintRect(terrainOps, 0, Math.max(0, span.h - 3), span.w, 3, "water", span);
    concerns.push("Winter and a beach want the same ground, so the shore stays sand and the inland fields turn to snow.");
  } else {
    if (allTags.has("winter")) paintMatching(world, terrainOps, ["grass", "sand", "dirt"], "snow");
    if (allTags.has("desert")) paintMatching(world, terrainOps, ["grass", "dirt", "snow"], "sand");
    if (allTags.has("dirt")) paintMatching(world, terrainOps, ["grass"], "dirt");
    if (allTags.has("beach")) {
      paintRect(terrainOps, 0, Math.max(0, span.h - 4), span.w, 2, "sand", span);
      paintRect(terrainOps, 0, Math.max(0, span.h - 2), span.w, 2, "water", span);
    }
  }

  if (allTags.has("hill")) paintRect(terrainOps, 1, 1, 6, 3, "stone");

  if (!wantMoat && allTags.has("river")) {
    const mid = Math.floor(span.h / 2);
    paintRect(terrainOps, 0, Math.max(0, mid - 1), span.w, 1, "sand", span);
    paintRect(terrainOps, 0, mid, span.w, 1, "water", span);
    paintRect(terrainOps, 0, Math.min(span.h - 1, mid + 1), span.w, 1, "sand", span);
  } else if (!wantMoat && (allTags.has("flood") || allTags.has("lake"))) {
    paintRect(terrainOps, 3, 7, 12, 1, "sand");
    paintRect(terrainOps, 4, 8, 10, 4, "water");
  }

  const shaped = applyOps(world, terrainOps).world;

  if (wantMoat) {
    const origin = moatOrigin(world);
    concerns.push("A flood would sink the castle. The water stays in a ring.");
    clearFootprint(world, buildOps, origin.x, origin.y, 7, 7);
    paintRect(terrainOps, origin.x, origin.y, 7, 1, "water");
    paintRect(terrainOps, origin.x, origin.y + 6, 7, 1, "water");
    paintRect(terrainOps, origin.x, origin.y + 1, 1, 5, "water");
    paintRect(terrainOps, origin.x + 6, origin.y + 1, 1, 5, "water");
    paintRect(terrainOps, origin.x + 1, origin.y + 1, 5, 5, "grass");
    buildOps.push({
      op: "place",
      kind: "castle",
      x: origin.x + 2,
      y: origin.y + 2,
      sprite: "castle",
      label: "Castle",
      note: "Dry courtyard, water all around.",
    });
    buildOps.push({
      op: "place",
      kind: "bridge",
      x: origin.x + 2,
      y: origin.y + 6,
      sprite: "bridge",
      label: "Drawbridge",
      note: "The only dry crossing.",
    });
  } else if (allTags.has("castle")) {
    addPlace(shaped, buildOps, "castle", "Castle", "Raised on the high ground.", (terrain) => terrain !== "water");
  }

  const afterBuilds = () => applyOps(applyOps(world, terrainOps).world, buildOps).world;
  const anchor = landmark(requests, world);

  if (allTags.has("village")) {
    for (let i = 0; i < 5; i += 1) {
      addPlace(afterBuilds(), buildOps, "road", "Lane", undefined, (terrain) => LAND.has(terrain));
    }
    addPlace(afterBuilds(), buildOps, "house_small", "Cottage", "Smoke in the chimney.", (terrain) => LAND.has(terrain));
    addPlace(afterBuilds(), buildOps, "house_small", "Bakery", "The smell carries down the lane.", (terrain) => LAND.has(terrain));
    addPlace(afterBuilds(), buildOps, "well", "Well", "Cold water for the lane.", (terrain) => LAND.has(terrain));
    addPlace(afterBuilds(), storyOps, "npc_villager", "Villager", "Glad you came.", (terrain) => LAND.has(terrain));
  }

  const features: Array<[string, SpriteId, string, string, "build" | "story", (terrain: Terrain) => boolean, number]> = [
    ["tower", "tower", "Watchtower", "It sees past the next hill.", "build", (terrain) => terrain !== "water", 1],
    ["bridge", "bridge", "Bridge", "Planks over the water.", "build", (terrain) => terrain === "water" || terrain === "sand", 1],
    ["road", "road", "Road", "Worn by boots.", "build", (terrain) => LAND.has(terrain), 1],
    ["campfire", "campfire", "Campfire", "Someone left it burning.", "build", (terrain) => terrain !== "water", 1],
    ["boat", "boat", "Boat", "Tied, for now.", "build", (terrain) => terrain === "water", 1],
    ["flowers", "flower", "Flowers", "A bright patch.", "story", (terrain) => LAND.has(terrain), 3],
    ["knight", "npc_knight", "Knight", "On watch.", "story", (terrain) => LAND.has(terrain), 1],
    ["merchant", "npc_merchant", "Merchant", "Pack half open.", "story", (terrain) => LAND.has(terrain), 1],
    ["child", "npc_child", "Child", "Chasing something small.", "story", (terrain) => LAND.has(terrain), 1],
    ["villager", "npc_villager", "Villager", "Waving from the path.", "story", (terrain) => LAND.has(terrain), 1],
    ["cat", "animal_cat", "Cat", "Owns the step.", "story", (terrain) => LAND.has(terrain), 1],
    ["dog", "animal_dog", "Dog", "Waiting.", "story", (terrain) => LAND.has(terrain), 1],
    ["well", "well", "Well", "The rope is new.", "build", (terrain) => LAND.has(terrain), 1],
    ["forest", "tree_oak", "Oak", "Old enough to lean.", "build", (terrain) => terrain === "grass" || terrain === "snow" || terrain === "dirt", 5],
  ];

  for (const [tag, sprite, label, note, bucket, ok, count] of features) {
    if (!allTags.has(tag)) continue;
    if (tag === "bridge" && wantMoat) continue;
    if (tag === "villager" && allTags.has("village")) continue;
    for (let i = 0; i < count; i += 1) {
      const target = bucket === "build" ? buildOps : storyOps;
      const base = applyOps(afterBuilds(), storyOps).world;
      const titled = count > 1 ? `${label} ${i + 1}` : label;
      if (anchor) addNear(base, target, anchor, sprite, titled, note, ok);
      else addPlace(base, target, sprite, titled, note, ok);
    }
  }

  if (allTags.has("sign") || wantMoat || wantShore || allTags.has("village")) {
    const note = wantMoat
      ? `${joinNames(castlePeople)} raised the castle. ${joinNames(waterPeople)} sent the water around it.`
      : wantShore
        ? `${joinNames(winterPeople)} brought the snow. ${joinNames(beachPeople)} kept the shore.`
        : `Left here by ${everyone}.`;
    addPlace(applyOps(afterBuilds(), storyOps).world, storyOps, "sign", "Sign", note, (terrain) => LAND.has(terrain));
  }

  if (allTags.has("remove")) {
    const words = requests
      .filter((request) => tagsFor(request.text).has("remove"))
      .map((request) => request.text.toLowerCase())
      .join(" ");
    for (const entity of world.entities) {
      const hay = `${entity.label} ${entity.kind} ${entity.sprite}`.toLowerCase();
      if (hay.split(/[^a-z]+/).some((word) => word.length > 2 && words.includes(word))) {
        storyOps.push({ op: "remove", id: entity.id });
      }
    }
  }

  const props = mentionedProps(requests);
  if (props.length) dropSentenceSigns(world, storyOps, requests);
  const ground = afterBuilds();
  for (const label of props) {
    const count = howMany(requests, label);
    for (let i = 0; i < count; i += 1) {
      if (anchor) addNear(ground, storyOps, anchor, "prop", label, undefined, (terrain) => LAND.has(terrain));
      else addPlace(ground, storyOps, "prop", label, undefined, (terrain) => LAND.has(terrain));
    }
  }

  for (const request of requests) {
    const host = hostFor(request, world);
    for (const label of furnitureNames(request.text)) {
      const count = howMany([request], label);
      for (let i = 0; i < count; i += 1) {
        if (host) addInside(world, storyOps, host, label);
        else addPlace(ground, storyOps, "prop", label, undefined, (terrain) => LAND.has(terrain));
      }
    }
  }

  if (terrainOps.length + buildOps.length + storyOps.length === 0) {
    for (const request of requests) {
      const text = request.text.trim().replace(/\s+/g, " ");
      const label = text.slice(0, 40) || "Note";
      addPlace(world, storyOps, "sign", label, text.slice(0, 160) || undefined, (terrain) => LAND.has(terrain));
    }
  }

  const sky = skyAsk(requests);
  const skyOps: EditOp[] = sky ? [{ op: "sky", value: sky }] : [];
  const growth = askedGrowth(requests);
  const fitted = growth ? fitGrow(span.w, span.h, growth) : null;
  const growOps: EditOp[] = fitted && fitted.north + fitted.east + fitted.south + fitted.west > 0 ? [growOp(fitted)] : [];
  const ops = [...carrySpot(incoming, world, [...direct, ...carryMotion(requests, carryColor(requests, carryInterior(requests, world, [...skyOps, ...terrainOps, ...buildOps, ...storyOps])))]), ...growOps].slice(0, 48);
  const onTile = incoming.some((request) => request.spot) && ops.some((op) => op.op === "place");
  const wide = incoming.some((request) => {
    const area = spotBox(request.spot, request.inside, world);
    return area != null && area.w * area.h > 1;
  });
  const reply = landReply(incoming, ops) ?? [focusReply(direct), replyFor({
    wantMoat,
    wantShore,
    castlePeople,
    waterPeople,
    winterPeople,
    beachPeople,
    everyone,
    requests,
    ops,
  }), onTile ? (wide ? "I built it inside the area you selected." : "I built it on the tile you selected.") : "", fitted && growOps.length ? growReply(span.w, span.h, fitted) : ""]
    .filter(Boolean)
    .join(" ");

  const lines: StatusLine[] = [
    { from: "Director", text: `Reading ${requests.length} request${requests.length === 1 ? "" : "s"} from ${everyone}.` },
    {
      from: "Architect",
      text: buildOps.length ? `Layout: ${summarize(buildOps)}.` : "No new buildings. The ground plan can stay.",
    },
    {
      from: "Naturalist",
      text: terrainOps.length ? `Land and water: ${summarize(terrainOps)}.` : "The weather and water can stay as they are.",
    },
  ];
  if (concerns[0]) lines.push({ from: "Naturalist", text: concerns[0] });
  lines.push({
    from: "Storyteller",
    text: storyOps.length ? `Names and notes: ${summarize(storyOps)}.` : `Credit ${everyone} in the reply.`,
  });
  lines.push({ from: "Director", text: "Merging the proposals into one batch." });

  return {
    batch: {
      requestIds: requests.map((request) => request.id),
      baseVersion: world.version,
      ops,
      reply,
    },
    lines,
  };
}

function summarize(ops: EditOp[]): string {
  return ops
    .slice(0, 4)
    .map((op) => {
      if (op.op === "paint") return `${op.terrain}`;
      if (op.op === "place") return op.label;
      if (op.op === "remove") return "a removal";
      return "a change";
    })
    .join(", ");
}

function replyFor(input: {
  wantMoat: boolean;
  wantShore: boolean;
  castlePeople: string[];
  waterPeople: string[];
  winterPeople: string[];
  beachPeople: string[];
  everyone: string;
  requests: PlanRequest[];
  ops: EditOp[];
}): string {
  const hasCastle = input.ops.some((op) => op.op === "place" && op.sprite === "castle");
  if (input.wantMoat && hasCastle) {
    return `${joinNames(input.castlePeople)} wanted a castle and ${joinNames(input.waterPeople)} wanted the ground flooded, so the castle stands in a dry courtyard with a moat and a bridge.`;
  }
  if (input.wantShore) {
    return `${joinNames(input.winterPeople)} called winter and ${joinNames(input.beachPeople)} called the beach, so the inland fields are snow and the shore stays sand and water.`;
  }
  if (!input.ops.length) {
    return `${input.everyone} asked, so I changed the map.`;
  }
  const placed = [...new Set(input.ops.flatMap((op) => (op.op === "place" ? [op.label.replace(/ \d+$/, "") ] : [])))];
  const painted = [...new Set(input.ops.flatMap((op) => (op.op === "paint" ? [op.terrain] : [])))];
  const sky = input.ops.find((op) => op.op === "sky");
  const bits = [
    placed.length ? `added ${placed.slice(0, 4).join(", ")}` : "",
    painted.length ? `painted ${painted.join(" and ")}` : "",
    sky?.op === "sky" ? `turned the sky to ${sky.value}` : "",
  ].filter(Boolean);
  const verb = input.requests.length > 1 ? "asked together" : "asked";
  return `${input.everyone} ${verb}, so I ${bits.join(" and ")}.`;
}
