import { randomUUID } from 'node:crypto';

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
const jobs = new Map<string, CupStickerJob>();
let lastAgentSeenAt = 0;

export function touchCupStickerAgent(): void {
  lastAgentSeenAt = Date.now();
}

export function getCupStickerAgentPresence(maxAgeMs = 20_000): {
  online: boolean;
  lastSeenAt: number | null;
} {
  if (!lastAgentSeenAt) return { online: false, lastSeenAt: null };
  return {
    online: Date.now() - lastAgentSeenAt <= maxAgeMs,
    lastSeenAt: lastAgentSeenAt,
  };
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
