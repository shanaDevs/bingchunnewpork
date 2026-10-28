-- =============================================================================
-- Live-to-today seed: 24 orders per active branch, Jun 1 2026 -> today (Colombo).
--   n=23 (yesterday) / n=24 (today): live queue rows for the admin Order History tabs
--   (Pickup Queue / Delivery Jobs hide DELIVERED): mostly RECEIVED / PREPARING / READY,
--   with only a handful CANCELLED + refunded (every 10th branch). All other orders are
--   DELIVERED or CANCELLED.
--   Pickup (takeaway) mix: Cash at counter, Online (PayHere) and Card, including
--   Oct 1-4 and three pickup orders per branch on today's date (Payment Breakdown card).
--
--   * Only DELIVERED or CANCELLED orders (no pending / in-progress work).
--   * Online payments only for delivery (PAYHERE / CARD); takeaway may be cash at counter.
--   * Delivered DELIVERY orders are grouped into COMPLETED delivery_jobs with
--     delivery_job_orders, delivery_events, delivery_attempts, actualRoute and
--     driver_locations (for the admin delivery map / route drawer).
--   * Every branch rider is set ONLINE with fresh GPS pings (Live Drivers map).
--     Branches without a DELIVERY_DRIVER get a seed-live-driver-* rider (no usable login).
--   * Cancelled orders get refunds (mostly COMPLETE, a few REJECTED).
--
-- Prefixes: seed-live-{storeId}-{nn} orders, seed-live-job-*, seed-live-loc-*,
--           seed-live-driver-*, seed-live-refund-*, seed-live-wtx-refund-*
--
-- Run order:
--   seed_cleanup_test_orders.sql -> this file -> wallet sync -> repair_wallet_balance_after.sql
--
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/seed_branch_orders_live_to_today.sql
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

CREATE OR REPLACE FUNCTION pg_temp.live_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
  SELECT 111.195 * sqrt(power(lat1 - lat2, 2) + power((lng1 - lng2) * cos(radians((lat1 + lat2) / 2)), 2))
$$;

DROP TABLE IF EXISTS tmp_live_params;
CREATE TEMP TABLE tmp_live_params AS
SELECT
  DATE '2026-06-01' AS start_date,
  (now() AT TIME ZONE 'Asia/Colombo')::date AS end_date,
  (now() AT TIME ZONE 'UTC') AS now_utc,
  24 AS orders_per_branch;

-- ── Colombo-area labels (subset of backend/src/data/deliveryAreas.ts) ─────────
DROP TABLE IF EXISTS tmp_live_area;
CREATE TEMP TABLE tmp_live_area (name text, district text, lat float8, lng float8);
INSERT INTO tmp_live_area (name, district, lat, lng) VALUES
  ('Kollupitiya', 'Colombo', 6.9022, 79.8551),
  ('Bambalapitiya', 'Colombo', 6.8961631, 79.8547522),
  ('Nugegoda', 'Colombo', 6.8726, 79.8897),
  ('Dehiwala', 'Colombo', 6.8510, 79.8647),
  ('Maradana', 'Colombo', 6.9200, 79.8664),
  ('Rathmalana', 'Colombo', 6.8072, 79.8812),
  ('Mount Lavinia', 'Colombo', 6.8323, 79.8669),
  ('Battaramulla', 'Colombo', 6.9040, 79.9210),
  ('Borella', 'Colombo', 6.9166, 79.8745),
  ('Havelock Town', 'Colombo', 6.8959, 79.8589),
  ('Union Place', 'Colombo', 6.9105, 79.8555),
  ('Piliyandala', 'Colombo', 6.8014, 79.9296),
  ('Pannipitiya', 'Colombo', 6.8411, 79.9047),
  ('Kohuwala', 'Colombo', 6.8780, 79.8952),
  ('Kotte', 'Colombo', 6.9028, 79.9197),
  ('Malabe', 'Colombo', 6.9073, 79.9711),
  ('Pepiliyana', 'Colombo', 6.8712, 79.8921),
  ('Wellawatte', 'Colombo', 6.8770, 79.8610),
  ('Cinnamon Gardens', 'Colombo', 6.9130, 79.8600),
  ('Fort', 'Colombo', 6.9344, 79.8428),
  ('Rajagiriya', 'Colombo', 6.9085, 79.8915),
  ('Kaduwela', 'Colombo', 6.9355, 79.9840),
  ('Kotahena', 'Colombo', 6.9480, 79.8620),
  ('Port City', 'Colombo', 6.9352, 79.8432),
  ('Dematagoda', 'Colombo', 6.9360, 79.8770);

