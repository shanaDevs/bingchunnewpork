export const SALES_LEADERBOARD_PREVIEW = 5;

export function takeSalesLeaderboardPreview<T>(items?: T[] | null): T[] {
  return (items ?? []).slice(0, SALES_LEADERBOARD_PREVIEW);
}
