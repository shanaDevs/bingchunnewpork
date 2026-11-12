import { branchDisplayName } from './invoice/format';
import { addDaysToUtcDateStr } from './utcDateString';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function payoutReviewOrdinalLabel(cycleStage: string | null | undefined): string {
  return cycleStage === 'SECOND' ? 'Second Payout' : 'First Payout';
}

/**
 * Label range for the invoice file. Second payouts span the paired first window
 * through this window's end. Settlement dates stay on `from`/`to`.
 */
export function payoutReviewDisplayRange(input: {
  from: string;
  to: string;
  cycleStage?: string | null;
  cycleFrom?: string | null;
}): { from: string; to: string } {
  if (input.cycleStage !== 'SECOND') {
    return { from: input.from, to: input.to };
  }
  const cycleFrom = input.cycleFrom?.slice(0, 10) ?? '';
  if (YMD.test(cycleFrom) && cycleFrom < input.from) {
    return { from: cycleFrom, to: input.to };
  }
  return { from: addDaysToUtcDateStr(input.to, -29), to: input.to };
}

/** September 6 - September 20 (ASCII hyphen for download-safe names). */
export function formatPayoutReviewPeriodLabel(from: string, to: string): string {
  const fmt = (ymd: string, withYear: boolean) => {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  };
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear ? `${fmt(from, false)} - ${fmt(to, false)}` : `${fmt(from, true)} - ${fmt(to, true)}`;
}

/** Payout PDF/ZIP names must stay ASCII — Windows mishandles UTF-8 en dashes in saved file names. */
export function normalizePayoutDownloadFilename(filename: string): string {
  return filename
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
}

export function sanitizePayoutFileSegment(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Branch';
}

export function payoutReviewZipEntryPath(
  storeName: string,
  displayFrom: string,
  displayTo: string,
  cycleStage: string | null | undefined,
): string {
  const branch = sanitizePayoutFileSegment(branchDisplayName(storeName));
  const period = formatPayoutReviewPeriodLabel(displayFrom, displayTo);
  const ordinal = payoutReviewOrdinalLabel(cycleStage);
  return normalizePayoutDownloadFilename(`${branch}/${period} (${ordinal}).pdf`);
}

export function payoutReviewDownloadFilename(
  storeName: string,
  displayFrom: string,
  displayTo: string,
  cycleStage: string | null | undefined,
): string {
  const branch = sanitizePayoutFileSegment(branchDisplayName(storeName));
  const period = formatPayoutReviewPeriodLabel(displayFrom, displayTo);
  const ordinal = payoutReviewOrdinalLabel(cycleStage);
  return normalizePayoutDownloadFilename(`${branch} - ${period} (${ordinal}).pdf`);
}

export function uniqueZipEntryPaths(paths: string[]): string[] {
  const seen = new Map<string, number>();
  return paths.map((path) => {
    const count = seen.get(path) ?? 0;
    seen.set(path, count + 1);
    if (count === 0) return path;
    return path.replace(/\.pdf$/i, ` (${count + 1}).pdf`);
  });
}
