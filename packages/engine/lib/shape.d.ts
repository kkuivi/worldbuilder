import { type EditOp } from "@worldbuilder/contracts";
export declare function attachShapes(ops: EditOp[], lookup: (key: string) => Promise<string | null>): Promise<EditOp[]>;
