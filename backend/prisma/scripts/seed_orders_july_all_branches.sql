-- =============================================================================
-- July 2026 multi-branch seed (Nugegoda SQL rules × every active store).
--
--   • 26 days (Jul 1–26, 2026), orders_per_day = 5 + (store_rn % 3) per branch
--   • Mixed DELIVERY / TAKEAWAY; payments PAYHERE, CARD, CASH_AT_COUNTER,
--     LOYALTY_POINTS — no CASH_ON_DELIVERY
--   • Convenience fee: 6.5% delivery, 6% pickup
--   • Days 1–25: DELIVERED history; day 26: RECEIVED / PREPARING / READY queue
--   • DELIVERED delivery orders → COMPLETED delivery_jobs per store per day
--     (job_orders, delivery_events, delivery_attempts, route + GPS trail)
--
-- Prefixes: seed-jul26-{storeId}-d{dd}-{slot}, seed-jul26-job-*,
--           seed-jul26-driver-*, seed-jul26-loc-*
--
-- Prerequisites: active stores, available products, DELIVERY_DRIVER role
--
-- Run order:
--   prisma/scripts/seed_cleanup_july_branch_orders.sql  (optional re-run)
--   this file
--   prisma/scripts/backfill_wallets_from_orders.sql
--   prisma/scripts/repair_wallet_balance_after.sql
--
--   npx prisma db execute --schema packages/db/prisma/schema.prisma \
--     --file backend/prisma/scripts/seed_orders_july_all_branches.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM stores WHERE "isActive" = true) = 0 THEN
    RAISE EXCEPTION 'No active stores';
  END IF;
  IF (SELECT COUNT(*) FROM products WHERE "isAvailable" = true) = 0 THEN
    RAISE EXCEPTION 'No available products';
  END IF;
  IF (SELECT COUNT(*) FROM roles WHERE name = 'DELIVERY_DRIVER') = 0 THEN
    RAISE EXCEPTION 'DELIVERY_DRIVER role missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jul_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
  SELECT 111.195 * sqrt(power(lat1 - lat2, 2) + power((lng1 - lng2) * cos(radians((lat1 + lat2) / 2)), 2))
$$;

-- ── Riders: one DELIVERY_DRIVER per active branch ────────────────────────────
INSERT INTO admin_users (
  id, name, email, "passwordHash", "roleId", "storeId",
  "isActive", "dutyStatus", "vehicleNumber", "updatedAt"
)
SELECT
  'seed-jul26-driver-' || s.id,
  'Seed Rider ' || s.name,
  'seed-jul26-driver-' || s.id || '@bingchun-test.lk',
  'SEED-NO-LOGIN',
  (SELECT id FROM roles WHERE name = 'DELIVERY_DRIVER'),
  s.id,
  true,
  'OFF_DUTY'::"DriverDutyStatus",
  'JUL-' || LPAD((ROW_NUMBER() OVER (ORDER BY s.name))::text, 4, '0'),
  NOW()
FROM stores s
WHERE s."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM admin_users au
    JOIN roles r ON r.id = au."roleId"
    WHERE r.name = 'DELIVERY_DRIVER'
      AND au."isActive" = true
      AND au."storeId" = s.id
      AND au.id NOT LIKE 'seed-jul26-driver-%'
  )
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS tmp_jul26_driver;
CREATE TEMP TABLE tmp_jul26_driver AS
SELECT DISTINCT ON (au."storeId") au."storeId" AS store_id, au.id AS driver_id
FROM admin_users au
JOIN roles r ON r.id = au."roleId"
WHERE r.name = 'DELIVERY_DRIVER'
  AND au."isActive" = true
  AND au."storeId" IN (SELECT id FROM stores WHERE "isActive" = true)
ORDER BY au."storeId", (au.id LIKE 'seed-jul26-driver-%') ASC, au.id;

