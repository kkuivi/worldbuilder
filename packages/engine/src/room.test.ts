import { describe, expect, test } from "bun:test";
import { TERRAIN_HEIGHT, renderDigest } from "@worldbuilder/contracts";
import { planBatch } from "./plan";
import { WorldRoom } from "./room";

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
});
