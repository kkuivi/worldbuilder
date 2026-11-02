import { type EditBatch, type EditOp, type Entity, type GrowMargins, type WorldState } from "@worldbuilder/contracts";
export interface PlanRequest {
    id: string;
    playerId: string;
    playerName: string;
    text: string;
    inside?: string;
    focus?: string;
    spot?: {
        x: number;
        y: number;
        w?: number;
        h?: number;
    };
}
export interface StatusLine {
    from: string;
    text: string;
}
export declare function growAsk(text: string): GrowMargins | null;
export declare function supplementGrow(requests: PlanRequest[], world: WorldState, chosen: EditOp[]): EditOp[];
export declare function skyAsk(requests: PlanRequest[]): "day" | "night" | null;
export declare function carryMotion(requests: PlanRequest[], ops: EditOp[]): EditOp[];
export declare function carryColor(requests: PlanRequest[], ops: EditOp[]): EditOp[];
export declare function supplementSky(requests: PlanRequest[], chosen: EditOp[], _local: EditOp[]): EditOp[];
export declare function wantsFocusEdit(text: string, entity: Entity): boolean;
export declare function focusEdits(entity: Entity, text: string): EditOp[];
export declare function carryFocus(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[];
export declare function landReply(requests: PlanRequest[], ops: EditOp[]): string | null;
export declare function supplementLand(requests: PlanRequest[], world: WorldState, chosen: EditOp[]): EditOp[];
export declare function carrySpot(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[];
export declare function carryInterior(requests: PlanRequest[], world: WorldState, ops: EditOp[]): EditOp[];
export declare function supplementProps(requests: PlanRequest[], chosen: EditOp[], local: EditOp[]): EditOp[];
export declare function planBatch(world: WorldState, incoming: PlanRequest[]): {
    batch: EditBatch;
    lines: StatusLine[];
};
