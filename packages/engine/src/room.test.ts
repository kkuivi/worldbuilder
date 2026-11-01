import { describe, expect, test } from "bun:test";
import { TERRAIN_HEIGHT, editBatchSchema, inventModel, modelFor, namedColor, parseModel, portrayal, renderDigest } from "@worldbuilder/contracts";
import { nudgeRejectedPlaces } from "./apply.js";
import { carryColor, planBatch, supplementProps } from "./plan.js";
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

  test("replaces a stack of boxes with a blue tree", () => {
    const boxes = "box 0.5 2 0.5 0000FF 0 0 0\nbox 0.4 1 0.4 0000FF 0 1 0";
    expect(portrayal("Blue Tree")).toBe("tree");
    expect(modelFor("Blue Tree", boxes)).toBe(inventModel("Blue Tree"));
    const parts = parseModel(inventModel("Blue Tree"));
    expect(parts?.some((part) => part.shape === "sphere" && part.color === 0x3b6fe0)).toBe(true);
    expect(parts?.some((part) => part.shape === "cylinder")).toBe(true);
  });
});