-- ── Riders: one DELIVERY_DRIVER per active branch ────────────────────────────
INSERT INTO admin_users (
  id, name, email, "passwordHash", "roleId", "storeId",
  "isActive", "dutyStatus", "vehicleNumber", "updatedAt"
)
SELECT
  'seed-live-driver-' || s.id,
  'Seed Rider ' || s.name,
  'seed-live-driver-' || s.id || '@bingchun-test.lk',
  'SEED-NO-LOGIN',
  (SELECT id FROM roles WHERE name = 'DELIVERY_DRIVER'),
  s.id,
  true,
  'OFF_DUTY'::"DriverDutyStatus",
  'SEED-' || LPAD((ROW_NUMBER() OVER (ORDER BY s.name))::text, 4, '0'),
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
      AND au.id NOT LIKE 'seed-live-driver-%'
  )
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS tmp_live_driver;
CREATE TEMP TABLE tmp_live_driver AS
SELECT DISTINCT ON (au."storeId") au."storeId" AS store_id, au.id AS driver_id
FROM admin_users au
JOIN roles r ON r.id = au."roleId"
WHERE r.name = 'DELIVERY_DRIVER'
  AND au."isActive" = true
  AND au."storeId" IN (SELECT id FROM stores WHERE "isActive" = true)
ORDER BY au."storeId", (au.id LIKE 'seed-live-driver-%') ASC, au.id;

