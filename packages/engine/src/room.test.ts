import { describe, expect, test } from "bun:test";
import { TERRAIN_HEIGHT, airborne, canonicalModel, editBatchSchema, inventModel, isStockBlob, mapSize, modelFor, namedColor, parseModel, portrayal, renderDigest, shapeKey, usableModel } from "@worldbuilder/contracts";
import { applyOps, nudgeRejectedPlaces } from "./apply.js";
import { attachShapes } from "./shape.js";
import { carryColor, carrySpot, planBatch, supplementLand, supplementProps } from "./plan.js";
import { WorldRoom } from "./room.js";

function named(room: WorldRoom, requests: Array<{ id: string; playerId: string; text: string }>) {
  const world = room.view();
  return requests.map((request) => ({
    ...request,
    playerName: world.players.find((player) => player.id === request.playerId)?.name ?? request.playerId,
  }));
}

describe("world room", () => {
  test("starts with water, trees, and a shared version", () => {
    const room = new WorldRoom("TEST");
    const world = room.start("Wilds");
    expect(world.version).toBe(1);
    expect(world.terrain.flat().includes("water")).toBe(true);
    expect(world.entities.some((entity) => entity.kind === "tree")).toBe(true);
    expect(TERRAIN_HEIGHT.water).toBeLessThan(TERRAIN_HEIGHT.grass);
    expect(TERRAIN_HEIGHT.grass).toBeLessThan(TERRAIN_HEIGHT.stone);
    expect(renderDigest(world)).toContain("lowest to highest: water, sand, dirt, grass, snow, stone");
    expect(renderDigest(world).length).toBeLessThan(12_000);
  });

  test("claims two requests, applies a valid paint, and rejects a bad place", () => {
    const room = new WorldRoom("TEST");
    room.start("Wilds");
    room.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    room.join({ id: "b", name: "Ben", color: "#3b6fe0", joinedAt: new Date().toISOString() });
    room.say("a", "Make a river");
    room.say("b", "Add a tower");
    const claimed = room.claimBatch("worker");
    expect(claimed?.requests).toHaveLength(2);

    const world = room.view();
    let waterX = -1;
    let waterY = -1;
    for (let y = 0; y < world.terrain.length - 1 && waterX < 0; y += 1) {
      for (let x = 0; x < world.terrain[y].length - 1; x += 1) {
        const block = [world.terrain[y][x], world.terrain[y][x + 1], world.terrain[y + 1][x], world.terrain[y + 1][x + 1]];
        if (block.every((terrain) => terrain === "water")) {
          waterX = x;
          waterY = y;
          break;
        }
      }
    }
    expect(waterX).toBeGreaterThanOrEqual(0);
    const result = room.applyEdits({
      requestIds: claimed!.requests.map((request) => request.id),
      baseVersion: 0,
      reply: "A sandy corner, and I left the house off the lake.",
      ops: [
        { op: "paint", x: 0, y: 0, w: 2, h: 1, terrain: "sand" },
        { op: "place", kind: "house", x: waterX, y: waterY, sprite: "house_small", label: "Wet house" },
      ],
    });

    expect(result.stale).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/water/);
    expect(room.view().version).toBe(2);
    expect(room.view().chat.at(-1)?.text).toContain("sandy corner");

    const again = room.applyEdits({
      requestIds: claimed!.requests.map((request) => request.id),
      baseVersion: 2,
      reply: "again",
      ops: [{ op: "paint", x: 0, y: 1, w: 1, h: 1, terrain: "dirt" }],
    });
    expect(again.applied).toBe(0);
    expect(room.view().version).toBe(2);

    const repaired = room.applyEdits(
      {
        requestIds: claimed!.requests.map((request) => request.id),
        baseVersion: 2,
        reply: "the road",
        ops: [{ op: "paint", x: 2, y: 2, w: 3, h: 1, terrain: "dirt" }, { op: "place", kind: "road", x: 2, y: 2, sprite: "road", label: "Road" }],
      },
      Date.now(),
      { silent: true },
    );
    expect(repaired.applied).toBe(2);
    expect(room.view().entities.some((entity) => entity.sprite === "road" && entity.label === "Road")).toBe(true);
    expect(room.view().chat.filter((message) => message.text === "the road")).toHaveLength(0);
  });

  test("returns a claim to the queue after the lease", () => {
    const room = new WorldRoom("LEASE");
    room.start("Wilds");
    room.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    const said = room.say("a", "Add a village");
    expect(room.claimBatch("worker")).not.toBeNull();
    expect(room.claimBatch("other")).toBeNull();
    expect(room.onAlarm(Date.now() + 31_000)).toBe(1);
    const again = room.claimBatch("other", Date.now() + 31_000);
    expect(again?.requests.map((request) => request.id)).toEqual([said.requestId]);
  });

  test("turns a castle and a flood into a moat that names both players", () => {
    const room = new WorldRoom("MOAT");
    room.start("Wilds");
    room.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    room.join({ id: "b", name: "Ben", color: "#3b6fe0", joinedAt: new Date().toISOString() });
    room.say("a", "Put a castle on the hill");
    room.say("b", "Flood the whole area");
    const claimed = room.claimBatch("worker")!;
    const planned = planBatch(claimed.world, named(room, claimed.requests));
    const result = room.applyEdits(planned.batch);
    const world = room.view();

    expect(result.rejected).toEqual([]);
    expect(world.entities.some((entity) => entity.sprite === "castle")).toBe(true);
    expect(world.entities.some((entity) => entity.sprite === "bridge")).toBe(true);
    expect(planned.batch.reply).toContain("Ada");
    expect(planned.batch.reply).toContain("Ben");
    expect(planned.batch.reply.toLowerCase()).toContain("moat");
    expect(planned.lines.length).toBeGreaterThanOrEqual(4);
  });

  test("builds a frozen shoreline and a village", () => {
    const shore = new WorldRoom("SHORE");
    shore.start("Wilds");
    shore.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    shore.join({ id: "b", name: "Ben", color: "#3b6fe0", joinedAt: new Date().toISOString() });
    shore.say("a", "It should be winter");
    shore.say("b", "Give us a beach");
    const claimed = shore.claimBatch("worker")!;
    const planned = planBatch(claimed.world, named(shore, claimed.requests));
    const result = shore.applyEdits(planned.batch);
    expect(result.rejected).toEqual([]);
    expect(shore.view().terrain[0].includes("snow") || shore.view().terrain[1].includes("snow")).toBe(true);
    expect(shore.view().terrain[15].includes("water")).toBe(true);
    expect(planned.batch.reply).toContain("Ada");
    expect(planned.batch.reply).toContain("Ben");

    const town = new WorldRoom("TOWN");
    town.start("Wilds");
    town.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    const said = town.say("a", "Add a village");
    const batch = town.claimBatch("worker")!;
    const village = planBatch(batch.world, named(town, batch.requests));
    const built = town.applyEdits(village.batch);
    expect(built.rejected).toEqual([]);
    expect(town.view().entities.some((entity) => entity.kind === "house")).toBe(true);
    expect(said.requestId).toBe(batch.requests[0]?.id);
  });

  test("applies a request that does not fit instead of asking for a smaller change", () => {
    const room = new WorldRoom("FIT");
    const world = room.start("Wilds");
    for (const row of world.terrain) row.fill("water");
    world.entities = [];

    const unmatched = planBatch(world, [
      { id: "r1", playerId: "a", playerName: "Elikem 2", text: "Put a dragon in the square" },
    ]);
    expect(unmatched.batch.reply).not.toMatch(/breaking the map|smaller change/i);
    expect(unmatched.batch.ops.some((op) => op.op === "place" && op.label === "Dragon")).toBe(true);

    const castle = planBatch(world, [
      { id: "r2", playerId: "a", playerName: "Elikem 2", text: "Build a castle" },
    ]);
    expect(castle.batch.reply).not.toMatch(/breaking the map|smaller change/i);
    const applied = room.applyEdits(castle.batch);
    expect(applied.rejected).toEqual([]);
    expect(room.view().entities.some((entity) => entity.sprite === "castle")).toBe(true);
    expect(room.view().chat.at(-1)?.text).toBe(castle.batch.reply);

    const garage = planBatch(world, [
      { id: "r3", playerId: "a", playerName: "Elikem 2", text: "Add a red car" },
    ]);
    expect(garage.batch.ops.some((op) => op.op === "place" && op.label === "Red Car")).toBe(true);
    expect(garage.batch.reply).not.toMatch(/breaking the map|smaller change/i);
  });

  test("keeps issuing new request ids after a reload", () => {
    const room = new WorldRoom("NADL");
    room.start("city");
    room.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    room.say("a", "add a skyscraper");
    const restored = new WorldRoom("NADL");
    restored.load(room.dump());
    restored.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    const said = restored.say("a", "add a road in front of the skyscraper");
    expect(said.requestId).not.toBe("req_NADL_1");
  });

  test("puts a rejected road on open ground beside the building", () => {
    const room = new WorldRoom("ROAD");
    room.start("city");
    room.join({ id: "a", name: "Ada", color: "#e85d4c", joinedAt: new Date().toISOString() });
    room.say("a", "add a skyscraper");
    const claimed = room.claimBatch("worker");
    const cleared = room.applyEdits({
      requestIds: claimed!.requests.map((request) => request.id),
      baseVersion: room.view().version,
      reply: "the tower",
      ops: [
        ...room.view().entities.map((entity) => ({ op: "remove" as const, id: entity.id })),
        { op: "place" as const, kind: "tower" as const, x: 10, y: 0, sprite: "tower" as const, label: "Skyscraper" },
      ],
    });
    expect(cleared.rejected).toEqual([]);
    const nudged = nudgeRejectedPlaces(room.view(), [
      { op: "place", kind: "road", x: 10, y: 0, sprite: "road", label: "Road" },
    ]);
    expect(nudged.length).toBeGreaterThan(1);
    expect(nudged.every((op) => op.op === "place" && !(op.x >= 10 && op.x <= 11 && op.y >= 0 && op.y <= 1))).toBe(true);
    const landed = room.applyEdits(
      {
        requestIds: claimed!.requests.map((request) => request.id),
        baseVersion: room.view().version,
        reply: "the road",
        ops: nudged,
      },
      Date.now(),
      { silent: true },
    );
    expect(landed.rejected).toEqual([]);
    expect(room.view().entities.filter((entity) => entity.sprite === "road").length).toBe(nudged.length);
  });

  test("puts several cows beside the barn", () => {
    const room = new WorldRoom("COWS");
    const world = room.start("city");
    for (const row of world.terrain) row.fill("grass");
    world.entities = [
      {
        id: "barn",
        kind: "house",
        x: 18,
        y: 12,
        w: 3,
        h: 2,
        sprite: "house_large",
        label: "Ranch",
        createdBy: "agent",
      },
      {
        id: "note",
        kind: "sign",
        x: 8,
        y: 5,
        w: 1,
        h: 1,
        sprite: "sign",
        label: "add cows near the barn",
        createdBy: "agent",
      },
    ];
    const plan = planBatch(world, [{ id: "r", playerId: "a", playerName: "Jonnyy", text: "add cows near the barn" }]);
    const cows = plan.batch.ops.filter((op) => op.op === "place" && op.label === "Cow");
    expect(cows).toHaveLength(3);
    for (const cow of cows) {
      if (cow.op !== "place") continue;
      expect(cow.sprite).toBe("prop");
      expect(parseModel(cow.model ?? "")?.some((part) => part.shape === "cylinder")).toBe(true);
    }
    for (const cow of cows) {
      if (cow.op !== "place") continue;
      expect(cow.x).toBeGreaterThan(15);
      expect(cow.x).toBeLessThan(23);
      expect(cow.y).toBeGreaterThan(9);
      expect(cow.y).toBeLessThan(16);
      expect(cow.x >= 18 && cow.x <= 20 && cow.y >= 12 && cow.y <= 13).toBe(false);
    }
    expect(plan.batch.ops.some((op) => op.op === "remove" && op.id === "note")).toBe(true);
    const filled = supplementProps(
      [{ id: "r", playerId: "a", playerName: "Jonnyy", text: "add cows near the barn" }],
      [],
      plan.batch.ops,
    );
    expect(filled.filter((op) => op.op === "place" && op.label === "Cow")).toHaveLength(3);
  });

  test("turns the sky to night when asked", () => {
    const room = new WorldRoom("NIGHT");
    const world = room.start("city");
    const plan = planBatch(world, [{ id: "r", playerId: "a", playerName: "Jonnyy", text: "make it night time" }]);
    expect(plan.batch.ops.some((op) => op.op === "sky" && op.value === "night")).toBe(true);
    room.join({ id: "a", name: "Jonnyy", color: "#e85d4c", joinedAt: new Date().toISOString() });
    room.say("a", "make it night time");
    const claimed = room.claimBatch("worker");
    const applied = room.applyEdits({ ...plan.batch, requestIds: claimed!.requests.map((request) => request.id), baseVersion: room.view().version });
    expect(applied.rejected).toEqual([]);
    expect(room.view().sky).toBe("night");
  });

  test("keeps the requested color on the trees", () => {
    const room = new WorldRoom("TINT");
    const world = room.start("city");
    const request = { id: "r", playerId: "a", playerName: "Jonnyy", text: "add blue trees" };
    const plan = planBatch(world, [request]);
    const trees = plan.batch.ops.filter((op) => op.op === "place" && (op.sprite === "tree_oak" || op.sprite === "tree_pine"));
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      if (tree.op !== "place") continue;
      expect(namedColor(tree.label)).toBe(0x3b6fe0);
    }
    const carried = carryColor([request], [{ op: "place", kind: "tree", x: 1, y: 1, sprite: "tree_oak", label: "Oak" }]);
    expect(carried[0]).toMatchObject({ label: "Blue Oak" });
  });

  test("names a flying bird and keeps a chicken on the ground", () => {
    const room = new WorldRoom("FLY");
    const world = room.start("meadow");
    const plan = planBatch(world, [{ id: "r", playerId: "a", playerName: "elii", text: "add a flying bird" }]);
    const bird = plan.batch.ops.find((op) => op.op === "place" && /bird/i.test(op.label));
    expect(bird && bird.op === "place" && airborne(bird.label)).toBe(true);
    const perched = planBatch(world, [{ id: "r2", playerId: "a", playerName: "elii", text: "add a chicken" }]);
    const chicken = perched.batch.ops.find((op) => op.op === "place" && /chicken/i.test(op.label));
    expect(chicken && chicken.op === "place" && chicken.label).toBe("Chicken");
    expect(chicken && chicken.op === "place" && airborne(chicken.label)).toBe(false);
  });

  test("builds an animal with legs instead of a crate", () => {
    const boxes = "box 0.4 0.4 0.4 888888 0 0.2 0\nbox 0.2 0.2 0.2 888888 0 0.5 0\nbox 0.1 0.1 0.1 888888 0 0.7 0";
    expect(portrayal("Elephant")).toBe("animal");
    expect(modelFor("Elephant", boxes)).toBe(inventModel("Elephant"));
    const elephant = parseModel(inventModel("Elephant"));
    expect(elephant?.some((part) => part.shape === "cylinder")).toBe(true);
    expect(elephant?.some((part) => part.shape === "box" && part.b > part.a && part.x > 0.5)).toBe(true);
    const giraffe = parseModel(inventModel("Giraffe"));
    expect(giraffe?.some((part) => part.y > 1)).toBe(true);
    const snake = parseModel(inventModel("Snake"));
    expect(snake?.every((part) => part.shape !== "box")).toBe(true);
    const room = new WorldRoom("ANIM");
    const world = room.start("city");
    const plan = planBatch(world, [{ id: "r", playerId: "a", playerName: "Jonnyy", text: "add an elephant near the river" }]);
    expect(plan.batch.ops.some((op) => op.op === "place" && op.label === "Elephant")).toBe(true);
    expect(plan.batch.ops.some((op) => op.op === "paint" && op.terrain === "water")).toBe(false);
    const parsed = editBatchSchema.safeParse({
      requestIds: ["r"],
      baseVersion: 1,
      reply: "Added an elephant.",
      ops: [{ op: "place", kind: "custom", x: 1, y: 1, sprite: "prop", label: "Elephant", model: "" }],
    });
    expect(parsed.success).toBe(true);
  });

  test("builds a church with a steeple instead of a blob", () => {
    const blob = "box 0.46 0.36 0.4 c48945 0 0.28 0\nsphere 0.16 0 0 efb423 0 0.58 0\nbox 0.18 0.08 0.14 3d342c 0 0.12 0.16";
    expect(portrayal("Church")).toBe("building");
    expect(modelFor("Church", blob)).toBe(inventModel("Church"));
    const church = parseModel(inventModel("Church"));
    expect(church?.some((part) => part.shape === "cone" && part.y > 1)).toBe(true);
    expect(church?.some((part) => part.shape === "box" && part.a < 0.08 && part.b > 0.1)).toBe(true);
    expect(portrayal("School")).toBe("building");
    expect(inventModel("School")).not.toContain("sphere 0.16");
  });

  test("replaces a stack of boxes with a blue tree", () => {
    const boxes = "box 0.5 2 0.5 0000FF 0 0 0\nbox 0.4 1 0.4 0000FF 0 1 0";
    expect(portrayal("Blue Tree")).toBe("tree");
    expect(modelFor("Blue Tree", boxes)).toBe(inventModel("Blue Tree"));
    const parts = parseModel(inventModel("Blue Tree"));
    expect(parts?.some((part) => part.shape === "sphere" && part.color === 0x3b6fe0)).toBe(true);
    expect(parts?.some((part) => part.shape === "cylinder")).toBe(true);
  });

  test("friends furnish the inside of a building", () => {
    const room = new WorldRoom("ROOM");
    const world = room.start("Wilds");
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < world.terrain.length - 1 && !spot; y += 1) {
      for (let x = 0; x < (world.terrain[y]?.length ?? 0) - 1; x += 1) {
        const open =
          world.terrain[y]?.[x] === "grass" &&
          world.terrain[y]?.[x + 1] === "grass" &&
          world.terrain[y + 1]?.[x] === "grass" &&
          world.terrain[y + 1]?.[x + 1] === "grass" &&
          !world.entities.some((entity) => x < entity.x + entity.w && x + 2 > entity.x && y < entity.y + entity.h && y + 2 > entity.y);
        if (open) {
          spot = { x, y };
          break;
        }
      }
    }
    expect(spot).not.toBeNull();
    const placed = room.applyEdits({
      requestIds: [],
      baseVersion: world.version,
      reply: "a ranch",
      ops: [{ op: "place", kind: "house", x: spot!.x, y: spot!.y, w: 2, h: 2, sprite: "house_large", label: "Ranch" }],
    });
    expect(placed.applied).toBe(1);
    const ranch = room.view().entities.find((entity) => entity.label === "Ranch");
    expect(ranch).toBeTruthy();
    const plan = planBatch(room.view(), [{ id: "r1", playerId: "a", playerName: "elii", text: "add a blue couch", inside: ranch!.id }]);
    const couch = plan.batch.ops.find((op) => op.op === "place" && /couch/i.test(op.label));
    expect(couch?.op).toBe("place");
    if (couch?.op !== "place") return;
    expect(couch.inside).toBe(ranch!.id);
    expect(couch.label).toMatch(/blue/i);
    expect(couch.x).toBeGreaterThanOrEqual(0);
    expect(couch.x).toBeLessThan(8);
    expect(couch.y).toBeGreaterThanOrEqual(0);
    expect(couch.y).toBeLessThan(6);
    room.applyEdits({ ...plan.batch, requestIds: [], baseVersion: room.view().version });
    const furniture = room.view().entities.find((entity) => /couch/i.test(entity.label));
    expect(furniture?.inside).toBe(ranch!.id);
    const outside = room.view().entities.filter((entity) => !entity.inside).length;
    room.applyEdits({
      requestIds: [],
      baseVersion: room.view().version,
      reply: "the ranch is gone",
      ops: [{ op: "remove", id: ranch!.id }],
    });
    expect(room.view().entities.some((entity) => entity.inside === ranch!.id)).toBe(false);
    expect(room.view().entities.length).toBe(outside - 1);
  });

  test("a player can slide an object onto an open tile", () => {
    const room = new WorldRoom("SLIDE");
    const world = room.start("Wilds");
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < world.terrain.length && !spot; y += 1) {
      for (let x = 0; x < (world.terrain[y]?.length ?? 0) - 1; x += 1) {
        const open =
          world.terrain[y]?.[x] === "grass" &&
          world.terrain[y]?.[x + 1] === "grass" &&
          !world.entities.some((entity) => x < entity.x + entity.w && x + 2 > entity.x && y < entity.y + entity.h && y + 1 > entity.y);
        if (open) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    room.applyEdits({
      requestIds: [],
      baseVersion: world.version,
      reply: "a crate",
      ops: [{ op: "place", kind: "custom", x: spot!.x, y: spot!.y, sprite: "prop", label: "Crate" }],
    });
    const crate = room.view().entities.find((entity) => entity.label === "Crate");
    expect(crate).toBeTruthy();
    const version = room.view().version;
    const lines = room.view().chat.length;
    const blocked = room.relocate(crate!.id, spot!.x, spot!.y);
    expect(blocked.ok).toBe(true);
    expect(room.view().version).toBe(version);
    const moved = room.relocate(crate!.id, spot!.x + 1, spot!.y);
    expect(moved.ok).toBe(true);
    expect(room.view().entities.find((entity) => entity.id === crate!.id)?.x).toBe(spot!.x + 1);
    expect(room.view().chat.length).toBe(lines);
    const tree = room.view().entities.find((entity) => entity.kind === "tree");
    expect(tree).toBeTruthy();
    const rejected = room.relocate(crate!.id, tree!.x, tree!.y);
    expect(rejected.ok).toBe(false);
    expect(room.view().entities.find((entity) => entity.id === crate!.id)?.x).toBe(spot!.x + 1);
    const removed = room.remove(crate!.id);
    expect(removed.ok).toBe(true);
    expect(room.view().entities.some((entity) => entity.id === crate!.id)).toBe(false);
    expect(room.view().chat.length).toBe(lines);
    expect(room.remove(crate!.id).ok).toBe(false);
  });

  test("deleting a building removes its furniture and sends people outside", () => {
    const room = new WorldRoom("DROP");
    const world = room.start("Wilds");
    room.join({ id: "p", name: "Jonnyy", color: "#3b6fe0", joinedAt: new Date().toISOString() });
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < world.terrain.length - 1 && !spot; y += 1) {
      for (let x = 0; x < (world.terrain[y]?.length ?? 0) - 1; x += 1) {
        const open = [0, 1].every((dy) => [0, 1].every((dx) => world.terrain[y + dy]?.[x + dx] === "grass" && !world.entities.some((entity) => x + dx < entity.x + entity.w && x + dx + 1 > entity.x && y + dy < entity.y + entity.h && y + dy + 1 > entity.y)));
        if (open) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    const placed = room.applyEdits({
      requestIds: [],
      baseVersion: room.view().version,
      reply: "a cottage",
      ops: [{ op: "place", kind: "house", x: spot!.x, y: spot!.y, sprite: "house_small", label: "Cottage" }],
    });
    expect(placed.rejected).toEqual([]);
    const cottage = room.view().entities.find((entity) => entity.label === "Cottage");
    expect(cottage).toBeTruthy();
    const furnished = room.applyEdits({
      requestIds: [],
      baseVersion: room.view().version,
      reply: "a couch",
      ops: [{ op: "place", kind: "custom", x: 1, y: 1, sprite: "prop", label: "Couch", inside: cottage!.id }],
    });
    expect(furnished.rejected).toEqual([]);
    room.locate("p", cottage!.id);
    expect(room.view().players.find((player) => player.id === "p")?.inside).toBe(cottage!.id);
    expect(room.remove(cottage!.id).ok).toBe(true);
    expect(room.view().entities.some((entity) => entity.id === cottage!.id || entity.inside === cottage!.id)).toBe(false);
    expect(room.view().players.find((player) => player.id === "p")?.inside).toBeUndefined();
  });

  test("chat changes the object the player selected", () => {
    const room = new WorldRoom("EDIT");
    const world = room.start("Wilds");
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < world.terrain.length && !spot; y += 1) {
      for (let x = 0; x < world.terrain[y]!.length; x += 1) {
        if (world.terrain[y]?.[x] === "grass" && !world.entities.some((entity) => x < entity.x + entity.w && x + 1 > entity.x && y < entity.y + entity.h && y + 1 > entity.y)) {
          spot = { x, y };
        }
      }
    }
    room.applyEdits({
      requestIds: [],
      baseVersion: world.version,
      reply: "a couch",
      ops: [{ op: "place", kind: "custom", x: spot!.x, y: spot!.y, sprite: "prop", label: "Couch" }],
    });
    const couch = room.view().entities.find((entity) => entity.label === "Couch");
    expect(couch).toBeTruthy();
    const painted = planBatch(room.view(), [{ id: "r1", playerId: "a", playerName: "elii", text: "make it blue", focus: couch!.id }]);
    const update = painted.batch.ops.find((op) => op.op === "update");
    expect(update?.op).toBe("update");
    if (update?.op !== "update") return;
    expect(update.id).toBe(couch!.id);
    expect(update.label).toBe("Blue Couch");
    expect(painted.batch.ops.some((op) => op.op === "place")).toBe(false);
    const swapped = planBatch(room.view(), [{ id: "r2", playerId: "a", playerName: "elii", text: "turn it into a lamp", focus: couch!.id }]);
    const lamp = swapped.batch.ops.find((op) => op.op === "update");
    expect(lamp?.op === "update" && lamp.label).toBe("Lamp");
    const added = planBatch(room.view(), [{ id: "r3", playerId: "a", playerName: "elii", text: "add a rug", focus: couch!.id }]);
    expect(added.batch.ops.some((op) => op.op === "place" && /rug/i.test(op.label))).toBe(true);
    expect(added.batch.ops.some((op) => op.op === "update")).toBe(false);
  });

  test("a selected tile is where the next object is built", () => {
    const room = new WorldRoom("TILE");
    const world = room.start("Wilds");
    const open = (terrain: string) => {
      for (let y = 0; y < world.terrain.length - 1; y += 1) {
        for (let x = 0; x < world.terrain[y]!.length; x += 1) {
          const clear = !world.entities.some((entity) => !entity.inside && x < entity.x + entity.w && x + 1 > entity.x && y < entity.y + entity.h && y + 2 > entity.y);
          if (clear && world.terrain[y]?.[x] === terrain && world.terrain[y + 1]?.[x] === terrain) return { x, y };
        }
      }
      return null;
    };
    const grass = open("grass");
    expect(grass).toBeTruthy();
    const planned = planBatch(world, [{ id: "r1", playerId: "a", playerName: "elii", text: "add a campfire", spot: grass! }]);
    const fire = planned.batch.ops.find((op) => op.op === "place" && /campfire/i.test(op.label));
    expect(fire?.op === "place" && fire.x === grass!.x && fire.y === grass!.y).toBe(true);
    const applied = applyOps(world, planned.batch.ops);
    expect(applied.rejected).toEqual([]);
    expect(applied.world.entities.some((entity) => entity.x === grass!.x && entity.y === grass!.y && /campfire/i.test(entity.label))).toBe(true);

    const water = open("water");
    if (water) {
      const wet = planBatch(world, [{ id: "r2", playerId: "a", playerName: "elii", text: "add a tree", spot: water }]);
      const tree = wet.batch.ops.find((op) => op.op === "place" && /oak|tree|pine/i.test(op.label));
      expect(tree?.op === "place" && tree.x === water.x && tree.y === water.y).toBe(true);
      expect(wet.batch.ops.some((op) => op.op === "paint" && op.x === water.x && op.y === water.y && op.terrain === "grass")).toBe(true);
      expect(applyOps(world, wet.batch.ops).rejected).toEqual([]);
    }
  });

  test("a selected area keeps the road and the houses inside it", () => {
    const room = new WorldRoom("AREA");
    const world = room.start("Wilds");
    const free = (x: number, y: number, w: number, h: number) => {
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) {
          if (world.terrain[y + dy]?.[x + dx] !== "grass") return false;
        }
      }
      return true;
    };
    let line: { x: number; y: number } | null = null;
    for (let y = 0; y < world.terrain.length && !line; y += 1) {
      for (let x = 0; x <= 18; x += 1) if (free(x, y, 6, 1)) line = { x, y };
    }
    expect(line).toBeTruthy();
    const road = planBatch(world, [{ id: "r1", playerId: "a", playerName: "elii", text: "add a road", spot: { x: line!.x, y: line!.y, w: 6, h: 1 } }]);
    const roads = road.batch.ops.filter((op) => op.op === "place" && op.sprite === "road");
    expect(roads).toHaveLength(6);
    expect(roads.every((op) => op.op === "place" && op.y === line!.y && op.x >= line!.x && op.x < line!.x + 6)).toBe(true);
    expect(applyOps(world, road.batch.ops).rejected).toEqual([]);

    let block: { x: number; y: number } | null = null;
    for (let y = 0; y <= 12 && !block; y += 1) {
      for (let x = 0; x <= 18; x += 1) if (free(x, y, 6, 4)) block = { x, y };
    }
    expect(block).toBeTruthy();
    const homes = planBatch(world, [{ id: "r2", playerId: "a", playerName: "elii", text: "add a neighborhood", spot: { x: block!.x, y: block!.y, w: 6, h: 4 } }]);
    const houses = homes.batch.ops.filter((op) => op.op === "place" && op.sprite === "house_small");
    expect(houses.length).toBeGreaterThan(1);
    expect(houses.every((op) => op.op === "place" && op.x >= block!.x && op.y >= block!.y && op.x + 2 <= block!.x + 6 && op.y + 2 <= block!.y + 4)).toBe(true);
    expect(applyOps(world, homes.batch.ops).rejected).toEqual([]);
  });

  test("expands the map and keeps the pieces where they stood", () => {
    const room = new WorldRoom("GROW");
    const world = room.start("field");
    const tree = world.entities.find((entity) => !entity.inside);
    expect(tree).toBeTruthy();
    const plan = planBatch(world, [{ id: "r", playerId: "a", playerName: "Ada", text: "Expand the map" }]);
    expect(plan.batch.ops).toEqual([{ op: "grow", north: 4, east: 4, south: 4, west: 4 }]);
    expect(plan.batch.reply).toBe("I expanded the map to 32 by 24.");
    const applied = applyOps(world, plan.batch.ops);
    expect(applied.rejected).toEqual([]);
    expect(mapSize(applied.world)).toEqual({ w: 32, h: 24 });
    const moved = applied.world.entities.find((entity) => entity.id === tree!.id);
    expect(moved).toMatchObject({ x: tree!.x + 4, y: tree!.y + 4 });
    const east = planBatch(applied.world, [{ id: "e", playerId: "a", playerName: "Ada", text: "expand the map east" }]);
    expect(east.batch.ops).toEqual([{ op: "grow", north: 0, east: 8, south: 0, west: 0 }]);
    let current = applied.world;
    for (let step = 0; step < 4; step += 1) {
      const next = planBatch(current, [{ id: `g${step}`, playerId: "a", playerName: "Ada", text: "make the map bigger" }]);
      current = applyOps(current, next.batch.ops).world;
    }
    expect(mapSize(current)).toEqual({ w: 48, h: 32 });
    const full = planBatch(current, [{ id: "full", playerId: "a", playerName: "Ada", text: "expand the map" }]);
    expect(full.batch.ops).toEqual([]);
    expect(full.batch.reply).toBe("The map is already as large as it can be.");
  });

  test("sand dunes fill the selected ground instead of a marker", () => {
    const room = new WorldRoom("DUNE");
    const world = room.start("Wilds");
    const spot = { x: 0, y: 0, w: 6, h: 4 };
    const request = { id: "r", playerId: "a", playerName: "Jonnyy", text: "sand dunes", spot };
    const plan = planBatch(world, [request]);
    expect(plan.batch.ops.some((op) => op.op === "place")).toBe(false);
    expect(plan.batch.ops).toContainEqual({ op: "paint", x: 0, y: 0, w: 6, h: 4, terrain: "sand" });
    expect(plan.batch.reply).toBe("I raised sand dunes across the area you selected.");
    const applied = applyOps(world, plan.batch.ops);
    expect(applied.rejected).toEqual([]);
    expect(applied.world.terrain[0][0]).toBe("sand");
    expect(applied.world.terrain[3][5]).toBe("sand");
    expect(applied.world.terrain[0][6]).not.toBe("sand");

    const marked = carrySpot([request], world, [{ op: "place", kind: "custom", x: 1, y: 1, sprite: "prop", label: "Marker" }]);
    expect(marked.some((op) => op.op === "place")).toBe(false);
    expect(supplementLand([request], world, marked).some((op) => op.op === "place")).toBe(false);

    const open = planBatch(world, [{ id: "o", playerId: "a", playerName: "Jonnyy", text: "add sand dunes" }]);
    expect(open.batch.ops.some((op) => op.op === "place")).toBe(false);
    expect(open.batch.ops.some((op) => op.op === "paint" && op.terrain === "sand")).toBe(true);
    expect(open.batch.reply).toBe("I turned the open ground into sand dunes.");
  });

  test("rafters fill the selected area instead of a marker", () => {
    const room = new WorldRoom("BEAM");
    const world = room.start("Wilds");
    const spot = { x: 2, y: 10, w: 6, h: 3 };
    const plan = planBatch(world, [{ id: "r", playerId: "a", playerName: "Jonnyy", text: "add rafters", spot }]);
    const beams = plan.batch.ops.filter((op) => op.op === "place");
    expect(beams.length).toBeGreaterThanOrEqual(6);
    expect(beams.every((op) => op.op === "place" && op.label === "Rafter" && op.sprite === "prop" && op.x >= 2 && op.x < 8 && op.y >= 10 && op.y < 13)).toBe(true);
    expect(beams.some((op) => op.op === "place" && op.y === 10)).toBe(true);
    expect(beams.some((op) => op.op === "place" && op.y === 12)).toBe(true);
    expect(plan.batch.ops.some((op) => op.op === "place" && (op.label === "Marker" || op.sprite === "sign"))).toBe(false);
    expect(plan.batch.reply).toBe("I raised rafters across the area you selected.");
    expect(inventModel("Rafter")).toContain("cylinder");
    const applied = applyOps(world, plan.batch.ops);
    expect(applied.rejected).toEqual([]);
    expect(applied.world.entities.filter((entity) => entity.label === "Rafter").length).toBe(beams.length);

    const one = planBatch(world, [{ id: "g", playerId: "a", playerName: "Jonnyy", text: "add a gazebo", spot }]);
    const gazebos = one.batch.ops.filter((op) => op.op === "place");
    expect(gazebos).toHaveLength(1);
    expect(gazebos[0]).toMatchObject({ label: "Gazebo", sprite: "prop" });
  });

  test("making a hill taller raises the stone instead of repainting it", () => {
    const room = new WorldRoom("HILL");
    const world = room.start("Wilds");
    const spot = { x: 0, y: 0, w: 6, h: 4 };
    const hill = planBatch(world, [{ id: "h", playerId: "a", playerName: "Jonnyy", text: "add a hill", spot }]);
    const laid = applyOps(world, hill.batch.ops);
    expect(laid.rejected).toEqual([]);
    expect(laid.world.terrain[0][0]).toBe("stone");
    expect(laid.world.rise?.[0]?.[0] ?? 0).toBe(0);

    const taller = planBatch(laid.world, [{ id: "t", playerId: "a", playerName: "Jonnyy", text: "make the hill taller", spot }]);
    expect(taller.batch.ops).toEqual([{ op: "raise", x: 0, y: 0, w: 6, h: 4, by: 1 }]);
    expect(taller.batch.reply).toBe("I made the hill in that area taller.");
    let current = applyOps(laid.world, taller.batch.ops).world;
    expect(current.rise?.[0]?.[0]).toBe(1);
    expect(current.rise?.[3]?.[5]).toBe(1);
    expect(current.terrain[4]?.[0]).not.toBe("stone");

    for (let step = 0; step < 3; step += 1) {
      const next = planBatch(current, [{ id: `t${step}`, playerId: "a", playerName: "Jonnyy", text: "make the hill taller", spot }]);
      current = applyOps(current, next.batch.ops).world;
    }
    expect(current.rise?.[1]?.[1]).toBe(4);
    const capped = planBatch(current, [{ id: "cap", playerId: "a", playerName: "Jonnyy", text: "make the hill taller", spot }]);
    expect(capped.batch.ops).toEqual([]);
    expect(capped.batch.reply).toBe("The hill is already as tall as it can be.");
  });

  test("making a building taller adds a story", () => {
    const room = new WorldRoom("STORY");
    const world = room.start("Wilds");
    const placed = applyOps(world, [
      { op: "place", kind: "house", x: 0, y: 0, sprite: "house_small", label: "Cottage" },
      { op: "place", kind: "tree", x: 4, y: 0, sprite: "tree_oak", label: "Oak" },
    ]);
    expect(placed.rejected).toEqual([]);
    const cottage = placed.world.entities.find((entity) => entity.label === "Cottage");
    const oak = placed.world.entities.find((entity) => entity.label === "Oak");
    expect(cottage).toBeTruthy();
    const taller = planBatch(placed.world, [{ id: "t", playerId: "a", playerName: "Jonnyy", text: "make it taller", focus: cottage!.id }]);
    expect(taller.batch.ops).toEqual([{ op: "update", id: cottage!.id, stories: 2 }]);
    expect(taller.batch.reply).toBe("I added a story, so it is 2 stories tall.");
    const raised = applyOps(placed.world, taller.batch.ops);
    expect(raised.rejected).toEqual([]);
    expect(raised.world.entities.find((entity) => entity.id === cottage!.id)?.stories).toBe(2);
    expect(raised.world.entities.find((entity) => entity.id === oak!.id)?.stories).toBeUndefined();

    const named = planBatch(raised.world, [{ id: "n", playerId: "a", playerName: "Jonnyy", text: "make the cottage taller" }]);
    expect(named.batch.ops).toEqual([{ op: "update", id: cottage!.id, stories: 3 }]);

    const all = planBatch(placed.world, [{ id: "b", playerId: "a", playerName: "Jonnyy", text: "make the buildings taller" }]);
    expect(all.batch.ops).toEqual([{ op: "update", id: cottage!.id, stories: 2 }]);
    expect(all.batch.ops.some((op) => op.op === "update" && op.id === oak!.id)).toBe(false);

    const hill = planBatch(placed.world, [{ id: "h", playerId: "a", playerName: "Jonnyy", text: "make the hill taller", spot: { x: 0, y: 0, w: 4, h: 3 } }]);
    expect(hill.batch.ops.some((op) => op.op === "update")).toBe(false);

    let current = raised.world;
    for (let step = 0; step < 4; step += 1) {
      const next = planBatch(current, [{ id: `s${step}`, playerId: "a", playerName: "Jonnyy", text: "add another story", focus: cottage!.id }]);
      current = applyOps(current, next.batch.ops).world;
    }
    expect(current.entities.find((entity) => entity.id === cottage!.id)?.stories).toBe(6);
    const full = planBatch(current, [{ id: "full", playerId: "a", playerName: "Jonnyy", text: "make it taller", focus: cottage!.id }]);
    expect(full.batch.ops).toEqual([]);
    expect(full.batch.reply).toBe("That building is already as tall as it can be.");
  });

  test("an unknown name keeps a looked-up shape instead of the blob", async () => {
    const tractor = [
      "cylinder 0.08 0.2 0 222222 -0.22 0.1 0.16",
      "cylinder 0.08 0.2 0 222222 0.22 0.1 0.16",
      "box 0.72 0.28 0.4 2f8f3a 0 0.34 0",
      "box 0.36 0.22 0.32 2f8f3a 0.16 0.56 0",
      "sphere 0.1 0 0 eeeeee 0.38 0.56 0.12",
    ].join("\n");
    expect(shapeKey("The little Red Tractor")).toBe("tractor");
    expect(canonicalModel("box 0.4 0.8 0.4 aa0000 0 0 0\nsphere 0.2 0 0 111111 0 0.2 0\ncylinder 0.1 0.4 0 222222 0.3 0 0")).toContain("box 0.4 0.8 0.4 aa0000 0 0.4 0");
    expect(isStockBlob(inventModel("Gazebo"))).toBe(true);
    expect(usableModel(tractor)).toBe(true);
    expect(modelFor("Gazebo", inventModel("Gazebo"))).toBe(inventModel("Gazebo"));
    expect(modelFor("Gazebo", tractor)).toBe(tractor);

    let calls = 0;
    const ops = await attachShapes(
      [
        { op: "place", kind: "custom", x: 2, y: 2, sprite: "prop", label: "Red Tractor", model: inventModel("Red Tractor") },
        { op: "place", kind: "custom", x: 4, y: 2, sprite: "prop", label: "Blue Tractor", model: inventModel("Blue Tractor") },
        { op: "place", kind: "custom", x: 6, y: 2, sprite: "prop", label: "Church" },
        { op: "place", kind: "custom", x: 8, y: 2, sprite: "prop", label: "Cow" },
        { op: "update", id: "ent_gazebo", label: "Gazebo" },
      ],
      async (key) => {
        calls += 1;
        expect(["tractor", "gazebo"]).toContain(key);
        return key === "gazebo" ? null : tractor;
      },
    );
    expect(calls).toBe(2);
    const red = ops.find((op) => op.op === "place" && op.label === "Red Tractor");
    const blue = ops.find((op) => op.op === "place" && op.label === "Blue Tractor");
    const church = ops.find((op) => op.op === "place" && op.label === "Church");
    const cow = ops.find((op) => op.op === "place" && op.label === "Cow");
    const gazebo = ops.find((op) => op.op === "update");
    expect(red?.op === "place" && red.model?.includes("c23b3b")).toBe(true);
    expect(red?.op === "place" && red.model?.includes("222222")).toBe(true);
    expect(red?.op === "place" && isStockBlob(red.model ?? "")).toBe(false);
    expect(blue?.op === "place" && blue.model?.includes("3b6fe0")).toBe(true);
    expect(church?.op === "place" && church.model).toBeUndefined();
    expect(cow?.op === "place" && cow.model).toBeUndefined();
    expect(gazebo?.op === "update" && gazebo.model).toBeUndefined();

    const room = new WorldRoom("SHAP");
    const world = room.start("Shapes");
    const placed = applyOps(world, ops.filter((op) => op.op === "place" && op.label === "Red Tractor"));
    const entity = placed.world.entities.find((item) => item.label === "Red Tractor");
    expect(entity?.model?.includes("c23b3b")).toBe(true);
    expect(modelFor("Red Tractor", entity?.model)).toBe(entity?.model);

    const renamed = applyOps(placed.world, [{ op: "update", id: entity!.id, label: "Wagon", model: tractor }]);
    expect(renamed.world.entities.find((item) => item.id === entity!.id)?.model).toBe(tractor);
  });
});
