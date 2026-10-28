import http from 'k6/http';
import { check, sleep } from 'k6';
import { apiUrl, baseHeaders } from '../lib/env.js';
import { pickSession } from '../lib/auth.js';
import { orderSuccessRate, orderDuration } from '../lib/metrics.js';

export default function order(data) {
  const { config, authPool } = data;
  const session = pickSession(authPool);
  if (!session) {
    console.error('No auth sessions in pool — run setup() login first');
    return;
  }

  const headers = baseHeaders(config, session.token);
  const storeId = config.runtimeData.storeId;
  const productIds = config.runtimeData.productIds || [];
  const productId = productIds[(__ITER + __VU) % productIds.length];

  // Clear cart to avoid stale state from prior iterations
  http.del(apiUrl(config, '/api/cart'), null, {
    headers,
    tags: { name: 'cart_clear' },
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

  check(addRes, {
    'cart_add status 2xx': (r) => r.status >= 200 && r.status < 300,
    'cart_add success flag': (r) => {
      try {
        return r.json('success') === true;
      } catch {
        return false;
      }
    },
  });

  const cartRes = http.get(apiUrl(config, '/api/cart'), {
    headers,
    tags: { name: 'cart_get' },
  });

  check(cartRes, {
    'cart status 2xx': (r) => r.status >= 200 && r.status < 300,
    'cart success flag': (r) => {
      try {
        return r.json('success') === true;
      } catch {
        return false;
      }
    },
  });

  const placeStart = Date.now();
  const placeRes = http.post(
    apiUrl(config, '/api/orders'),
    JSON.stringify({
      orderMode: 'TAKEAWAY',
      storeId,
      paymentMethod: 'CASH_AT_COUNTER',
      items: [
        {
          productId,
          size: 'REGULAR',
          toppingIds: [],
          quantity: 1,
        },
      ],
    }),
    { headers, tags: { name: 'order_place' }, timeout: '60s' },
  );

  const placed = check(placeRes, {
    'order_place status 2xx': (r) => r.status >= 200 && r.status < 300,
    'order_place success flag': (r) => {
      try {
        return r.json('success') === true;
      } catch {
        return false;
      }
    },
  });

  orderDuration.add(Date.now() - placeStart);
  orderSuccessRate.add(placed);

  if (placed) {
    let orderId;
    try {
      orderId = placeRes.json('data.id') || placeRes.json('data.orderNumber');
    } catch {
      orderId = null;
    }

    if (orderId) {
      const trackRes = http.get(apiUrl(config, `/api/orders/${orderId}`), {
        headers,
        tags: { name: 'order_track' },
      });

      check(trackRes, {
        'order_track status 2xx': (r) => r.status >= 200 && r.status < 300,
        'order_track success flag': (r) => {
          try {
            return r.json('success') === true;
          } catch {
            return false;
          }
        },
      });
    }
  }

  sleep(config.thinkTimeMs / 1000);
}