-- ── Orders (base) ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS tmp_live_o;
CREATE TEMP TABLE tmp_live_o AS
WITH
active_stores AS (
  SELECT id, name, city, district, lat, lng, ROW_NUMBER() OVER (ORDER BY name) AS store_rn
  FROM stores WHERE "isActive" = true
),
product_count AS (
  SELECT COUNT(*)::int AS n FROM products WHERE "isAvailable" = true
),
product_pool AS (
  SELECT id, name, "basePrice",
         ROW_NUMBER() OVER (ORDER BY "basePrice", name) - 1 AS price_rn
  FROM products WHERE "isAvailable" = true
),
expanded AS (
  SELECT
    s.id AS store_id,
    s.name AS store_name,
    s.city,
    s.district,
    s.lat AS store_lat,
    s.lng AS store_lng,
    s.store_rn,
    gs.n AS local_seq,
    ('seed-live-' || s.id || '-' || LPAD(gs.n::text, 2, '0')) AS order_id,
    -- n=23 (yesterday) and n=24 (today): live queue rows for Order History tabs.
    -- Pickup for odd branches, delivery for even branches. Mostly RECEIVED / PREPARING /
    -- READY (READY only for pickup, since unassigned READY delivery orders are hidden),
    -- with a handful of CANCELLED (every 10th branch).
    CASE
      WHEN gs.n IN (4, 8, 10, 12, 17, 18, 19, 20, 21, 22) THEN 'TAKEAWAY'::"OrderMode"
      WHEN gs.n IN (23, 24) AND s.store_rn % 2 = 1 THEN 'TAKEAWAY'::"OrderMode"
      ELSE 'DELIVERY'::"OrderMode"
    END AS order_mode,
    CASE
      WHEN gs.n IN (5, 14) OR (gs.n = 9 AND s.store_rn % 3 = 0) THEN 'CANCELLED'::"OrderStatus"
      WHEN gs.n IN (23, 24) AND s.store_rn % 10 = 0 THEN 'CANCELLED'::"OrderStatus"
      WHEN gs.n IN (23, 24) THEN
        CASE (s.store_rn + gs.n) % 3
          WHEN 0 THEN 'RECEIVED'::"OrderStatus"
          WHEN 1 THEN 'PREPARING'::"OrderStatus"
          ELSE CASE WHEN s.store_rn % 2 = 1 THEN 'READY'::"OrderStatus" ELSE 'PREPARING'::"OrderStatus" END
        END
      ELSE 'DELIVERED'::"OrderStatus"
    END AS status,
    CASE
      -- Pickup mix: Cash (counter), Online (PayHere) and Card all appear every month.
      WHEN gs.n IN (4, 12, 18, 22) THEN 'CASH_AT_COUNTER'::"PaymentMethod"
      WHEN gs.n IN (8, 19, 20) THEN 'PAYHERE'::"PaymentMethod"
      WHEN gs.n IN (10, 17, 21) THEN 'CARD'::"PaymentMethod"
      WHEN (gs.n + s.store_rn) % 2 = 0 THEN 'PAYHERE'::"PaymentMethod"
      ELSE 'CARD'::"PaymentMethod"
    END AS payment_method, -- n=23/24 use the online rule above (never cash)
    CASE
      WHEN gs.n = 5 THEN 'COMPLETE'::"RefundStatus"
      WHEN gs.n = 14 THEN
        CASE WHEN s.store_rn % 5 = 0 THEN 'REJECTED'::"RefundStatus" ELSE 'COMPLETE'::"RefundStatus" END
      WHEN gs.n IN (23, 24) AND s.store_rn % 10 = 0 THEN
        CASE WHEN s.store_rn % 20 = 0 THEN 'REJECTED'::"RefundStatus" ELSE 'COMPLETE'::"RefundStatus" END
      WHEN gs.n = 9 AND s.store_rn % 3 = 0 THEN 'REJECTED'::"RefundStatus"
      ELSE NULL
    END AS refund_status,
    pr.id AS product_id,
    pr.name AS product_name,
    CASE WHEN (s.store_rn + gs.n) % 4 = 0 THEN ROUND(pr."basePrice" * 1.3)::int ELSE pr."basePrice" END AS unit_price,
    1 + ((s.store_rn + gs.n) % 4) AS quantity,
    -- Same-day pairs (1,2),(3,4)... so riders batch 1-2 stops.
    -- n=13..16 delivery on Oct 1..4; n=17..22 pickup on Oct 1,2,3 and three on today (Oct 4).
    CASE
      WHEN gs.n <= 12 THEN p.start_date + ((((gs.n - 1) / 2) * 22) + (s.store_rn % 9))::int
      WHEN gs.n <= 16 THEN p.end_date - (16 - gs.n)
      WHEN gs.n = 17 THEN p.end_date - 3
      WHEN gs.n = 18 THEN p.end_date - 2
      WHEN gs.n = 19 THEN p.end_date - 1
      WHEN gs.n = 23 THEN p.end_date - 1
      ELSE p.end_date
    END AS order_day,
    radians(((s.store_rn * 37 + gs.n * 53) % 360)::float8) AS angle,
    (0.006 + ((s.store_rn * 13 + gs.n * 29) % 40) / 1000.0)::float8 AS radius,
    p.now_utc
  FROM active_stores s
  CROSS JOIN tmp_live_params p
  CROSS JOIN generate_series(1, 24) AS gs(n)
  CROSS JOIN product_count pc
  JOIN product_pool pr ON pr.price_rn = ((s.store_rn * 7 + gs.n * 11) % pc.n)
),
priced AS (
  SELECT e.*,
         (e.unit_price * e.quantity) AS subtotal,
         CASE WHEN e.order_mode = 'DELIVERY'::"OrderMode" THEN 150 + (e.store_rn % 5) * 50 ELSE 0 END AS delivery_fee,
         CASE WHEN (e.store_rn + e.local_seq) % 5 = 0 THEN 75 + (e.local_seq % 4) * 25 ELSE 0 END AS discount,
         CASE WHEN (e.store_rn + e.local_seq) % 9 = 0 THEN 40 ELSE 0 END AS loyalty_discount,
         e.store_lat + e.radius * sin(e.angle) AS stop_lat,
         e.store_lng + e.radius * cos(e.angle) AS stop_lng,
         LEAST(
           (e.order_day::timestamp
             + ((3 + (e.store_rn % 6)) * interval '1 hour')
             + (((e.local_seq - 1) % 2) * interval '18 minutes')
             + (((e.store_rn * e.local_seq) % 12) * interval '1 minute')),
           -- Cap "today" orders in the past; stagger so same-day orders differ by minutes.
           e.now_utc - interval '2 hours' - ((e.local_seq % 8) * interval '6 minutes')
         ) AS created_at
  FROM expanded e
),
final AS (
  SELECT p.*,
         ROUND(p.subtotal * 0.065)::int AS convenient_fee,
         ('BC' || to_char(p.order_day, 'YYMMDD') || '-' ||
           upper(substr(md5(p.store_id || ':live:' || p.local_seq::text), 1, 8))) AS order_number
  FROM priced p
)
SELECT
  f.*,
  GREATEST(f.subtotal + f.delivery_fee + f.convenient_fee - f.discount - f.loyalty_discount, 0) AS total,
  CASE
    WHEN f.payment_method = 'CASH_AT_COUNTER'::"PaymentMethod" THEN 0
    ELSE GREATEST(f.subtotal + f.delivery_fee + f.convenient_fee - f.discount - f.loyalty_discount, 0)
  END AS prepaid_amount,
  CASE WHEN f.refund_status = 'REJECTED'::"RefundStatus" THEN 'BRANCH_ADMIN'::"RefundSubmittedBy"
       ELSE 'CUSTOMER'::"RefundSubmittedBy" END AS refund_submitted_by,
  CASE
    WHEN f.refund_status = 'COMPLETE'::"RefundStatus" AND f.local_seq = 5 THEN 85.0
    WHEN f.refund_status = 'COMPLETE'::"RefundStatus" THEN 80.0
    ELSE 0.0
  END AS refund_pct,
  CASE
    WHEN f.refund_status = 'COMPLETE'::"RefundStatus" THEN
      GREATEST(ROUND(
        (f.subtotal + f.delivery_fee + f.convenient_fee - f.discount - f.loyalty_discount)
        * CASE WHEN f.local_seq = 5 THEN 0.85 ELSE 0.80 END
      ), 0)::int
    ELSE 0
  END AS refund_amount,
  ar.name AS area_name,
  ar.district AS area_district
