import { z } from 'zod';

export const locationPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
  speedKph: z.number().optional(),
  heading: z.number().optional(),
  batteryPct: z.number().int().optional(),
  jobId: z.string().optional(),
  recordedAt: z.string().optional(),
});

export const locationBatchSchema = z.array(locationPointSchema).min(1).max(200);
