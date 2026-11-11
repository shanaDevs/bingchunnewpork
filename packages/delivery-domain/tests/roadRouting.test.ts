import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapMatchGpsPath } from '../src/roadRouting';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('mapMatchGpsPath', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty / single point without calling OSRM', async () => {
    expect(await mapMatchGpsPath([])).toEqual([]);
    expect(
      await mapMatchGpsPath([{ lat: 6.9, lng: 79.86 }]),
    ).toEqual([{ lat: 6.9, lng: 79.86 }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns matched geometry on Ok', async () => {
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

    const raw = [
      { lat: 6.9, lng: 79.86 },
      { lat: 6.905, lng: 79.865 },
    ];
    const path = await mapMatchGpsPath(raw);
    expect(path).toEqual([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.901, lng: 79.861 },
      { lat: 6.902, lng: 79.862 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/match/v1/driving/');
    expect(url).toContain('overview=full');
    expect(url).toContain('geometries=geojson');
    expect(url).toContain('tidy=true');
  });

  it('falls back to original points when OSRM returns non-Ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NoMatch', message: 'no match' }));
    const raw = [
      { lat: 6.9, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ];
    expect(await mapMatchGpsPath(raw)).toEqual(raw);
  });

  it('falls back to original points on HTTP failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
    const raw = [
      { lat: 6.9, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ];
    expect(await mapMatchGpsPath(raw)).toEqual(raw);
  });

  it('falls back to original points when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const raw = [
      { lat: 6.9, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ];
    expect(await mapMatchGpsPath(raw)).toEqual(raw);
  });
});
