import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

const controllerPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/controllers/analyticsController.ts',
);

function getDashboardStatsSource(): string {
  const src = readFileSync(controllerPath, 'utf8');
  const start = src.indexOf('export async function getDashboardStats');
  const end = src.indexOf('type BranchOrderForAnalytics', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('analyticsController.ts syntax', () => {
  it('parses with esbuild (no transform errors)', () => {
    const src = readFileSync(controllerPath, 'utf8');
    expect(() => transformSync(src, { loader: 'ts' })).not.toThrow();
  });

  it('balances braces inside getDashboardStats', () => {
    const fn = getDashboardStatsSource();
    let depth = 0;
    for (const ch of fn) {
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
