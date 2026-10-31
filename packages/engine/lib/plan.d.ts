import { type EditBatch, type WorldState } from "@worldbuilder/contracts";
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
export declare function planBatch(world: WorldState, requests: PlanRequest[]): {
    batch: EditBatch;
    lines: StatusLine[];
};
