import { type EditBatch, type EditOp, type WorldState } from "@worldbuilder/contracts";
export interface PlanRequest {
    id: string;
    playerId: string;
    playerName: string;
    text: string;
}
export interface StatusLine {
    from: string;
    text: string;
}
export declare function skyAsk(requests: PlanRequest[]): "day" | "night" | null;
export declare function carryMotion(requests: PlanRequest[], ops: EditOp[]): EditOp[];
export declare function carryColor(requests: PlanRequest[], ops: EditOp[]): EditOp[];
export declare function supplementSky(requests: PlanRequest[], chosen: EditOp[], _local: EditOp[]): EditOp[];
export declare function supplementProps(requests: PlanRequest[], chosen: EditOp[], local: EditOp[]): EditOp[];
export declare function planBatch(world: WorldState, requests: PlanRequest[]): {
    batch: EditBatch;
    lines: StatusLine[];
};
