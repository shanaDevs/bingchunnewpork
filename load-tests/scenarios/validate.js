import http from 'k6/http';
import { check, sleep } from 'k6';
import { apiUrl, baseHeaders } from '../lib/env.js';
import { writeErrors } from '../lib/metrics.js';

/** Server handled the request (2xx or expected 4xx) — not a timeout/5xx. */
function handled(res) {
  return res.status > 0 && res.status < 500;
}

function buildCartItems(config) {
  const products = config.runtimeData.products || [];
  const productIds = config.runtimeData.productIds || [];
  const id = productIds[0] || (products[0] && products[0].id);
  if (!id) return [];
  const price = (products[0] && products[0].basePrice) || 500;
  return [
    {
      productId: id,
      productName: (products[0] && products[0].name) || 'Load Test Product',
      quantity: 1,
      unitPrice: price,
      lineTotal: price,
    },
  ];
}

function promosValidate(config) {
  const storeId = config.runtimeData.storeId;
  const cartItems = buildCartItems(config);
  const res = http.post(
    apiUrl(config, '/api/promos/validate'),
    JSON.stringify({
      // Intentionally invalid — exercises validation path without redeeming anything
      code: 'LOADTEST-INVALID',
      orderTotal: 1500,
      orderMode: 'TAKEAWAY',
      storeId,
      channel: 'WEB',
      cartItems,
    }),
    { headers: baseHeaders(config), tags: { name: 'promos_validate' } },
  );
  return check(res, {
    'promos_validate handled': handled,
  });
}

function promosEligible(config) {
  const storeId = config.runtimeData.storeId;
  const cartItems = buildCartItems(config);
  const res = http.post(
    apiUrl(config, '/api/promos/eligible'),
    JSON.stringify({
      orderTotal: 1500,
      orderMode: 'TAKEAWAY',
      storeId,
      channel: 'WEB',
      cartItems,
    }),
    { headers: baseHeaders(config), tags: { name: 'promos_eligible' } },
  );
  return check(res, {
    'promos_eligible status 2xx': (r) => r.status >= 200 && r.status < 300,
  });
}

function spinValidate(config) {
  const res = http.post(
    apiUrl(config, '/api/spin/validate'),
    JSON.stringify({
      claimCode: 'LT-FAKE-CODE',
      orderTotal: 1500,
      orderMode: 'TAKEAWAY',
    }),
    { headers: baseHeaders(config), tags: { name: 'spin_validate' } },
  );
  // Invalid claim → 400 is expected and proves the handler ran
  return check(res, {
    'spin_validate handled': handled,
  });
}

function validateDelivery(config) {
  // Opt-in only — hits Google Maps geocode (costs money per request)
  const res = http.post(
    apiUrl(config, '/api/stores/validate-delivery'),
    JSON.stringify({
      lat: 6.9271,
      lng: 79.8612,
      storeId: config.runtimeData.storeId,
    }),
    { headers: baseHeaders(config), tags: { name: 'stores_validate_delivery' } },
  );
  return check(res, {
    'stores_validate_delivery handled': handled,
  });
}

const ENDPOINTS = [
  { weight: 40, name: 'promos_eligible', fn: promosEligible },
  { weight: 35, name: 'promos_validate', fn: promosValidate },
  { weight: 25, name: 'spin_validate', fn: spinValidate },
];

function pickWeighted(list) {
  const total = list.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const ep of list) {
    r -= ep.weight;
    if (r <= 0) return ep;
  }
  return list[0];
}

/**
 * Anonymous read-only POSTs — no DB rows created, no SMS, no payment.
 * Geocode is opt-in via INCLUDE_GEOCODE=true.
 */
export default function validate(data) {
  const { config } = data;
  const list = config.includeGeocode
    ? [...ENDPOINTS, { weight: 10, name: 'validate_delivery', fn: validateDelivery }]
    : ENDPOINTS;

  const ep = pickWeighted(list);
  const ok = ep.fn(config);
  if (!ok) writeErrors.add(1);

  sleep(config.thinkTimeMs / 1000);
}
