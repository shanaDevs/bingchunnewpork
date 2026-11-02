import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOsrmBaseUrlAllowed, DEFAULT_OSRM_HOST } from '@bingchun/delivery-domain';

describe('assertOsrmBaseUrlAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows the default public OSRM https host', () => {
    expect(() =>
      assertOsrmBaseUrlAllowed(`https://${DEFAULT_OSRM_HOST}`, {}),
    ).not.toThrow();
  });

  it('allows a custom host when listed in OSRM_ALLOWED_HOSTS', () => {
    const env = { OSRM_ALLOWED_HOSTS: 'osrm.internal, routing.example.com' };
    expect(() =>
      assertOsrmBaseUrlAllowed('https://osrm.internal', env),
    ).not.toThrow();
    expect(() =>
      assertOsrmBaseUrlAllowed('http://routing.example.com:5000', env),
    ).not.toThrow();
  });

  it('denies metadata and localhost hosts when not allowlisted', () => {
    expect(() =>
      assertOsrmBaseUrlAllowed('http://169.254.169.254/latest/meta-data', {}),
    ).toThrow(/not allowlisted/);
    expect(() =>
      assertOsrmBaseUrlAllowed('http://localhost:5000', {}),
    ).toThrow(/not allowlisted/);
    expect(() =>
      assertOsrmBaseUrlAllowed('https://evil.example.com', {}),
    ).toThrow(/not allowlisted/);
  });

  it('rejects credentials in the URL', () => {
    expect(() =>
      assertOsrmBaseUrlAllowed(`https://user:pass@${DEFAULT_OSRM_HOST}`, {}),
    ).toThrow(/credentials/);
  });

  it('rejects http for the default host unless it is also in OSRM_ALLOWED_HOSTS', () => {
    expect(() =>
      assertOsrmBaseUrlAllowed(`http://${DEFAULT_OSRM_HOST}`, {}),
    ).toThrow(/https/);
    expect(() =>
      assertOsrmBaseUrlAllowed(`http://${DEFAULT_OSRM_HOST}`, {
        OSRM_ALLOWED_HOSTS: DEFAULT_OSRM_HOST,
      }),
    ).not.toThrow();
  });

  it('rejects invalid URLs and non-http(s) schemes', () => {
    expect(() => assertOsrmBaseUrlAllowed('not-a-url', {})).toThrow(/valid URL/);
    expect(() =>
      assertOsrmBaseUrlAllowed('ftp://router.project-osrm.org', {}),
    ).toThrow(/scheme/);
  });
});

describe('fetchRoadPath SSRF fail-closed fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('falls back to straight waypoints when OSRM_URL host is denied', async () => {
    vi.stubEnv('OSRM_URL', 'http://169.254.169.254');
    const { fetchRoadPath } = await import('../../src/lib/roadRouting');
    const a = { lat: 6.9, lng: 79.8 };
    const b = { lat: 6.91, lng: 79.81 };
    const path = await fetchRoadPath([a, b]);
    expect(path).toEqual([a, b]);
  });
});