FROM final f
LEFT JOIN LATERAL (
  SELECT a.name, a.district
  FROM tmp_live_area a
  WHERE power(a.lat - f.stop_lat, 2) + power(a.lng - f.stop_lng, 2) < power(0.045, 2)
  ORDER BY power(a.lat - f.stop_lat, 2) + power(a.lng - f.stop_lng, 2)
  LIMIT 1
) ar ON true;

-- ── Delivery stops / jobs (delivered DELIVERY orders only) ───────────────────
DROP TABLE IF EXISTS tmp_live_stop;
CREATE TEMP TABLE tmp_live_stop AS
SELECT
  o.order_id, o.store_id, o.order_day, o.created_at,
  o.stop_lat, o.stop_lng, o.store_lat, o.store_lng,
  o.delivery_fee, o.quantity,
  ROW_NUMBER() OVER (PARTITION BY o.store_id, o.order_day ORDER BY o.created_at, o.order_id) - 1 AS seq
FROM tmp_live_o o
WHERE o.status = 'DELIVERED'::"OrderStatus" AND o.order_mode = 'DELIVERY'::"OrderMode";

DROP TABLE IF EXISTS tmp_live_job;
CREATE TEMP TABLE tmp_live_job AS
SELECT
  ('seed-live-job-' || st.store_id || '-' || to_char(st.order_day, 'YYMMDD')) AS job_id,
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
FROM tmp_live_stop st
JOIN tmp_live_driver d ON d.store_id = st.store_id
GROUP BY st.store_id, st.order_day, d.driver_id;

DROP TABLE IF EXISTS tmp_live_stop2;
CREATE TEMP TABLE tmp_live_stop2 AS
SELECT
  st.order_id, st.store_id, st.order_day, st.seq,
  st.stop_lat, st.stop_lng, st.store_lat, st.store_lng,
  j.job_id, j.driver_id, j.assigned_at, j.started_at,
  j.started_at + ((st.seq * 10 + 8) * interval '1 minute') AS delivered_at,
  COALESCE(LAG(st.stop_lat) OVER w, st.store_lat) AS prev_lat,
  COALESCE(LAG(st.stop_lng) OVER w, st.store_lng) AS prev_lng,
  (LEAD(st.order_id) OVER w IS NULL) AS is_last
