import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bingchun/db', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn(), update: vi.fn() },
    driverLocation: { findMany: vi.fn() },
  },
}));

import { filterGpsNoise, snapGpsPathForDisplay } from '../src/gpsPath';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe('filterGpsNoise', () => {
  it('drops non-finite and out-of-range points', () => {
    expect(
      filterGpsNoise([
        { lat: Number.NaN, lng: 79.86 },
        { lat: 6.9, lng: 79.86 },
        { lat: 91, lng: 79.86 },
      ]),
    ).toEqual([{ lat: 6.9, lng: 79.86 }]);
  });

  it('drops consecutive near-duplicates but keeps large jumps', () => {
    const path = filterGpsNoise([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.900001, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ]);
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ lat: 6.9, lng: 79.86 });
    expect(path[1]).toEqual({ lat: 6.91, lng: 79.87 });
  });
});

describe('snapGpsPathForDisplay', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns matched geometry when OSRM succeeds', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 'Ok',
        matchings: [
          {
            geometry: {
              coordinates: [
                [79.86, 6.9],
                [79.861, 6.901],
                [79.862, 6.902],
              ],
            },
          },
        ],
      }),
    );

    const path = await snapGpsPathForDisplay([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.905, lng: 79.865 },
    ]);
    expect(path).toEqual([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.901, lng: 79.861 },
      { lat: 6.902, lng: 79.862 },
    ]);
  });

  it('falls back to filtered GPS when OSRM fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NoMatch' }, true));
    const raw = [
      { lat: 6.9, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ];
    expect(await snapGpsPathForDisplay(raw)).toEqual(raw);
  });

  it('does not call OSRM for fewer than 2 points', async () => {
    expect(await snapGpsPathForDisplay([{ lat: 6.9, lng: 79.86 }])).toEqual([
      { lat: 6.9, lng: 79.86 },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
