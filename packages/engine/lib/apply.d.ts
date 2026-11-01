import { type EditOp, type Entity, type WorldState } from "@worldbuilder/contracts";
export interface OpRejection {
    index: number;
    reason: string;
}
export interface ApplyOpsResult {
    world: WorldState;
    applied: EditOp[];
    rejected: OpRejection[];
    spawned: {
        index: number;
        id: string;
    }[];
}
export declare function cloneWorld(world: WorldState): WorldState;
export declare function nudgeRejectedPlaces(world: WorldState, ops: EditOp[]): EditOp[];
export declare function placementError(world: WorldState, entity: Entity, ignoreId?: string): string | null;
export declare function applyOps(world: WorldState, ops: EditOp[]): ApplyOpsResult;
