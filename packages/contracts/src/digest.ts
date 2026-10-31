import { SPRITES, type SpriteId } from "./sprites.js";
import { TERRAIN_HEIGHT, type Terrain, type WorldState } from "./types.js";

const TERRAIN_CHAR: Record<Terrain, string> = {
  grass: ".",
  water: "~",
  sand: "s",
  stone: "#",
  snow: "*",
  dirt: "d",
};

const SPRITE_CHAR: Record<SpriteId, string> = {
  tree_oak: "T",
  tree_pine: "P",
  bush: "b",
  flower: "f",
  rock: "r",
  stump: "u",
  house_small: "h",
  house_large: "H",
  tower: "Y",
  castle: "C",
  well: "w",
  fence: "n",
  bridge: "B",
  road: "=",
  sign: "S",
  campfire: "F",
  boat: "o",
  npc_villager: "V",
  npc_knight: "K",
  npc_merchant: "M",
  npc_child: "c",
  animal_cat: "a",
  animal_dog: "g",
};

export function renderDigest(world: WorldState): string {
  const width = world.terrain[0]?.length ?? 0;
  const height = world.terrain.length;
  const grid = world.terrain.map((row) => row.map((cell) => TERRAIN_CHAR[cell]));

  const legend = new Map<string, string>();
  for (const [terrain, char] of Object.entries(TERRAIN_CHAR)) legend.set(char, terrain);

  for (const entity of world.entities) {
    const char = SPRITE_CHAR[entity.sprite];
    legend.set(char, entity.sprite);
    for (let dy = 0; dy < entity.h; dy += 1) {
      for (let dx = 0; dx < entity.w; dx += 1) {
        const y = entity.y + dy;
        const x = entity.x + dx;
        if (grid[y]?.[x]) grid[y][x] = char;
      }
    }
  }

  const header = Array.from({ length: width }, (_, x) => String(x % 10)).join("");
  const rows = grid.map((row, y) => `${String(y).padStart(2, "0")} ${row.join("")}`);
  const players = world.players.map((player) => `${player.name} (${player.id})`).join(", ") || "none";
  const entities = world.entities
    .map(
      (entity) =>
        `- ${entity.id} ${entity.sprite} "${entity.label}" at ${entity.x},${entity.y} ${entity.w}x${entity.h} by ${entity.createdBy}${entity.note ? ` note: ${entity.note}` : ""}`,
    )
    .join("\n");
  const chat = world.chat
    .slice(-12)
    .map((message) => {
      const name = message.role === "agent" ? message.from : world.players.find((player) => player.id === message.from)?.name ?? message.from;
      return `${name}: ${message.text}`;
    })
    .join("\n");
  const spriteList = Object.entries(SPRITES)
    .map(([id, info]) => `${id} (${info.kind}, ${info.w}x${info.h})`)
    .join(", ");

  const heights = Object.entries(TERRAIN_HEIGHT)
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name)
    .join(", ");

  return [
    `World ${world.name} (${world.worldId}) version ${world.version}. Grid ${width} wide by ${height} tall. Origin is the top left.`,
    `Height, lowest to highest: ${heights}. Objects stand on the tiles under them. Painting a tile changes its height.`,
    `Players: ${players}`,
    `Sprites: ${spriteList}`,
    `Map characters: ${[...legend.entries()].map(([char, name]) => `${char}=${name}`).join(" ")}`,
    `   ${header}`,
    rows.join("\n"),
    "Entities:",
    entities || "(none)",
    "Recent chat:",
    chat || "(none)",
  ].join("\n");
}
