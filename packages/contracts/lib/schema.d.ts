import { z } from "zod";
export declare const terrainSchema: z.ZodEnum<["grass", "water", "sand", "stone", "snow", "dirt"]>;
export declare const entityKindSchema: z.ZodEnum<["tree", "house", "tower", "castle", "bridge", "road", "rock", "flower", "campfire", "boat", "npc", "sign", "custom"]>;
export declare const spriteIdSchema: z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>;
export declare const editOpSchema: z.ZodDiscriminatedUnion<"op", [z.ZodObject<{
    op: z.ZodLiteral<"paint">;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
    terrain: z.ZodEnum<["grass", "water", "sand", "stone", "snow", "dirt"]>;
}, "strip", z.ZodTypeAny, {
    h: number;
    w: number;
    terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
    op: "paint";
    x: number;
    y: number;
}, {
    h: number;
    w: number;
    terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
    op: "paint";
    x: number;
    y: number;
}>, z.ZodObject<{
    op: z.ZodLiteral<"place">;
    kind: z.ZodEnum<["tree", "house", "tower", "castle", "bridge", "road", "rock", "flower", "campfire", "boat", "npc", "sign", "custom"]>;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
    sprite: z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>;
    label: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    op: "place";
    x: number;
    y: number;
    kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
    sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
    label: string;
    h?: number | undefined;
    w?: number | undefined;
    note?: string | undefined;
}, {
    op: "place";
    x: number;
    y: number;
    kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
    sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
    label: string;
    h?: number | undefined;
    w?: number | undefined;
    note?: string | undefined;
}>, z.ZodObject<{
    op: z.ZodLiteral<"move">;
    id: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    op: "move";
    x: number;
    y: number;
}, {
    id: string;
    op: "move";
    x: number;
    y: number;
}>, z.ZodObject<{
    op: z.ZodLiteral<"remove">;
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    op: "remove";
}, {
    id: string;
    op: "remove";
}>, z.ZodObject<{
    op: z.ZodLiteral<"update">;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    sprite: z.ZodOptional<z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    op: "update";
    sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
    label?: string | undefined;
    note?: string | undefined;
}, {
    id: string;
    op: "update";
    sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
    label?: string | undefined;
    note?: string | undefined;
}>]>;
export declare const editBatchSchema: z.ZodObject<{
    requestIds: z.ZodArray<z.ZodString, "many">;
    baseVersion: z.ZodNumber;
    ops: z.ZodArray<z.ZodDiscriminatedUnion<"op", [z.ZodObject<{
        op: z.ZodLiteral<"paint">;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
        terrain: z.ZodEnum<["grass", "water", "sand", "stone", "snow", "dirt"]>;
    }, "strip", z.ZodTypeAny, {
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    }, {
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    }>, z.ZodObject<{
        op: z.ZodLiteral<"place">;
        kind: z.ZodEnum<["tree", "house", "tower", "castle", "bridge", "road", "rock", "flower", "campfire", "boat", "npc", "sign", "custom"]>;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
        sprite: z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>;
        label: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    }, {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    }>, z.ZodObject<{
        op: z.ZodLiteral<"move">;
        id: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        op: "move";
        x: number;
        y: number;
    }, {
        id: string;
        op: "move";
        x: number;
        y: number;
    }>, z.ZodObject<{
        op: z.ZodLiteral<"remove">;
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        op: "remove";
    }, {
        id: string;
        op: "remove";
    }>, z.ZodObject<{
        op: z.ZodLiteral<"update">;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        sprite: z.ZodOptional<z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>>;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    }, {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    }>]>, "many">;
    reply: z.ZodString;
}, "strip", z.ZodTypeAny, {
    requestIds: string[];
    baseVersion: number;
    ops: ({
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    } | {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    } | {
        id: string;
        op: "move";
        x: number;
        y: number;
    } | {
        id: string;
        op: "remove";
    } | {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    })[];
    reply: string;
}, {
    requestIds: string[];
    baseVersion: number;
    ops: ({
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    } | {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    } | {
        id: string;
        op: "move";
        x: number;
        y: number;
    } | {
        id: string;
        op: "remove";
    } | {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    })[];
    reply: string;
}>;
export declare const agentProposalSchema: z.ZodObject<{
    from: z.ZodEnum<["architect", "naturalist", "storyteller"]>;
    ops: z.ZodArray<z.ZodDiscriminatedUnion<"op", [z.ZodObject<{
        op: z.ZodLiteral<"paint">;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
        terrain: z.ZodEnum<["grass", "water", "sand", "stone", "snow", "dirt"]>;
    }, "strip", z.ZodTypeAny, {
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    }, {
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    }>, z.ZodObject<{
        op: z.ZodLiteral<"place">;
        kind: z.ZodEnum<["tree", "house", "tower", "castle", "bridge", "road", "rock", "flower", "campfire", "boat", "npc", "sign", "custom"]>;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
        sprite: z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>;
        label: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    }, {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    }>, z.ZodObject<{
        op: z.ZodLiteral<"move">;
        id: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        op: "move";
        x: number;
        y: number;
    }, {
        id: string;
        op: "move";
        x: number;
        y: number;
    }>, z.ZodObject<{
        op: z.ZodLiteral<"remove">;
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        op: "remove";
    }, {
        id: string;
        op: "remove";
    }>, z.ZodObject<{
        op: z.ZodLiteral<"update">;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        sprite: z.ZodOptional<z.ZodEnum<["tree_oak", "tree_pine", "bush", "flower", "rock", "stump", "house_small", "house_large", "tower", "castle", "well", "fence", "bridge", "road", "sign", "campfire", "boat", "npc_villager", "npc_knight", "npc_merchant", "npc_child", "animal_cat", "animal_dog"]>>;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    }, {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    }>]>, "many">;
    rationale: z.ZodString;
    concerns: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    ops: ({
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    } | {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    } | {
        id: string;
        op: "move";
        x: number;
        y: number;
    } | {
        id: string;
        op: "remove";
    } | {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    })[];
    from: "architect" | "naturalist" | "storyteller";
    rationale: string;
    concerns: string[];
}, {
    ops: ({
        h: number;
        w: number;
        terrain: "grass" | "water" | "sand" | "stone" | "snow" | "dirt";
        op: "paint";
        x: number;
        y: number;
    } | {
        op: "place";
        x: number;
        y: number;
        kind: "tree" | "house" | "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "npc" | "sign" | "custom";
        sprite: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog";
        label: string;
        h?: number | undefined;
        w?: number | undefined;
        note?: string | undefined;
    } | {
        id: string;
        op: "move";
        x: number;
        y: number;
    } | {
        id: string;
        op: "remove";
    } | {
        id: string;
        op: "update";
        sprite?: "tower" | "castle" | "bridge" | "road" | "rock" | "flower" | "campfire" | "boat" | "sign" | "tree_oak" | "tree_pine" | "bush" | "stump" | "house_small" | "house_large" | "well" | "fence" | "npc_villager" | "npc_knight" | "npc_merchant" | "npc_child" | "animal_cat" | "animal_dog" | undefined;
        label?: string | undefined;
        note?: string | undefined;
    })[];
    from: "architect" | "naturalist" | "storyteller";
    rationale: string;
    concerns: string[];
}>;
