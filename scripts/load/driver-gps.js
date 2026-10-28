/**
 * k6 load test — driver GPS ingest (Milestone 10).
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:4100 -e DRIVER_TOKEN=<jwt> scripts/load/driver-gps.js
 *
 * Scenario: 50 VUs posting location batches at ~0.2 Hz for 5m (short local run).
 * Scale to 30m in staging with --duration 30m.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4100';
const TOKEN = __ENV.DRIVER_TOKEN || '';

export default function () {
  if (!TOKEN) {
    console.error('DRIVER_TOKEN env required');
    return;
  }

  const now = Date.now();
  const body = JSON.stringify({
    locations: [
      {
        lat: 6.9271 + Math.random() * 0.01,
        lng: 79.8612 + Math.random() * 0.01,
        accuracyM: 8,
        speedKph: 20 + Math.random() * 10,
        heading: Math.random() * 360,
        batteryPct: 80,
        recordedAt: new Date(now).toISOString(),
      },
    ],
  });

  const res = http.post(`${BASE_URL}/delivery-api/locations/batch`, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  sleep(5); // ~0.2 Hz
}