-- ── Base order rows ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS tmp_jul26_o;
CREATE TEMP TABLE tmp_jul26_o AS
WITH
active_stores AS (
  SELECT
    id,
    name,
    city,
    district,
    lat,
    lng,
    ROW_NUMBER() OVER (ORDER BY name) AS store_rn,
    5 + (ROW_NUMBER() OVER (ORDER BY name) % 3) AS orders_per_day
  FROM stores
  WHERE "isActive" = true
),
product_count AS (
  SELECT COUNT(*)::int AS n FROM products WHERE "isAvailable" = true
),
product_pool AS (
  SELECT id, name, "basePrice",
         ROW_NUMBER() OVER (ORDER BY "basePrice", name) - 1 AS price_rn
  FROM products
  WHERE "isAvailable" = true
),
grid AS (
  SELECT
    s.id AS store_id,
    s.name AS store_name,
    s.city,
    s.district,
    s.lat AS store_lat,
    s.lng AS store_lng,
    s.store_rn,
    s.orders_per_day,
    d.day_num,
    sl.slot,
    (s.store_rn * 10000 + (d.day_num - 1) * s.orders_per_day + sl.slot) AS gseq,
    (d.day_num - 1) * s.orders_per_day + sl.slot AS local_seq
  FROM active_stores s
  CROSS JOIN generate_series(1, 26) AS d(day_num)
  CROSS JOIN generate_series(1, 7) AS sl(slot)
  WHERE sl.slot <= s.orders_per_day
),
picked AS (
  SELECT
    g.*,
    pr.id AS product_id,
    pr.name AS product_name,
    CASE WHEN (g.store_rn + g.gseq) % 4 = 0
      THEN ROUND(pr."basePrice" * 1.3)::int
      ELSE pr."basePrice"
    END AS unit_price,
    1 + ((g.store_rn + g.gseq) % 3) AS quantity,
    CASE WHEN g.gseq % 2 = 0 THEN 'DELIVERY'::"OrderMode" ELSE 'TAKEAWAY'::"OrderMode" END AS order_mode,
    CASE
      WHEN g.gseq % 2 = 1 AND g.gseq % 5 = 0 THEN 'CASH_AT_COUNTER'::"PaymentMethod"
      WHEN g.gseq % 7 = 0 THEN 'CARD'::"PaymentMethod"
      WHEN g.gseq % 11 = 0 THEN 'LOYALTY_POINTS'::"PaymentMethod"
      ELSE 'PAYHERE'::"PaymentMethod"
    END AS payment_method,
    CASE
      WHEN g.day_num < 26 THEN 'DELIVERED'::"OrderStatus"
      WHEN g.slot <= 2 THEN 'RECEIVED'::"OrderStatus"
      WHEN g.slot <= 4 THEN 'PREPARING'::"OrderStatus"
      ELSE 'READY'::"OrderStatus"
    END AS status,
    (DATE '2026-07-01' + (g.day_num - 1)) AS order_day,
    (
      (DATE '2026-07-01' + (g.day_num - 1))::timestamp
      + ((9 + g.slot - 1) * interval '1 hour')
      + (((g.gseq * 7) % 60) * interval '1 minute')
      + (((g.gseq * 13) % 60) * interval '1 second')
    ) AS created_at,
    ('seed-jul26-' || g.store_id || '-d' || LPAD(g.day_num::text, 2, '0') || '-' || LPAD(g.slot::text, 2, '0')) AS order_id
  FROM grid g
  JOIN product_count pc ON true
  JOIN product_pool pr ON pr.price_rn = ((g.gseq - 1) % pc.n)
),
priced AS (
  SELECT
    p.*,
    (p.unit_price * p.quantity) AS subtotal,
    CASE
      WHEN p.order_mode = 'DELIVERY'::"OrderMode" THEN
        (CASE WHEN p.gseq % 4 = 0 THEN 150 ELSE 250 END) + (p.store_rn % 5) * 50
      ELSE 0
    END AS delivery_fee,
    p.store_lat + 0.01 * (p.gseq % 5) AS stop_lat,
    p.store_lng + 0.01 * ((p.gseq + 3) % 5) AS stop_lng
  FROM picked p
),
final_o AS (
  SELECT
    f.*,
    CASE
      WHEN f.order_mode = 'DELIVERY'::"OrderMode" THEN ROUND(f.subtotal * 0.065)::int
      ELSE ROUND(f.subtotal * 0.06)::int
    END AS convenient_fee,
    ('BC' || to_char(f.order_day, 'YYMMDD') || '-B' ||
      LPAD(f.store_rn::text, 3, '0') || LPAD(f.local_seq::text, 4, '0')) AS order_number
  FROM priced f
)
SELECT
  fo.*,
  GREATEST(fo.subtotal + fo.delivery_fee + fo.convenient_fee, 0) AS total,
  CASE
    WHEN fo.payment_method IN (
      'PAYHERE'::"PaymentMethod",
      'CARD'::"PaymentMethod",
      'LOYALTY_POINTS'::"PaymentMethod"
    ) THEN GREATEST(fo.subtotal + fo.delivery_fee + fo.convenient_fee, 0)
    ELSE 0
  END AS prepaid_amount
