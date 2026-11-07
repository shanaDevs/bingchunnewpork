import { describe, expect, it } from 'vitest';
import {
  SALES_LEADERBOARD_PREVIEW,
  takeSalesLeaderboardPreview,
} from './salesLeaderboard';

describe('takeSalesLeaderboardPreview', () => {
  it('returns at most SALES_LEADERBOARD_PREVIEW items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    expect(takeSalesLeaderboardPreview(items)).toEqual([1, 2, 3, 4, 5]);
    expect(SALES_LEADERBOARD_PREVIEW).toBe(5);
  });

  it('returns a shallow copy slice without mutating the source array', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const preview = takeSalesLeaderboardPreview(items);
    preview.push('z');
    expect(items).toHaveLength(6);
    expect(preview).toHaveLength(6);
  });

  it('returns empty array for null, undefined, or empty input', () => {
    expect(takeSalesLeaderboardPreview(null)).toEqual([]);
    expect(takeSalesLeaderboardPreview(undefined)).toEqual([]);
    expect(takeSalesLeaderboardPreview([])).toEqual([]);
  });

  it('returns all items when fewer than the preview limit', () => {
    expect(takeSalesLeaderboardPreview([{ id: 1 }, { id: 2 }])).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });
});
