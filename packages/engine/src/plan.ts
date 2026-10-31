import {
  GRID_H,
  GRID_W,
  SPRITES,
  type EditBatch,
  type EditOp,
  type Entity,
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

function tagsFor(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();
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

function paintRect(ops: EditOp[], x: number, y: number, w: number, h: number, terrain: Terrain): void {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(GRID_W, x + w);
  const bottom = Math.min(GRID_H, y + h);
  if (right <= left || bottom <= top) return;
  ops.push({ op: "paint", x: left, y: top, w: right - left, h: bottom - top, terrain });
}

function paintMatching(world: WorldState, ops: EditOp[], sources: Terrain[], terrain: Terrain): void {
  const strips: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let y = 0; y < GRID_H; y += 1) {
    let x = 0;
    while (x < GRID_W) {
      if (!sources.includes(world.terrain[y][x])) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < GRID_W && sources.includes(world.terrain[y][x])) x += 1;
      const previous = strips.find((strip) => strip.x === start && strip.w === x - start && strip.y + strip.h === y);
      if (previous) previous.h += 1;
      else strips.push({ x: start, y, w: x - start, h: 1 });
    }
  }
  strips.sort((a, b) => b.w * b.h - a.w * a.h);
  for (const strip of strips.slice(0, 12)) ops.push({ op: "paint", ...strip, terrain });
}

function clearAgents(world: WorldState, ops: EditOp[], x: number, y: number, w: number, h: number): void {
  for (const entity of world.entities) {
    const hits =
      entity.createdBy === "agent" && entity.x < x + w && entity.x + entity.w > x && entity.y < y + h && entity.y + entity.h > y;
    if (hits && !ops.some((op) => op.op === "remove" && op.id === entity.id)) ops.push({ op: "remove", id: entity.id });
  }
}

function moatOrigin(world: WorldState): { x: number; y: number } | null {
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = 0; y <= GRID_H - 7; y += 1) {
    for (let x = 0; x <= GRID_W - 7; x += 1) {
      let score = y;
      let blocked = false;
      for (const entity of world.entities) {
        const hits = entity.x < x + 7 && entity.x + entity.w > x && entity.y < y + 7 && entity.y + entity.h > y;
        if (!hits) continue;
        if (entity.createdBy !== "agent") blocked = true;
        else score += 2;
      }
      if (blocked) continue;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
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
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y <= GRID_H - info.h; y += 1) {
    for (let x = 0; x <= GRID_W - info.w; x += 1) {
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
  if (!candidates.length) return false;
  const spot = candidates[Math.floor(candidates.length / 3)] ?? candidates[0];
  ops.push({ op: "place", kind: info.kind, x: spot.x, y: spot.y, sprite, label, note });
  return true;
}

const LAND = new Set<Terrain>(["grass", "sand", "snow", "dirt", "stone"]);

export function planBatch(world: WorldState, requests: PlanRequest[]): { batch: EditBatch; lines: StatusLine[] } {
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

  if (wantShore) {
    paintRect(terrainOps, 0, 0, GRID_W, 11, "snow");
    paintRect(terrainOps, 0, 11, GRID_W, 2, "sand");
    paintRect(terrainOps, 0, 13, GRID_W, 3, "water");
    concerns.push("Winter and a beach want the same ground, so the shore stays sand and the inland fields turn to snow.");
  } else {
    if (allTags.has("winter")) paintMatching(world, terrainOps, ["grass", "sand", "dirt"], "snow");
    if (allTags.has("desert")) paintMatching(world, terrainOps, ["grass", "dirt", "snow"], "sand");
    if (allTags.has("dirt")) paintMatching(world, terrainOps, ["grass"], "dirt");
    if (allTags.has("beach")) {
      paintRect(terrainOps, 0, 12, GRID_W, 2, "sand");
      paintRect(terrainOps, 0, 14, GRID_W, 2, "water");
    }
  }

  if (allTags.has("hill")) paintRect(terrainOps, 1, 1, 6, 3, "stone");

  if (!wantMoat && allTags.has("river")) {
    paintRect(terrainOps, 0, 7, GRID_W, 1, "sand");
    paintRect(terrainOps, 0, 8, GRID_W, 1, "water");
    paintRect(terrainOps, 0, 9, GRID_W, 1, "sand");
  } else if (!wantMoat && (allTags.has("flood") || allTags.has("lake"))) {
    paintRect(terrainOps, 3, 7, 12, 1, "sand");
    paintRect(terrainOps, 4, 8, 10, 4, "water");
  }

  const shaped = applyOps(world, terrainOps).world;

  if (wantMoat) {
    const origin = moatOrigin(world);
    if (origin) {
      concerns.push("A flood would sink the castle. The water stays in a ring.");
      clearAgents(world, buildOps, origin.x, origin.y, 7, 7);
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
    }
  } else if (allTags.has("castle")) {
    addPlace(shaped, buildOps, "castle", "Castle", "Raised on the high ground.", (terrain) => terrain !== "water");
  }

  const afterBuilds = () => applyOps(applyOps(world, terrainOps).world, buildOps).world;

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
      addPlace(base, target, sprite, titled, note, ok);
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

  const ops = [...terrainOps, ...buildOps, ...storyOps].slice(0, 48);
  const reply = replyFor({
    wantMoat,
    wantShore,
    castlePeople,
    waterPeople,
    winterPeople,
    beachPeople,
    everyone,
    requests,
    ops,
  });

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
    return `I heard ${input.everyone}, and that would not fit without breaking the map. Try a smaller change.`;
  }
  const placed = [...new Set(input.ops.flatMap((op) => (op.op === "place" ? [op.label.replace(/ \d+$/, "") ] : [])))];
  const painted = [...new Set(input.ops.flatMap((op) => (op.op === "paint" ? [op.terrain] : [])))];
  const bits = [
    placed.length ? `added ${placed.slice(0, 4).join(", ")}` : "",
    painted.length ? `painted ${painted.join(" and ")}` : "",
  ].filter(Boolean);
  const verb = input.requests.length > 1 ? "asked together" : "asked";
  return `${input.everyone} ${verb}, so I ${bits.join(" and ")}.`;
}