FROM final_o fo;

-- ── Delivery stops / jobs (delivered DELIVERY only, days 1–25) ─────────────────
DROP TABLE IF EXISTS tmp_jul26_stop;
CREATE TEMP TABLE tmp_jul26_stop AS
SELECT
  o.order_id,
  o.store_id,
  o.order_day,
  o.created_at,
  o.stop_lat,
  o.stop_lng,
  o.store_lat,
  o.store_lng,
  o.delivery_fee,
  o.quantity,
  ROW_NUMBER() OVER (PARTITION BY o.store_id, o.order_day ORDER BY o.created_at, o.order_id) - 1 AS seq
FROM tmp_jul26_o o
WHERE o.status = 'DELIVERED'::"OrderStatus"
  AND o.order_mode = 'DELIVERY'::"OrderMode";

DROP TABLE IF EXISTS tmp_jul26_job;
CREATE TEMP TABLE tmp_jul26_job AS
SELECT
  ('seed-jul26-job-' || st.store_id || '-' || to_char(st.order_day, 'YYMMDD')) AS job_id,
  st.store_id,
  st.order_day,
  d.driver_id,
  MAX(st.created_at) + interval '15 minutes' AS scheduled_at,
  MAX(st.created_at) + interval '20 minutes' AS assigned_at,
  MAX(st.created_at) + interval '25 minutes' AS started_at,
  COUNT(*)::int AS stop_count,
  SUM(st.quantity)::int AS total_cups,
  SUM(st.delivery_fee)::int AS total_fees,
  ROW_NUMBER() OVER (ORDER BY st.order_day, st.store_id) AS job_no
FROM tmp_jul26_stop st
JOIN tmp_jul26_driver d ON d.store_id = st.store_id
GROUP BY st.store_id, st.order_day, d.driver_id;

DROP TABLE IF EXISTS tmp_jul26_stop2;
CREATE TEMP TABLE tmp_jul26_stop2 AS
SELECT
  st.order_id,
  st.store_id,
  st.order_day,
  st.seq,
  st.stop_lat,
  st.stop_lng,
  st.store_lat,
  st.store_lng,
  j.job_id,
  j.driver_id,
  j.assigned_at,
  j.started_at,
  j.started_at + ((st.seq * 10 + 8) * interval '1 minute') AS delivered_at,
  COALESCE(LAG(st.stop_lat) OVER w, st.store_lat) AS prev_lat,
  COALESCE(LAG(st.stop_lng) OVER w, st.store_lng) AS prev_lng,
  (LEAD(st.order_id) OVER w IS NULL) AS is_last
FROM tmp_jul26_stop st
JOIN tmp_jul26_job j ON j.store_id = st.store_id AND j.order_day = st.order_day
WINDOW w AS (PARTITION BY st.store_id, st.order_day ORDER BY st.seq);

DROP TABLE IF EXISTS tmp_jul26_jobx;
CREATE TEMP TABLE tmp_jul26_jobx AS
SELECT
  j.*,
  a.est_km,
  a.last_delivered_at,
  a.last_delivered_at + interval '1 minute' AS return_started_at,
  a.last_delivered_at + interval '15 minutes' AS completed_at
