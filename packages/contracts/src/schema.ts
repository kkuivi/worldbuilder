import { z } from "zod";
import { SPRITE_IDS } from "./sprites.js";
import { ENTITY_KINDS, MAP_MAX_H, MAP_MAX_W, SKIES, TERRAINS } from "./types.js";

const modelField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(700).optional(),
);

export const terrainSchema = z.enum(TERRAINS);
export const skySchema = z.enum(SKIES);
export const entityKindSchema = z.enum(ENTITY_KINDS);
export const spriteIdSchema = z.enum(SPRITE_IDS);

export const editOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("paint"),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().positive().max(MAP_MAX_W),
    h: z.number().int().positive().max(MAP_MAX_H),
    terrain: terrainSchema,
  }),
  z.object({
    op: z.literal("sky"),
    value: skySchema,
  }),
  z.object({
    op: z.literal("grow"),
    north: z.number().int().nonnegative().max(16),
    east: z.number().int().nonnegative().max(16),
    south: z.number().int().nonnegative().max(16),
    west: z.number().int().nonnegative().max(16),
  }),
  z.object({
    op: z.literal("place"),
    kind: entityKindSchema,
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().positive().max(8).optional(),
    h: z.number().int().positive().max(8).optional(),
    sprite: spriteIdSchema,
    label: z.string().trim().min(1).max(40),
    note: z.string().trim().max(160).optional(),
    model: modelField,
    inside: z.string().trim().min(1).max(40).optional(),
  }),
  z.object({
    op: z.literal("move"),
    id: z.string().min(1),
    x: z.number().int(),
    y: z.number().int(),
  }),
  z.object({
    op: z.literal("remove"),
    id: z.string().min(1),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string().min(1),
    label: z.string().trim().min(1).max(40).optional(),
    sprite: spriteIdSchema.optional(),
    note: z.string().trim().max(160).optional(),
    model: modelField,
  }),
]);

export const editBatchSchema = z.object({
  requestIds: z.array(z.string()).max(12),
  baseVersion: z.number().int().nonnegative(),
  ops: z.array(editOpSchema).max(48),
  reply: z.string().trim().min(1).max(500),
});

export const agentProposalSchema = z.object({
  from: z.enum(["architect", "naturalist", "storyteller"]),
  ops: z.array(editOpSchema).max(24),
  rationale: z.string().trim().min(1).max(280),
  concerns: z.array(z.string().max(180)).max(4),
});