FROM tmp_live_stop st
JOIN tmp_live_job j ON j.store_id = st.store_id AND j.order_day = st.order_day
WINDOW w AS (PARTITION BY st.store_id, st.order_day ORDER BY st.seq);

DROP TABLE IF EXISTS tmp_live_jobx;
CREATE TEMP TABLE tmp_live_jobx AS
SELECT
  j.*,
  a.est_km,
  a.last_delivered_at,
  a.last_delivered_at + interval '1 minute' AS return_started_at,
  a.last_delivered_at + interval '15 minutes' AS completed_at
FROM tmp_live_job j
JOIN (
  SELECT
    s.job_id,
    ROUND((
      SUM(pg_temp.live_km(s.prev_lat, s.prev_lng, s.stop_lat, s.stop_lng))
      + MAX(CASE WHEN s.is_last THEN pg_temp.live_km(s.stop_lat, s.stop_lng, s.store_lat, s.store_lng) END)
    )::numeric, 2)::float8 AS est_km,
    MAX(s.delivered_at) AS last_delivered_at
  FROM tmp_live_stop2 s
  GROUP BY s.job_id
) a ON a.job_id = j.job_id;

-- Route polyline points: branch -> (mid, stop)* -> mid -> branch
DROP TABLE IF EXISTS tmp_live_route;
CREATE TEMP TABLE tmp_live_route AS
SELECT job_id, ord, lat, lng FROM (
  SELECT s.job_id, 0 AS ord, s.store_lat AS lat, s.store_lng AS lng
  FROM tmp_live_stop2 s WHERE s.seq = 0
  UNION ALL
  SELECT s.job_id, s.seq * 2 + 1,
         (s.prev_lat + s.stop_lat) / 2 + ((abs(hashtext(s.order_id)) % 7) - 3) * 0.0004,
         (s.prev_lng + s.stop_lng) / 2 + ((abs(hashtext(s.order_id || 'x')) % 7) - 3) * 0.0004
  FROM tmp_live_stop2 s
  UNION ALL
  SELECT s.job_id, s.seq * 2 + 2, s.stop_lat, s.stop_lng
  FROM tmp_live_stop2 s
  UNION ALL
  SELECT s.job_id, 1000,
         (s.stop_lat + s.store_lat) / 2 + ((abs(hashtext(s.order_id || 'r')) % 7) - 3) * 0.0004,
         (s.stop_lng + s.store_lng) / 2 + ((abs(hashtext(s.order_id || 'q')) % 7) - 3) * 0.0004
  FROM tmp_live_stop2 s WHERE s.is_last
  UNION ALL
  SELECT s.job_id, 1001, s.store_lat, s.store_lng
  FROM tmp_live_stop2 s WHERE s.is_last
) r;

-- ── Final order table (adds job link + completion time) ───────────────────────
DROP TABLE IF EXISTS tmp_live;
CREATE TEMP TABLE tmp_live AS
SELECT
  o.*,
  s.job_id,
  s.driver_id,
  s.seq,
  s.started_at AS job_started_at,
  s.delivered_at,
  CASE
    WHEN o.status = 'CANCELLED'::"OrderStatus" THEN o.created_at + interval '14 minutes'
    WHEN o.status = 'RECEIVED'::"OrderStatus" THEN o.created_at
    WHEN o.status = 'PREPARING'::"OrderStatus" THEN o.created_at + interval '8 minutes'
    WHEN o.status = 'READY'::"OrderStatus" THEN o.created_at + interval '18 minutes'
    WHEN o.order_mode = 'DELIVERY'::"OrderMode" THEN s.delivered_at
    ELSE o.created_at + interval '30 minutes'
  END AS final_at
FROM tmp_live_o o
LEFT JOIN tmp_live_stop2 s ON s.order_id = o.order_id;