FROM tmp_jul26_job j
JOIN (
  SELECT
    s.job_id,
    ROUND((
      SUM(pg_temp.jul_km(s.prev_lat, s.prev_lng, s.stop_lat, s.stop_lng))
      + MAX(CASE WHEN s.is_last THEN pg_temp.jul_km(s.stop_lat, s.stop_lng, s.store_lat, s.store_lng) END)
    )::numeric, 2)::float8 AS est_km,
    MAX(s.delivered_at) AS last_delivered_at
  FROM tmp_jul26_stop2 s
  GROUP BY s.job_id
) a ON a.job_id = j.job_id;

DROP TABLE IF EXISTS tmp_jul26_route;
CREATE TEMP TABLE tmp_jul26_route AS
SELECT job_id, ord, lat, lng FROM (
  SELECT s.job_id, 0 AS ord, s.store_lat AS lat, s.store_lng AS lng
  FROM tmp_jul26_stop2 s WHERE s.seq = 0
  UNION ALL
  SELECT s.job_id, s.seq * 2 + 1,
         (s.prev_lat + s.stop_lat) / 2 + ((abs(hashtext(s.order_id)) % 7) - 3) * 0.0004,
         (s.prev_lng + s.stop_lng) / 2 + ((abs(hashtext(s.order_id || 'x')) % 7) - 3) * 0.0004
  FROM tmp_jul26_stop2 s
  UNION ALL
  SELECT s.job_id, s.seq * 2 + 2, s.stop_lat, s.stop_lng
  FROM tmp_jul26_stop2 s
  UNION ALL
  SELECT s.job_id, 1000,
         (s.stop_lat + s.store_lat) / 2 + ((abs(hashtext(s.order_id || 'r')) % 7) - 3) * 0.0004,
         (s.stop_lng + s.store_lng) / 2 + ((abs(hashtext(s.order_id || 'q')) % 7) - 3) * 0.0004
  FROM tmp_jul26_stop2 s WHERE s.is_last
  UNION ALL
  SELECT s.job_id, 1001, s.store_lat, s.store_lng
  FROM tmp_jul26_stop2 s WHERE s.is_last
) r;

DROP TABLE IF EXISTS tmp_jul26;
CREATE TEMP TABLE tmp_jul26 AS
SELECT
  o.*,
  s.job_id,
  s.driver_id,
  s.seq AS stop_seq,
  s.started_at AS job_started_at,
  s.delivered_at,
  CASE
    WHEN o.status = 'RECEIVED'::"OrderStatus" THEN o.created_at
    WHEN o.status = 'PREPARING'::"OrderStatus" THEN o.created_at + interval '8 minutes'
    WHEN o.status = 'READY'::"OrderStatus" THEN o.created_at + interval '18 minutes'
    WHEN o.order_mode = 'DELIVERY'::"OrderMode" AND o.status = 'DELIVERED'::"OrderStatus" THEN s.delivered_at
    ELSE o.created_at + interval '35 minutes'
  END AS final_at
FROM tmp_jul26_o o
LEFT JOIN tmp_jul26_stop2 s ON s.order_id = o.order_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tmp_jul26
    WHERE status = 'DELIVERED'::"OrderStatus"
      AND order_mode = 'DELIVERY'::"OrderMode"
      AND job_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Delivered delivery order without job (missing branch rider?)';
  END IF;
END $$;

