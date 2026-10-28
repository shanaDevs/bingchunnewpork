-- =============================================================================
-- Fix deliveryZoneId FK failures on placeOrder
--
-- Cause: checkout can send zone id `distance-based-delivery` (virtual) or a
-- stale store zone id that is not in `delivery_zones`, so Order insert fails
-- with: Foreign key constraint violated: `deliveryZoneId` (P2003).
--
-- This script:
--   1) Creates the virtual distance-based zone row (so FK accepts that id)
--   2) Ensures every active store has Zone 1 (5 km) + Zone 2 (10 km)
--   3) Nulls any existing orders that point at missing zones
--
-- HeidiSQL:
--   1) Left panel → double-click database bingchun_db01
--   2) File → Load SQL file → this script → F9
-- Or CLI:
--   mysql -u root -p bingchun_db01 < prisma/migrations/fix_delivery_zone_fk.sql
-- =============================================================================

USE `bingchun_db01`;

SET NAMES utf8mb4;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Diagnostics (before)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  (SELECT COUNT(*) FROM `delivery_zones`) AS zone_count,
  (SELECT COUNT(*) FROM `delivery_zones` WHERE `id` = 'distance-based-delivery') AS has_distance_zone,
  (SELECT COUNT(*) FROM `stores` s
     WHERE s.`isActive` = 1
       AND NOT EXISTS (
         SELECT 1 FROM `delivery_zones` z
         WHERE z.`storeId` = s.`id` AND z.`isActive` = 1
       )) AS active_stores_missing_zones,
  (SELECT COUNT(*) FROM `orders` o
     LEFT JOIN `delivery_zones` z ON z.`id` = o.`deliveryZoneId`
     WHERE o.`deliveryZoneId` IS NOT NULL AND z.`id` IS NULL) AS orders_with_invalid_zone;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Virtual zone used by distance-based delivery pricing
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO `delivery_zones` (
  `id`, `storeId`, `name`, `radiusKm`, `fee`, `minOrder`, `isActive`, `isGlobal`
)
SELECT
  'distance-based-delivery',
  NULL,
  'Distance-based delivery',
  10,
  150,
  500,
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM `delivery_zones` WHERE `id` = 'distance-based-delivery'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Ensure each active store has standard 5 km + 10 km zones
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO `delivery_zones` (
  `id`, `storeId`, `name`, `radiusKm`, `fee`, `minOrder`, `isActive`, `isGlobal`
)
SELECT
  CONCAT('zone-', s.`id`, '-5km'),
  s.`id`,
  'Zone 1 (0-5 km)',
  5,
  150,
  500,
  1,
  0
FROM `stores` s
WHERE s.`isActive` = 1
  AND NOT EXISTS (
    SELECT 1 FROM `delivery_zones` z WHERE z.`id` = CONCAT('zone-', s.`id`, '-5km')
  )
  AND NOT EXISTS (
    SELECT 1 FROM `delivery_zones` z
    WHERE z.`storeId` = s.`id` AND z.`isActive` = 1 AND z.`radiusKm` <= 5
  );

INSERT INTO `delivery_zones` (
  `id`, `storeId`, `name`, `radiusKm`, `fee`, `minOrder`, `isActive`, `isGlobal`
)
SELECT
  CONCAT('zone-', s.`id`, '-10km'),
  s.`id`,
  'Zone 2 (5-10 km)',
  10,
  300,
  800,
  1,
  0
FROM `stores` s
WHERE s.`isActive` = 1
  AND NOT EXISTS (
    SELECT 1 FROM `delivery_zones` z WHERE z.`id` = CONCAT('zone-', s.`id`, '-10km')
  )
  AND NOT EXISTS (
    SELECT 1 FROM `delivery_zones` z
    WHERE z.`storeId` = s.`id` AND z.`isActive` = 1 AND z.`radiusKm` > 5 AND z.`radiusKm` <= 10
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Clear invalid deliveryZoneId on existing orders (orphan FK values)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE `orders` o
LEFT JOIN `delivery_zones` z ON z.`id` = o.`deliveryZoneId`
SET o.`deliveryZoneId` = NULL
WHERE o.`deliveryZoneId` IS NOT NULL
  AND z.`id` IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Diagnostics (after)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  (SELECT COUNT(*) FROM `delivery_zones`) AS zone_count,
  (SELECT COUNT(*) FROM `delivery_zones` WHERE `id` = 'distance-based-delivery') AS has_distance_zone,
  (SELECT COUNT(*) FROM `stores` s
     WHERE s.`isActive` = 1
       AND NOT EXISTS (
         SELECT 1 FROM `delivery_zones` z
         WHERE z.`storeId` = s.`id` AND z.`isActive` = 1
       )) AS active_stores_missing_zones,
  (SELECT COUNT(*) FROM `orders` o
     LEFT JOIN `delivery_zones` z ON z.`id` = o.`deliveryZoneId`
     WHERE o.`deliveryZoneId` IS NOT NULL AND z.`id` IS NULL) AS orders_with_invalid_zone;

SELECT 'deliveryZoneId FK fix applied.' AS result;
