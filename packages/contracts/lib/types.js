export const GRID_W = 24;
export const GRID_H = 16;
export const MAP_MAX_W = 48;
export const MAP_MAX_H = 32;
export const MAP_STEP = 4;
export const ROOM_W = 8;
export const ROOM_H = 6;
export function mapSize(world) {
    const h = world.terrain.length;
    const w = world.terrain[0]?.length ?? 0;
    return { w: w || GRID_W, h: h || GRID_H };
}
export function fitGrow(width, height, asked) {
    let north = Math.max(0, Math.floor(asked.north));
    let east = Math.max(0, Math.floor(asked.east));
    let south = Math.max(0, Math.floor(asked.south));
    let west = Math.max(0, Math.floor(asked.west));
    const roomW = Math.max(0, MAP_MAX_W - width);
    const roomH = Math.max(0, MAP_MAX_H - height);
    if (east + west > roomW) {
        west = Math.min(west, roomW);
        east = Math.min(east, roomW - west);
    }
    if (north + south > roomH) {
        north = Math.min(north, roomH);
        south = Math.min(south, roomH - north);
    }
    return { north, east, south, west };
}
export const TERRAINS = ["grass", "water", "sand", "stone", "snow", "dirt"];
export const SKIES = ["day", "night"];
/** Surface height in world units. Water is the basin and stone is the hill. */
export const TERRAIN_HEIGHT = {
    water: 0.18,
    sand: 0.36,
    dirt: 0.46,
    grass: 0.56,
    snow: 0.64,
    stone: 1.12,
};
/** Extra steps a hill can rise above its terrain. Each step is HILL_STEP world units. */
export const HILL_MAX = 4;
export const HILL_STEP = 0.72;
/** Floors a building can have, including the ground floor. */
export const STORY_MAX = 6;
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
export function canEnter(entity) {
    return entity.kind === "house" || entity.kind === "tower" || entity.kind === "castle";
}
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