-- ── orders ───────────────────────────────────────────────────────────────────
INSERT INTO orders (
  id, "orderNumber", "trackToken", "guestName", "guestPhone",
  "storeId", "orderMode", status, "paymentMethod", "paymentStatus", "paymentRef",
  subtotal, "deliveryFee", "convenientFee", discount, "loyaltyDiscount",
  total, "prepaidAmount", "estimatedMinutes", notes,
  "deliveryAddressLine", "deliveryCity", "deliveryDistrict", "deliveryLat", "deliveryLng",
  platform, channel, "createdAt", "updatedAt"
)
SELECT
  t.order_id,
  t.order_number,
  md5(t.order_id),
  'Guest ' || t.store_rn || '-' || t.local_seq,
  '077' || LPAD((2000000 + (t.store_rn * 100 + t.local_seq) % 8000000)::text, 7, '0'),
  t.store_id,
  t.order_mode,
  t.status,
  t.payment_method,
  'PAID'::"PaymentStatus",
  CASE
    WHEN t.payment_method IN (
      'PAYHERE'::"PaymentMethod",
      'CARD'::"PaymentMethod",
      'LOYALTY_POINTS'::"PaymentMethod"
    ) THEN 'JUL26-PAY-' || md5(t.order_id)
    ELSE NULL
  END,
  t.subtotal,
  t.delivery_fee,
  t.convenient_fee,
  0,
  0,
  t.total,
  t.prepaid_amount,
  20 + (t.local_seq % 15),
  'July 2026 multi-branch seed',
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode"
    THEN (10 + (t.local_seq % 80))::text || ' ' || t.city || ' Road'
    ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN t.city ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN t.district ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN t.stop_lat ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN t.stop_lng ELSE NULL END,
  t.local_seq % 2,
  CASE WHEN t.local_seq % 2 = 0 THEN 'APP'::"OrderChannel" ELSE 'WEB'::"OrderChannel" END,
  t.created_at,
  t.final_at
FROM tmp_jul26 t;

INSERT INTO order_items (id, "orderId", "productId", "productName", size, quantity, "unitPrice", "totalPrice")
SELECT
  t.order_id || '-item',
  t.order_id,
  t.product_id,
  t.product_name,
  'REGULAR'::"ProductSize",
  t.quantity,
  t.unit_price,
  t.subtotal
FROM tmp_jul26 t;

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e1', t.order_id, 'RECEIVED'::"OrderStatus", 'Order received', t.created_at
FROM tmp_jul26 t;

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e2', t.order_id, 'PREPARING'::"OrderStatus", NULL, t.created_at + interval '8 minutes'
FROM tmp_jul26 t
WHERE t.status <> 'RECEIVED'::"OrderStatus";

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e3', t.order_id, 'READY'::"OrderStatus", NULL, t.created_at + interval '18 minutes'
FROM tmp_jul26 t
WHERE t.status = 'READY'::"OrderStatus"
   OR (t.status = 'DELIVERED'::"OrderStatus" AND t.order_mode = 'TAKEAWAY'::"OrderMode");

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e4', t.order_id, 'OUT_FOR_DELIVERY'::"OrderStatus", NULL, t.job_started_at
FROM tmp_jul26 t
WHERE t.status = 'DELIVERED'::"OrderStatus" AND t.order_mode = 'DELIVERY'::"OrderMode";

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e5', t.order_id, 'DELIVERED'::"OrderStatus", 'Seed order completed', t.final_at
FROM tmp_jul26 t
WHERE t.status = 'DELIVERED'::"OrderStatus";

-- ── delivery_jobs ────────────────────────────────────────────────────────────
INSERT INTO delivery.delivery_jobs (
  id, "storeId", "driverId", title, "rideCode", status,
  "scheduledAt", "assignedAt", "startedAt", "returnStartedAt", "completedAt",
  "totalCups", "estimatedDistanceKm", "estimatedMinutes", "totalDistanceKm", "totalDeliveryFees",
  "actualDistanceKm", "actualRoute", "completedLat", "completedLng",
  "createdAt", "updatedAt"
)
SELECT
  j.job_id,
  j.store_id,
  j.driver_id,
  'July delivery ' || to_char(j.order_day, 'YYYY-MM-DD') || ' (' || j.stop_count || ' stop' ||
    CASE WHEN j.stop_count > 1 THEN 's' ELSE '' END || ')',
  'RIDE-JUL-' || LPAD(j.job_no::text, 5, '0'),
  'COMPLETED'::delivery."DeliveryJobStatus",
  j.scheduled_at,
  j.assigned_at,
  j.started_at,
  j.return_started_at,
  j.completed_at,
  j.total_cups,
  j.est_km,
  (ROUND(j.est_km * 3) + 10 + j.stop_count * 4)::int,
  j.est_km,
  j.total_fees,
  ROUND((j.est_km * 1.08)::numeric, 2)::float8,
  (SELECT jsonb_agg(jsonb_build_array(round(r.lat::numeric, 6), round(r.lng::numeric, 6)) ORDER BY r.ord)::text
   FROM tmp_jul26_route r WHERE r.job_id = j.job_id),
  st.lat,
  st.lng,
  j.scheduled_at - interval '5 minutes',
  j.completed_at
