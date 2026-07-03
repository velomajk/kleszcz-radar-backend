import { z } from "zod";

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = z.string().date().refine((value) => value <= today(), "Date cannot be in the future");

export const reportInputSchema = z.object({
  email: z.string().email().max(254),
  turnstileToken: z.string().min(1).max(4096),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  occurredOn: isoDate,
  placeType: z.enum(["forest", "meadow", "park", "garden", "allotment", "urban", "other"]),
  subjectType: z.enum(["adult", "child", "animal"]),
  tickRemoved: z.boolean(),
  removalMethod: z.enum(["tweezers", "tick_tool", "fingers", "professional", "other", "unknown"]).optional(),
  estimatedAttachmentHours: z.number().int().min(0).max(24 * 30).optional(),
}).strict().refine((input) => input.tickRemoved || input.removalMethod === undefined, {
  message: "Removal method is only valid when the tick was removed",
  path: ["removalMethod"],
});

export const magicTokenSchema = z.object({ token: z.string().min(40).max(100) }).strict();

export const symptomInputSchema = z.object({
  rash: z.boolean().default(false),
  expandingRash: z.boolean().default(false),
  fever: z.boolean().default(false),
  headache: z.boolean().default(false),
  muscleOrJointPain: z.boolean().default(false),
  neckStiffness: z.boolean().default(false),
  nauseaOrVomiting: z.boolean().default(false),
  neurologicalSymptoms: z.boolean().default(false),
  doctorContacted: z.boolean().default(false),
  observedAt: z.string().datetime().refine((value) => new Date(value) <= new Date(), "Timestamp cannot be in the future"),
}).strict();

export const heatmapQuerySchema = z.object({
  window: z.enum(["7d", "14d", "30d", "season"]).default("30d"),
  placeType: z.enum(["forest", "meadow", "park", "garden", "allotment", "urban", "other"]).optional(),
  subjectType: z.enum(["adult", "child", "animal"]).optional(),
  // Requested aggregation resolution. Coarser (lower) values let wide map
  // views accumulate enough reports per cell to clear the privacy threshold.
  // The service clamps this to [COARSEST_RESOLUTION, H3_RESOLUTION], so
  // clients can never request finer-grained data than is stored.
  resolution: z.coerce.number().int().min(0).max(15).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
}).refine((q) => [q.north, q.south, q.east, q.west].every((v) => v === undefined) || [q.north, q.south, q.east, q.west].every((v) => v !== undefined), "Provide the complete bounding box");

export type ReportInput = z.infer<typeof reportInputSchema>;
export type SymptomInput = z.infer<typeof symptomInputSchema>;
