import { crc32, buildStoredZip } from '../src/lib/zipStore';
import {
  formatPayoutReviewPeriodLabel,
  payoutReviewDisplayRange,
  payoutReviewZipEntryPath,
  uniqueZipEntryPaths,
} from '../src/lib/payoutReviewNames';
import { describe, expect, it } from 'vitest';

describe('payout review archive names', () => {
  it('puts each period in its own PDF under the branch folder', () => {
    const first = payoutReviewZipEntryPath(
      'Bing Chun - Nugegoda',
      '2026-09-06',
      '2026-09-20',
      'FIRST',
    );
    const secondRange = payoutReviewDisplayRange({
      from: '2026-09-21',
      to: '2026-10-05',
      cycleStage: 'SECOND',
      cycleFrom: '2026-09-06',
    });
    const second = payoutReviewZipEntryPath(
      'Bing Chun - Nugegoda',
      secondRange.from,
      secondRange.to,
      'SECOND',
    );

    expect(formatPayoutReviewPeriodLabel('2026-09-06', '2026-09-20')).toBe(
      'September 6 - September 20',
    );
    expect(first).toBe('Nugegoda/September 6 - September 20 (First Payout).pdf');
    expect(secondRange).toEqual({ from: '2026-09-06', to: '2026-10-05' });
    expect(second).toBe('Nugegoda/September 6 - October 5 (Second Payout).pdf');
  });

  it('keeps a colliding file name instead of overwriting it', () => {
    const path = 'Nugegoda/September 6 - September 20 (First Payout).pdf';
    expect(uniqueZipEntryPaths([path, path])).toEqual([
      path,
      'Nugegoda/September 6 - September 20 (First Payout) (2).pdf',
    ]);
  });
});

describe('stored zip', () => {
  it('packs each buffer under its path without compression', () => {
    const first = Buffer.from('invoice-one');
    const second = Buffer.from('invoice-two');
    const zip = buildStoredZip([
      { path: 'Nugegoda/September 6 - September 20 (First Payout).pdf', data: first },
      { path: 'Nugegoda/September 6 - October 5 (Second Payout).pdf', data: second },
    ]);

    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.subarray(zip.length - 22, zip.length - 18).readUInt32LE(0)).toBe(0x06054b50);
    expect(zip.includes(first)).toBe(true);
    expect(zip.includes(second)).toBe(true);
    expect(crc32(first)).toBeGreaterThan(0);
  });
});
