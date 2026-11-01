import type { ApplyResult, ChatMessage, EditBatch, Player, PlayerRequest, WorldEvent, WorldState } from "@worldbuilder/contracts";
export interface QueuedRequest extends PlayerRequest {
    status: "pending" | "claimed" | "done";
    claimedBy?: string;
    leaseUntil?: number;
}
export interface ClaimedBatch {
    requests: PlayerRequest[];
    world: WorldState;
    baseVersion: number;
    leaseUntil: number;
}
export interface RoomDump {
    world: WorldState;
    queue: QueuedRequest[];
    events: WorldEvent[];
    seq: number;
    started: boolean;
}
export declare function starterWorld(worldId: string, name: string): WorldState;
export declare class WorldRoom {
    readonly id: string;
    private world;
    private queue;
    private events;
    private seq;
    private idCounter;
    constructor(id: string);
    dump(): RoomDump;
    load(dump: RoomDump): void;
    started(): boolean;
    currentSeq(): number;
    start(name: string): WorldState;
    view(): WorldState;
    pendingCount(now?: number): number;
    join(player: Player): WorldState;
    locate(playerId: string, inside: string | null): void;
    say(playerId: string, text: string, inside?: string, focus?: string, spot?: {
        x: number;
        y: number;
        w?: number;
        h?: number;
    }): {
        requestId: string;
        message: ChatMessage;
    };
    claimBatch(workerId: string, now?: number): ClaimedBatch | null;
    relocate(id: string, x: number, y: number): {
        ok: boolean;
        reason?: string;
    };
    applyEdits(batch: EditBatch, now?: number, options?: {
        silent?: boolean;
    }): ApplyResult;
    postStatus(text: string, from?: string): WorldEvent;
    releaseExpired(now?: number): number;
    onAlarm(now?: number): number;
    eventsSince(seq: number): WorldEvent[];
    private require;
    private pushChat;
    private emit;
    private nextId;
}
