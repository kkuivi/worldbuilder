import type { SpriteId } from "./sprites.js";
export declare const GRID_W = 24;
export declare const GRID_H = 16;
export declare const MAP_MAX_W = 48;
export declare const MAP_MAX_H = 32;
export declare const MAP_STEP = 4;
export declare const ROOM_W = 8;
export declare const ROOM_H = 6;
export interface GrowMargins {
    north: number;
    east: number;
    south: number;
    west: number;
}
export declare function mapSize(world: {
    terrain: unknown[][];
}): {
    w: number;
    h: number;
};
export declare function fitGrow(width: number, height: number, asked: GrowMargins): GrowMargins;
export declare const TERRAINS: readonly ["grass", "water", "sand", "stone", "snow", "dirt"];
export type Terrain = (typeof TERRAINS)[number];
export declare const SKIES: readonly ["day", "night"];
export type Sky = (typeof SKIES)[number];
/** Surface height in world units. Water is the basin and stone is the hill. */
export declare const TERRAIN_HEIGHT: Record<Terrain, number>;
export declare const ENTITY_KINDS: readonly ["tree", "house", "tower", "castle", "bridge", "road", "rock", "flower", "campfire", "boat", "npc", "sign", "custom"];
export type EntityKind = (typeof ENTITY_KINDS)[number];
export declare function canEnter(entity: {
    kind: EntityKind;
}): boolean;
export interface Entity {
    id: string;
    kind: EntityKind;
    x: number;
    y: number;
    w: number;
    h: number;
    sprite: SpriteId;
    label: string;
    note?: string;
    model?: string;
    inside?: string;
    createdBy: string;
}
export interface Player {
    id: string;
    name: string;
    color: string;
    joinedAt: string;
    inside?: string;
}
export interface ChatMessage {
    id: string;
    seq: number;
    at: string;
    from: string;
    role: "player" | "agent";
    text: string;
    requestId?: string;
}
export interface WorldState {
    worldId: string;
    name: string;
    version: number;
    sky?: Sky;
    terrain: Terrain[][];
    entities: Entity[];
    players: Player[];
    chat: ChatMessage[];
}
export interface PlayerRequest {
    id: string;
    worldId: string;
    playerId: string;
    text: string;
    at: string;
    inside?: string;
    focus?: string;
    spot?: {
        x: number;
        y: number;
        w?: number;
        h?: number;
    };
}
export type EditOp = {
    op: "paint";
    x: number;
    y: number;
    w: number;
    h: number;
    terrain: Terrain;
} | {
    op: "sky";
    value: Sky;
} | {
    op: "grow";
    north: number;
    east: number;
    south: number;
    west: number;
} | {
    op: "place";
    kind: EntityKind;
    x: number;
    y: number;
    w?: number;
    h?: number;
    sprite: SpriteId;
    label: string;
    note?: string;
    model?: string;
    inside?: string;
} | {
    op: "move";
    id: string;
    x: number;
    y: number;
} | {
    op: "remove";
    id: string;
} | {
    op: "update";
    id: string;
    label?: string;
    sprite?: SpriteId;
    note?: string;
    model?: string;
};
export interface EditBatch {
    requestIds: string[];
    baseVersion: number;
    ops: EditOp[];
    reply: string;
}
export interface ApplyResult {
    ok: boolean;
    version: number;
    applied: number;
    rejected: {
        index: number;
        reason: string;
    }[];
    stale: boolean;
}
export type WorldEventKind = "player_joined" | "chat" | "edits" | "agent_status" | "snapshot";
export interface WorldEvent {
    seq: number;
    at: string;
    kind: WorldEventKind;
    payload: unknown;
}
export interface EditsPayload {
    version: number;
    sky?: Sky;
    terrain: Terrain[][];
    entities: Entity[];
    message: ChatMessage;
    rejected: {
        index: number;
        reason: string;
    }[];
    stale: boolean;
    colors: string[];
    requestIds: string[];
}
export declare const PLAYER_COLORS: readonly ["#e85d4c", "#ef9f27", "#2f9e8f", "#3b6fe0", "#7b4bb7", "#d85a9b", "#3d7a4a", "#1f6f8b"];
