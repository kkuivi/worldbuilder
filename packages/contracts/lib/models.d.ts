export interface ModelPart {
    shape: "box" | "sphere" | "cone" | "cylinder";
    a: number;
    b: number;
    c: number;
    color: number;
    x: number;
    y: number;
    z: number;
}
export declare function parseModel(spec: string): ModelPart[] | null;
export type Portrayal = "tree" | "animal" | "building" | "custom";
export declare function namedColor(label: string): number | null;
export declare function shapeKey(label: string): string;
export declare function wantsShape(label: string): boolean;
export declare function colorWord(text: string): string | null;
export declare function coloredNouns(text: string): Array<{
    color: string;
    noun: string;
}>;
export declare function animalNames(text: string): string[];
export declare function airborne(label: string): boolean;
export declare function furnitureNames(text: string): string[];
export declare function isFurniture(label: string): boolean;
export declare function portrayal(label: string): Portrayal;
export declare function inventModel(label: string): string;
export declare function isStockBlob(spec: string): boolean;
export declare function usableModel(spec: string | undefined): boolean;
export declare function formatModel(parts: ModelPart[]): string;
export declare function canonicalModel(spec: string): string | null;
export declare function tintModel(spec: string, label: string): string;
export declare function modelFor(label: string, supplied?: string): string;
