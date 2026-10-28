import http from 'k6/http';
import { check, sleep } from 'k6';
import { apiUrl, baseHeaders } from '../lib/env.js';
import { pickSession } from '../lib/auth.js';
import { accountSuccessRate, writeErrors } from '../lib/metrics.js';

function ok2xx(res) {
  return res.status >= 200 && res.status < 300;
}

const ACTIONS = [
  { weight: 30, name: 'profile', fn: updateProfile },
  { weight: 40, name: 'address', fn: addressCycle },
  { weight: 30, name: 'wishlist', fn: wishlistCycle },
];

function pickAction() {
  const total = ACTIONS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of ACTIONS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ACTIONS[0];
}

function updateProfile(config, headers, session) {
  const res = http.put(
    apiUrl(config, '/api/auth/me'),
    JSON.stringify({
      name: session.name || `Write Test User ${session.index || __VU}`,
      notifyEmail: false,
      notifySms: false,
      notifyPush: false,
    }),
    { headers, tags: { name: 'account_profile_update' } },
  );
  return check(res, { 'account_profile status 2xx': ok2xx });
}

function addressCycle(config, headers) {
  let ok = true;

  const createRes = http.post(
    apiUrl(config, '/api/addresses'),
    JSON.stringify({
      label: `LT-${__VU}-${__ITER}`,
      addressLine: '123 Load Test Street, Test Area',
      city: 'Colombo',
      district: 'Colombo',
      lat: 6.9271 + (__VU % 100) * 0.0001,
      lng: 79.8612 + (__ITER % 100) * 0.0001,
      isDefault: false,
    }),
    { headers, tags: { name: 'account_address_create' } },
  );
  if (!check(createRes, { 'account_address_create status 2xx': ok2xx })) ok = false;

  let addressId = null;
  try {
    addressId = createRes.json('data.id');
  } catch {
    addressId = null;
  }

  if (addressId) {
    const updRes = http.put(
      apiUrl(config, `/api/addresses/${addressId}`),
      JSON.stringify({
        label: `LT-upd-${__VU}`,
        addressLine: '456 Load Test Avenue, Test Area',
        city: 'Colombo',
        district: 'Colombo',
      }),
      { headers, tags: { name: 'account_address_update' } },
    );
    if (!check(updRes, { 'account_address_update status 2xx': ok2xx })) ok = false;

    const delRes = http.del(apiUrl(config, `/api/addresses/${addressId}`), null, {
      headers,
      tags: { name: 'account_address_delete' },
    });
    if (!check(delRes, { 'account_address_delete status 2xx': ok2xx })) ok = false;
  } else {
    ok = false;
  }

  return ok;
}

function wishlistCycle(config, headers) {
  const productIds = config.runtimeData.productIds || [];
  const productId = productIds[(__ITER + __VU) % Math.max(productIds.length, 1)];
  if (!productId) return false;

  let ok = true;
  const addRes = http.post(apiUrl(config, `/api/wishlist/${productId}`), '{}', {
    headers,
    tags: { name: 'account_wishlist_add' },
  });
  if (!check(addRes, { 'account_wishlist_add status 2xx': ok2xx })) ok = false;

  const delRes = http.del(apiUrl(config, `/api/wishlist/${productId}`), null, {
    headers,
    tags: { name: 'account_wishlist_delete' },
  });
  if (!check(delRes, { 'account_wishlist_delete status 2xx': ok2xx })) ok = false;

  return ok;
}

/**
 * Weighted account writes — each path cleans up after itself.
 */
export default function account(data) {
  const { config, authPool } = data;
  const session = pickSession(authPool);
  if (!session) {
    console.error('No auth sessions in pool — ensureUsers() must run in setup()');
    writeErrors.add(1);
    accountSuccessRate.add(false);
    return;
  }

  const headers = baseHeaders(config, session.token);
  const action = pickAction();
  const ok = action.fn(config, headers, session);

  accountSuccessRate.add(ok);
  if (!ok) writeErrors.add(1);

  sleep(config.thinkTimeMs / 1000);
}
