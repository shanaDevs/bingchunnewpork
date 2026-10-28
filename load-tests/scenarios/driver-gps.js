import http from 'k6/http';
import { check, sleep } from 'k6';
import { deliveryUrl, baseHeaders } from '../lib/env.js';
import { driverGpsSuccess, driverGpsDuration } from '../lib/metrics.js';

export default function driverGps(data) {
  const { config } = data;
  const token = config.driverToken;

  if (!token) {
    console.error('DRIVER_TOKEN env required for driver-gps scenario');
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

  const start = Date.now();
  const res = http.post(deliveryUrl(config, '/delivery-api/locations/batch'), body, {
    headers: baseHeaders(config, token),
    tags: { name: 'driver_gps_batch' },
  });

  const ok = check(res, {
    'driver_gps status 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  driverGpsDuration.add(Date.now() - start);
  driverGpsSuccess.add(ok);

  sleep(5); // ~0.2 Hz per VU
}
