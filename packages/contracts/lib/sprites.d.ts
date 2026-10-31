import type { EntityKind } from "./types.js";
export declare const TILE_PX = 16;
export declare const SPRITE_IDS: readonly ["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"];
export type SpriteId = (typeof SPRITE_IDS)[number];
export interface SpriteInfo {
    kind: EntityKind;
    w: number;
    h: number;
    atlas: {
        x: number;
        y: number;
    };
}
export declare const SPRITES: Record<SpriteId, SpriteInfo>;
export declare function isSpriteId(value: string): value is SpriteId;
