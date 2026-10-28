import http from 'k6/http';
import { check, sleep } from 'k6';
import { apiUrl, baseHeaders } from '../lib/env.js';
import { pickSession } from '../lib/auth.js';
import { cartSuccessRate, cartOpDuration, writeErrors } from '../lib/metrics.js';

function ok2xx(res) {
  return res.status >= 200 && res.status < 300;
}

/**
 * Self-cleaning cart churn: add → update qty → get → clear.
 * Leaves no cart items behind after each iteration.
 */
export default function cart(data) {
  const { config, authPool } = data;
  const session = pickSession(authPool);
  if (!session) {
    console.error('No auth sessions in pool — ensureUsers() must run in setup()');
    writeErrors.add(1);
    cartSuccessRate.add(false);
    return;
  }

  const headers = baseHeaders(config, session.token);
  const productIds = config.runtimeData.productIds || [];
  const productId = productIds[(__ITER + __VU) % Math.max(productIds.length, 1)];
  if (!productId) {
    console.error('No productIds from catalog hydrate');
    writeErrors.add(1);
    cartSuccessRate.add(false);
    return;
  }

  const start = Date.now();
  let iterationOk = true;

  // Clear any leftover state from a prior interrupted iteration
  http.del(apiUrl(config, '/api/cart'), null, {
    headers,
    tags: { name: 'cart_clear_pre' },
  });

  const addRes = http.post(
    apiUrl(config, '/api/cart/items'),
    JSON.stringify({
      productId,
      size: 'REGULAR',
      toppingIds: [],
      quantity: 1,
    }),
    { headers, tags: { name: 'cart_add' } },
  );

  const addOk = check(addRes, {
    'cart_add status 2xx': ok2xx,
  });
  if (!addOk) iterationOk = false;

  const cartRes = http.get(apiUrl(config, '/api/cart'), {
    headers,
    tags: { name: 'cart_get' },
  });

  const getOk = check(cartRes, {
    'cart_get status 2xx': ok2xx,
  });
  if (!getOk) iterationOk = false;

  let itemId = null;
  try {
    const items = cartRes.json('data.items') || [];
    if (items.length > 0) itemId = items[0].id;
  } catch {
    itemId = null;
  }

  if (itemId) {
    const updRes = http.put(
      apiUrl(config, `/api/cart/items/${itemId}`),
      JSON.stringify({ quantity: 2 }),
      { headers, tags: { name: 'cart_update' } },
    );
    const updOk = check(updRes, {
      'cart_update status 2xx': ok2xx,
    });
    if (!updOk) iterationOk = false;
  }

  const clearRes = http.del(apiUrl(config, '/api/cart'), null, {
    headers,
    tags: { name: 'cart_clear' },
  });
  const clearOk = check(clearRes, {
    'cart_clear status 2xx': ok2xx,
  });
  if (!clearOk) iterationOk = false;

  cartOpDuration.add(Date.now() - start);
  cartSuccessRate.add(iterationOk);
  if (!iterationOk) writeErrors.add(1);

  sleep(config.thinkTimeMs / 1000);
}
