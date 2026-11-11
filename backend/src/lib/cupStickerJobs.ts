import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';

export type CupStickerPayload = {
  orderLabel: string;
  cupLabel: string;
  itemName: string;
  printedAt: string;
  advisoryEn: string;
  advisorySi: string;
};

export type CupStickerJob = {
  id: string;
  storeId: string | null;
  printerName: string;
  stickers: CupStickerPayload[];
  status: 'pending' | 'printing' | 'done' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
};

/** In-memory queue (admin API is single-instance). Jobs expire after TTL. */
const JOB_TTL_MS = 10 * 60 * 1000;
/** Agent polls ~1.5s; allow lag / brief network blips before UI shows offline. */
const DEFAULT_PRESENCE_MAX_AGE_MS = 60_000;
const jobs = new Map<string, CupStickerJob>();
let lastAgentSeenAt = 0;
let heartbeatTableReady: Promise<void> | null = null;

async function ensureHeartbeatTable(): Promise<void> {
  if (!heartbeatTableReady) {
    heartbeatTableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "cup_sticker_agent_heartbeat" (
          "id" INTEGER PRIMARY KEY DEFAULT 1,
          "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((err) => {
      heartbeatTableReady = null;
      throw err;
    });
  }
  await heartbeatTableReady;
}

export function touchCupStickerAgent(): void {
  lastAgentSeenAt = Date.now();
  // Persist so "Agent online" works across API instances / restarts.
  void (async () => {
    try {
      await ensureHeartbeatTable();
      await prisma.$executeRawUnsafe(`
        INSERT INTO "cup_sticker_agent_heartbeat" ("id", "lastSeenAt")
        VALUES (1, NOW())
        ON CONFLICT ("id") DO UPDATE SET "lastSeenAt" = NOW()
      `);
    } catch {
      /* table may be unavailable during migrate — memory still updated */
    }
  })();
}

export function getCupStickerAgentPresence(maxAgeMs = DEFAULT_PRESENCE_MAX_AGE_MS): {
  online: boolean;
  lastSeenAt: number | null;
} {
  if (!lastAgentSeenAt) return { online: false, lastSeenAt: null };
  return {
    online: Date.now() - lastAgentSeenAt <= maxAgeMs,
    lastSeenAt: lastAgentSeenAt,
  };
}

/** Prefer DB heartbeat (shared), fall back to in-memory. */
export async function getCupStickerAgentPresenceAsync(
  maxAgeMs = DEFAULT_PRESENCE_MAX_AGE_MS,
): Promise<{ online: boolean; lastSeenAt: number | null }> {
  try {
    await ensureHeartbeatTable();
    const rows = await prisma.$queryRawUnsafe<Array<{ lastSeenAt: Date }>>(
      `SELECT "lastSeenAt" FROM "cup_sticker_agent_heartbeat" WHERE "id" = 1 LIMIT 1`,
    );
    const at = rows[0]?.lastSeenAt ? new Date(rows[0].lastSeenAt).getTime() : 0;
    if (at > 0) {
      if (at > lastAgentSeenAt) lastAgentSeenAt = at;
      return {
        online: Date.now() - at <= maxAgeMs,
        lastSeenAt: at,
      };
    }
  } catch {
    /* fall through */
  }
  return getCupStickerAgentPresence(maxAgeMs);
}

function prune() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function enqueueCupStickerJob(input: {
  storeId?: string | null;
  printerName: string;
  stickers: CupStickerPayload[];
}): CupStickerJob {
  prune();
  const now = Date.now();
  const job: CupStickerJob = {
    id: randomUUID(),
    storeId: input.storeId ?? null,
    printerName: input.printerName,
    stickers: input.stickers,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function getCupStickerJob(id: string): CupStickerJob | null {
  prune();
  return jobs.get(id) ?? null;
}

/** Claim the oldest pending job (optionally for one store). */
export function claimCupStickerJob(storeId?: string | null): CupStickerJob | null {
  prune();
  const pending = [...jobs.values()]
    .filter((j) => j.status === 'pending')
    .filter((j) => !storeId || !j.storeId || j.storeId === storeId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const job = pending[0];
  if (!job) return null;
  job.status = 'printing';
  job.updatedAt = Date.now();
  return job;
}

export function completeCupStickerJob(
  id: string,
  result: { ok: boolean; error?: string; printed?: number },
): CupStickerJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  job.status = result.ok ? 'done' : 'failed';
  job.error = result.ok ? undefined : result.error || 'Print failed';
  job.updatedAt = Date.now();
  return job;
}

/** Dedicated print-agent secret (not the internal service secret). Override with CUP_STICKER_AGENT_SECRET. */
export function cupStickerAgentSecret(): string {
  return process.env.CUP_STICKER_AGENT_SECRET?.trim() || 'bingchun-cup-sticker-local';
}
