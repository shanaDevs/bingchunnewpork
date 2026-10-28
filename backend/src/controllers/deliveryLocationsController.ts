import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { success } from '../utils/apiResponse';
import { ingestDriverLocation } from '../lib/socket';

const pointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
  speedKph: z.number().optional(),
  /** Kotlin app field name (legacy). */
  speed: z.number().optional(),
  heading: z.number().optional(),
  batteryPct: z.number().int().optional(),
  jobId: z.string().optional(),
  recordedAt: z.string().optional(),
  /** Kotlin app field name. */
  capturedAt: z.string().optional(),
  timestamp: z.string().optional(),
});

const wrappedSchema = z.object({
  jobId: z.string().optional().nullable(),
  points: z.array(pointSchema).min(1).max(200),
});

const arraySchema = z.array(pointSchema).min(1).max(200);

/** Accept both `{ jobId, points: [...] }` (Kotlin) and raw `[...]` (delivery-service). */
export async function batchLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const storeId = req.user!.storeId;

    let points: z.infer<typeof pointSchema>[];
    let batchJobId: string | undefined;

    if (Array.isArray(req.body)) {
      points = arraySchema.parse(req.body);
    } else {
      const wrapped = wrappedSchema.parse(req.body);
      points = wrapped.points;
      batchJobId = wrapped.jobId ?? undefined;
    }

    const ordered = [...points].sort((a, b) => {
      const aAt = a.recordedAt ?? a.capturedAt ?? a.timestamp ?? '';
      const bAt = b.recordedAt ?? b.capturedAt ?? b.timestamp ?? '';
      return aAt.localeCompare(bAt);
    });

    for (const loc of ordered) {
      await ingestDriverLocation(driverId, storeId, {
        lat: loc.lat,
        lng: loc.lng,
        accuracyM: loc.accuracyM ?? null,
        speedKph: loc.speedKph ?? loc.speed ?? null,
        heading: loc.heading ?? null,
        batteryPct: loc.batteryPct ?? null,
        jobId: loc.jobId ?? batchJobId ?? null,
        recordedAt: loc.recordedAt ?? loc.capturedAt ?? loc.timestamp ?? null,
      });
    }

    return success(res, { recorded: points.length });
  } catch (err) {
    next(err);
  }
}