-- Safety: no delivered delivery order may be missing a job.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tmp_live
    WHERE status = 'DELIVERED'::"OrderStatus" AND order_mode = 'DELIVERY'::"OrderMode" AND job_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Delivered delivery order without job (missing branch rider?)';
  END IF;
  IF EXISTS (SELECT 1 FROM tmp_live WHERE final_at > (now() AT TIME ZONE 'UTC')) THEN
    RAISE EXCEPTION 'Seed order timeline would end in the future';
  END IF;
END $$;

-- ── orders ───────────────────────────────────────────────────────────────────
INSERT INTO orders (
  id, "orderNumber", "trackToken", "guestName", "guestPhone",
  "storeId", "orderMode", status, "paymentMethod", "paymentStatus", "paymentRef",
  subtotal, "deliveryFee", "convenientFee", discount, "loyaltyDiscount",
  total, "prepaidAmount", "estimatedMinutes", notes,
  "cancelReason", "cancelledAtStatus",
  "deliveryAddressLine", "deliveryCity", "deliveryDistrict", "deliveryLat", "deliveryLng",
  platform, channel, "createdAt", "updatedAt"
)
SELECT
  t.order_id, t.order_number, md5(t.order_id),
  'Live Guest ' || t.store_rn || '-' || t.local_seq,
  '077' || LPAD((7000000 + ((t.store_rn * 3 + t.local_seq) % 200))::text, 7, '0'),
  t.store_id, t.order_mode, t.status, t.payment_method, 'PAID'::"PaymentStatus",
  CASE WHEN t.payment_method IN ('PAYHERE'::"PaymentMethod", 'CARD'::"PaymentMethod")
       THEN 'SEED-LV-' || RIGHT(t.order_id, 10) ELSE NULL END,
  t.subtotal, t.delivery_fee, t.convenient_fee, t.discount, t.loyalty_discount,
  t.total, t.prepaid_amount, 25, 'SQL seed live to today',
  CASE WHEN t.status = 'CANCELLED'::"OrderStatus" THEN 'CUSTOMER_REQUEST'::"CancelReason" ELSE NULL END,
  CASE WHEN t.status = 'CANCELLED'::"OrderStatus" THEN 'PREPARING'::"OrderStatus" ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN
    (10 + ((t.store_rn + t.local_seq) % 80))::text || ' ' ||
    COALESCE(t.area_name, t.city) || ' Road' ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN COALESCE(t.area_name, t.city) ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN COALESCE(t.area_district, t.district) ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN t.stop_lat ELSE NULL END,
  CASE WHEN t.order_mode = 'DELIVERY'::"OrderMode" THEN t.stop_lng ELSE NULL END,
  0, 'WEB'::"OrderChannel",
  t.created_at,
  t.final_at
FROM tmp_live t;

INSERT INTO order_items (id, "orderId", "productId", "productName", size, quantity, "unitPrice", "totalPrice")
SELECT t.order_id || '-item', t.order_id, t.product_id, t.product_name, 'REGULAR'::"ProductSize",
       t.quantity, t.unit_price, t.subtotal
FROM tmp_live t;

-- ── order_status_events ──────────────────────────────────────────────────────
INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e1', t.order_id, 'RECEIVED'::"OrderStatus", NULL, t.created_at FROM tmp_live t;

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e2', t.order_id, 'PREPARING'::"OrderStatus", NULL, t.created_at + interval '8 minutes'
FROM tmp_live t WHERE t.status <> 'RECEIVED'::"OrderStatus";

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e3', t.order_id, 'READY'::"OrderStatus", NULL, t.created_at + interval '18 minutes'
FROM tmp_live t WHERE t.status IN ('DELIVERED'::"OrderStatus", 'READY'::"OrderStatus");

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e4', t.order_id, 'OUT_FOR_DELIVERY'::"OrderStatus", NULL, t.job_started_at
FROM tmp_live t WHERE t.status = 'DELIVERED'::"OrderStatus" AND t.order_mode = 'DELIVERY'::"OrderMode";

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e5', t.order_id, 'DELIVERED'::"OrderStatus", 'Completed', t.final_at
FROM tmp_live t WHERE t.status = 'DELIVERED'::"OrderStatus";

