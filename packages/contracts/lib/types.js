export const GRID_W = 24;
export const GRID_H = 16;
export const TERRAINS = ["grass", "water", "sand", "stone", "snow", "dirt"];
/** Surface height in world units. Water is the basin and stone is the hill. */
export const TERRAIN_HEIGHT = {
    water: 0.18,
    sand: 0.36,
    dirt: 0.46,
    grass: 0.56,
    snow: 0.64,
    stone: 1.12,
};
export const ENTITY_KINDS = [
    "tree",
    "house",
    "tower",
    "castle",
    "bridge",
    "road",
    "rock",
    "flower",
    "campfire",
    "boat",
    "npc",
    "sign",
    "custom",
];
export const PLAYER_COLORS = [
    "#e85d4c",
    "#ef9f27",
    "#2f9e8f",
    "#3b6fe0",
    "#7b4bb7",
    "#d85a9b",
    "#3d7a4a",
    "#1f6f8b",
];
