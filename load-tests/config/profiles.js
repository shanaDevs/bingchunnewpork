/**
 * Named load profiles. Override stages entirely with `-e STAGES="30s:50,5m:100"`.
 * VU counts are per-scenario when multiple scenarios run concurrently.
 */
export const profiles = {
  smoke: {
    executor: 'constant-vus',
    vus: 5,
    duration: '1m',
  },
  /** ~20 people browsing the shop at a natural click pace (not a stress test). */
  typical: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 20 },
      { duration: '4m', target: 20 },
      { duration: '30s', target: 0 },
    ],
    thinkTimeMs: 5000,
  },
  baseline: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '10m', target: 100 },
      { duration: '2m', target: 0 },
    ],
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 200 },
      { duration: '5m', target: 1000 },
      { duration: '5m', target: 5000 },
      { duration: '3m', target: 0 },
    ],
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '30s', target: 2000 },
      { duration: '2m', target: 2000 },
      { duration: '1m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  soak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '5m', target: 200 },
      { duration: '30m', target: 200 },
      { duration: '5m', target: 0 },
    ],
  },
};

/** Parse `30s:100,5m:200` into k6 stage objects. */
export function parseStages(raw) {
  if (!raw || !raw.trim()) return null;
  return raw.split(',').map((part) => {
    const [duration, target] = part.trim().split(':');
    return { duration: duration.trim(), target: Number(target) };
  });
}