INSERT INTO order_status_events (id, "orderId", status, note, "createdAt")
SELECT t.order_id || '-e6', t.order_id, 'CANCELLED'::"OrderStatus", 'Seed cancellation', t.final_at
FROM tmp_live t WHERE t.status = 'CANCELLED'::"OrderStatus";

-- ── refunds + wallet REFUND rows (COMPLETE only) ─────────────────────────────
INSERT INTO refunds (
  id, "orderId", "customerName", "submittedBy", "cancellationReason",
  "salesTotal", "deliveryFee", "convenienceFee", "orderTotal",
  "refundPercentage", "refundAmount", "cancelledAtStatus", "cancelledWithinWindow",
  status, "processedAt", "createdAt", "updatedAt"
)
SELECT
  ('seed-live-refund-' || t.order_id),
  t.order_id,
  'Live Guest ' || t.store_rn || '-' || t.local_seq,
  t.refund_submitted_by,
  'Customer requested cancellation',
  t.subtotal, t.delivery_fee, t.convenient_fee, t.total,
  t.refund_pct,
  t.refund_amount,
  'PREPARING'::"OrderStatus",
  false,
  t.refund_status,
  LEAST(t.final_at + interval '1 day', t.now_utc),
  t.final_at + interval '5 minutes',
  LEAST(t.final_at + interval '1 day', t.now_utc)
FROM tmp_live t
WHERE t.status = 'CANCELLED'::"OrderStatus" AND t.refund_status IS NOT NULL;

INSERT INTO wallet_transactions (
  id, "storeId", "orderId", type, amount, "balanceAfter",
  "paymentMethod", description, reference, "createdAt"
)
SELECT
  ('seed-live-wtx-refund-' || t.order_id),
  t.store_id,
  t.order_id,
  'REFUND'::"WalletTransactionType",
  -(t.refund_amount * 100),
  0,
  t.payment_method,
  'Refund for order ' || t.order_number,
  t.order_number,
  LEAST(t.final_at + interval '1 day', t.now_utc)
FROM tmp_live t
WHERE t.refund_status = 'COMPLETE'::"RefundStatus" AND t.refund_amount > 0
  AND t.payment_method IN ('PAYHERE'::"PaymentMethod", 'CARD'::"PaymentMethod");

