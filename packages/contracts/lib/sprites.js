export const TILE_PX = 16;
export const SPRITE_IDS = [
    "tree_oak",
    "tree_pine",
    "bush",
    "flower",
    "rock",
    "stump",
    "house_small",
    "house_large",
    "tower",
    "castle",
    "well",
    "fence",
    "bridge",
    "road",
    "sign",
    "campfire",
    "boat",
    "npc_villager",
    "npc_knight",
    "npc_merchant",
    "npc_child",
    "animal_cat",
    "animal_dog",
];
function info(kind, w, h, atlas) {
    return { kind, w, h, atlas };
}
export const SPRITES = {
    tree_oak: info("tree", 1, 2, { x: 0, y: 0 }),
    tree_pine: info("tree", 1, 2, { x: 1, y: 0 }),
    bush: info("custom", 1, 1, { x: 2, y: 0 }),
    flower: info("flower", 1, 1, { x: 3, y: 0 }),
    rock: info("rock", 1, 1, { x: 4, y: 0 }),
    stump: info("custom", 1, 1, { x: 5, y: 0 }),
    house_small: info("house", 2, 2, { x: 0, y: 2 }),
    house_large: info("house", 3, 2, { x: 2, y: 2 }),
    tower: info("tower", 2, 2, { x: 0, y: 4 }),
    castle: info("castle", 3, 3, { x: 2, y: 4 }),
    well: info("custom", 1, 1, { x: 6, y: 0 }),
    fence: info("custom", 1, 1, { x: 7, y: 0 }),
    bridge: info("bridge", 3, 1, { x: 0, y: 7 }),
    road: info("road", 1, 1, { x: 3, y: 7 }),
    sign: info("sign", 1, 1, { x: 4, y: 7 }),
    campfire: info("campfire", 1, 1, { x: 5, y: 7 }),
    boat: info("boat", 2, 1, { x: 6, y: 7 }),
    npc_villager: info("npc", 1, 1, { x: 0, y: 8 }),
    npc_knight: info("npc", 1, 1, { x: 1, y: 8 }),
    npc_merchant: info("npc", 1, 1, { x: 2, y: 8 }),
    npc_child: info("npc", 1, 1, { x: 3, y: 8 }),
    animal_cat: info("custom", 1, 1, { x: 4, y: 8 }),
    animal_dog: info("custom", 1, 1, { x: 5, y: 8 }),
};
export function isSpriteId(value) {
    return Object.prototype.hasOwnProperty.call(SPRITES, value);
}