FROM tmp_jul26_jobx j
JOIN stores st ON st.id = j.store_id;

INSERT INTO delivery.delivery_job_orders ("jobId", "orderId", sequence)
SELECT s.job_id, s.order_id, s.seq::int FROM tmp_jul26_stop2 s;

INSERT INTO delivery.delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de1', s.order_id, s.job_id, s.driver_id, 'ASSIGNED'::"DeliveryDomainState", NULL, s.assigned_at
FROM tmp_jul26_stop2 s;

INSERT INTO delivery.delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de2', s.order_id, s.job_id, s.driver_id, 'PICKED_UP'::"DeliveryDomainState", NULL, s.started_at
FROM tmp_jul26_stop2 s;

INSERT INTO delivery.delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de3', s.order_id, s.job_id, s.driver_id, 'EN_ROUTE'::"DeliveryDomainState", NULL,
       s.started_at + interval '1 minute'
FROM tmp_jul26_stop2 s;

INSERT INTO delivery.delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de4', s.order_id, s.job_id, s.driver_id, 'DELIVERED'::"DeliveryDomainState", 'Seed delivery', s.delivered_at
FROM tmp_jul26_stop2 s;

INSERT INTO delivery.delivery_attempts (id, "orderId", "jobId", "driverId", "attemptNo", outcome, note, lat, lng, "createdAt")
SELECT s.order_id || '-att', s.order_id, s.job_id, s.driver_id, 1,
       'DELIVERED'::"DeliveryAttemptOutcome", 'Seed delivery', s.stop_lat, s.stop_lng, s.delivered_at
FROM tmp_jul26_stop2 s;

INSERT INTO delivery.driver_locations (id, "driverId", "jobId", lat, lng, "accuracyM", "speedKph", heading, "batteryPct", "recordedAt")
SELECT
  'seed-jul26-loc-' || p.job_id || '-' || LPAD(p.rn::text, 2, '0'),
  j.driver_id,
  p.job_id,
  p.lat,
  p.lng,
  8.0,
  CASE WHEN p.rn = 1 OR p.rn = p.cnt THEN 0 ELSE 18 + (p.rn * 3) % 14 END,
  ((p.rn * 47 + p.job_no) % 360)::float8,
  GREATEST(30, 95 - p.rn * 3),
  j.started_at + (j.completed_at - j.started_at) * ((p.rn - 1)::float8 / GREATEST(p.cnt - 1, 1))
FROM (
  SELECT
    r.job_id,
    r.lat,
    r.lng,
    ROW_NUMBER() OVER (PARTITION BY r.job_id ORDER BY r.ord) AS rn,
    COUNT(*) OVER (PARTITION BY r.job_id) AS cnt,
    jx.job_no
  FROM tmp_jul26_route r
  JOIN tmp_jul26_jobx jx ON jx.job_id = r.job_id
) p
JOIN tmp_jul26_jobx j ON j.job_id = p.job_id;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
SELECT s.name, COUNT(*)::int AS jul_orders
FROM orders o
JOIN stores s ON s.id = o."storeId"
WHERE o.id LIKE 'seed-jul26-%'
GROUP BY s.name
ORDER BY s.name
LIMIT 20;

SELECT status::text, COUNT(*)::int AS orders
FROM orders WHERE id LIKE 'seed-jul26-%'
GROUP BY status ORDER BY status;

SELECT COUNT(*)::int AS jul_jobs
FROM delivery.delivery_jobs WHERE id LIKE 'seed-jul26-job-%';

SELECT COUNT(*)::int AS orphan_delivered_delivery
FROM orders o
WHERE o.id LIKE 'seed-jul26-%'
  AND o.status = 'DELIVERED'::"OrderStatus"
  AND o."orderMode" = 'DELIVERY'::"OrderMode"
  AND NOT EXISTS (
    SELECT 1 FROM delivery.delivery_job_orders djo WHERE djo."orderId" = o.id
  );