-- ── delivery_jobs (COMPLETED) ────────────────────────────────────────────────
INSERT INTO delivery_jobs (
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
  'Delivery run ' || to_char(j.order_day, 'YYYY-MM-DD') || ' (' || j.stop_count || ' stop' ||
    CASE WHEN j.stop_count > 1 THEN 's' ELSE '' END || ')',
  'RIDE-SEED-' || LPAD(j.job_no::text, 5, '0'),
  'COMPLETED'::"DeliveryJobStatus",
  j.scheduled_at, j.assigned_at, j.started_at, j.return_started_at, j.completed_at,
  j.total_cups,
  j.est_km,
  (ROUND(j.est_km * 3) + 10 + j.stop_count * 4)::int,
  j.est_km,
  j.total_fees,
  ROUND((j.est_km * 1.08)::numeric, 2)::float8,
  (SELECT jsonb_agg(jsonb_build_array(round(r.lat::numeric, 6), round(r.lng::numeric, 6)) ORDER BY r.ord)::text
   FROM tmp_live_route r WHERE r.job_id = j.job_id),
  st.lat, st.lng,
  j.scheduled_at - interval '5 minutes',
  j.completed_at
FROM tmp_live_jobx j
JOIN stores st ON st.id = j.store_id;

INSERT INTO delivery_job_orders ("jobId", "orderId", sequence)
SELECT s.job_id, s.order_id, s.seq::int FROM tmp_live_stop2 s;

INSERT INTO delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de1', s.order_id, s.job_id, s.driver_id, 'ASSIGNED'::"DeliveryDomainState", NULL, s.assigned_at
FROM tmp_live_stop2 s;

INSERT INTO delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de2', s.order_id, s.job_id, s.driver_id, 'PICKED_UP'::"DeliveryDomainState", NULL, s.started_at
FROM tmp_live_stop2 s;

INSERT INTO delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de3', s.order_id, s.job_id, s.driver_id, 'EN_ROUTE'::"DeliveryDomainState", NULL,
       s.started_at + interval '1 minute'
FROM tmp_live_stop2 s;

INSERT INTO delivery_events (id, "orderId", "jobId", "driverId", state, note, "createdAt")
SELECT s.order_id || '-de4', s.order_id, s.job_id, s.driver_id, 'DELIVERED'::"DeliveryDomainState", 'Seed delivery', s.delivered_at
FROM tmp_live_stop2 s;

INSERT INTO delivery_attempts (id, "orderId", "jobId", "driverId", "attemptNo", outcome, note, lat, lng, "createdAt")
SELECT s.order_id || '-att', s.order_id, s.job_id, s.driver_id, 1,
       'DELIVERED'::"DeliveryAttemptOutcome", 'Seed delivery', s.stop_lat, s.stop_lng, s.delivered_at
FROM tmp_live_stop2 s;

-- ── GPS trail per completed job (interpolated along the route) ───────────────
INSERT INTO driver_locations (id, "driverId", "jobId", lat, lng, "accuracyM", "speedKph", heading, "batteryPct", "recordedAt")
SELECT
  'seed-live-loc-' || p.job_id || '-' || LPAD(p.rn::text, 2, '0'),
  j.driver_id,
  p.job_id,
  p.lat, p.lng,
  8.0,
  CASE WHEN p.rn = 1 OR p.rn = p.cnt THEN 0 ELSE 18 + (p.rn * 3) % 14 END,
  ((p.rn * 47 + p.job_no) % 360)::float8,
  GREATEST(30, 95 - p.rn * 3),
  j.started_at + (j.completed_at - j.started_at) * ((p.rn - 1)::float8 / GREATEST(p.cnt - 1, 1))
FROM (
  SELECT
    r.job_id, r.lat, r.lng,
    ROW_NUMBER() OVER (PARTITION BY r.job_id ORDER BY r.ord) AS rn,
    COUNT(*) OVER (PARTITION BY r.job_id) AS cnt,
    jx.job_no
  FROM tmp_live_route r
  JOIN tmp_live_jobx jx ON jx.job_id = r.job_id
) p
JOIN tmp_live_jobx j ON j.job_id = p.job_id;

-- ── Live map: branch riders ONLINE with fresh pings near the branch ──────────
UPDATE admin_users au
SET "dutyStatus" = 'ONLINE'::"DriverDutyStatus", "updatedAt" = NOW()
WHERE au.id IN (SELECT driver_id FROM tmp_live_driver);

INSERT INTO driver_locations (id, "driverId", "jobId", lat, lng, "accuracyM", "speedKph", heading, "batteryPct", "recordedAt")
SELECT
  'seed-live-loc-live-' || d.driver_id || '-' || k.n,
  d.driver_id,
  NULL,
  s.lat + 0.0008 * sin(k.n + (hashtext(d.driver_id) % 10)),
  s.lng + 0.0008 * cos(k.n + (hashtext(d.driver_id) % 10)),
  6.0,
  CASE WHEN k.n = 0 THEN 0 ELSE 8 + k.n * 2 END,
  ((k.n * 47 + abs(hashtext(d.driver_id)) % 90) % 360)::float8,
  70 + (abs(hashtext(d.driver_id)) % 25),
  (SELECT now_utc FROM tmp_live_params) - (k.n * interval '3 minutes')
FROM tmp_live_driver d
JOIN stores s ON s.id = d.store_id
CROSS JOIN generate_series(0, 4) AS k(n);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
SELECT status::text, COUNT(*)::int AS orders, MIN("createdAt") AS first_at, MAX("createdAt") AS last_at
FROM orders WHERE id LIKE 'seed-live-%' GROUP BY status ORDER BY status;

SELECT COUNT(*)::int AS pending_payment_orders
FROM orders WHERE id LIKE 'seed-live-%' AND "paymentStatus" = 'PENDING';

SELECT status::text, COUNT(*)::int AS jobs FROM delivery_jobs WHERE id LIKE 'seed-live-job-%' GROUP BY status;
