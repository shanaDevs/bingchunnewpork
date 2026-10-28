-- Assign menu tags to products that are missing them.
-- Safe to re-run: only updates rows where tag IS NULL or tag = ''.
-- Run against your Bing Chun database, e.g.:
--   mysql -u user -p database_name < backend/prisma/migrations/assign_product_tags.sql

UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Blueberry Bobo Tea'            AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Signature'     WHERE `name` = 'Lychee Jasmine Milk Tea'       AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Fresh Lemonade'                AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Jasmine Green Tea'             AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Lemon Black Tea'               AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Popular'       WHERE `name` = 'Strawberry Lemon Tea'          AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Blueberry Milkshake'           AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Popular'       WHERE `name` = 'Chocolate Oreo Milkshake'      AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'New'           WHERE `name` = 'Mulberry Milkshake'            AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Popular'       WHERE `name` = 'Strawberry Oreo Milkshake'     AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Blueberry Sundae'              AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Popular'       WHERE `name` = 'Blueberry Chocolate Sundae'   AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Chocolate Biscuit Sundae'     AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Popular'       WHERE `name` = 'Mango Sundae'                 AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Popular'       WHERE `name` = 'Oreo Chocolate Sundae'        AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Classic'       WHERE `name` = 'Strawberry Sundae'             AND (`tag` IS NULL OR `tag` = '');
UPDATE `products` SET `tag` = 'Rs.200 Only'   WHERE `name` = 'Mix Choco Vanilla Ice Cream'  AND (`tag` IS NULL OR `tag` = '');

-- Optional: tag any remaining untagged products by category slug
UPDATE `products` p
JOIN `categories` c ON c.id = p.categoryId
SET p.tag = 'Classic'
WHERE (p.tag IS NULL OR p.tag = '')
  AND c.slug IN ('milk-tea', 'fruit-tea', 'bubble-tea');

UPDATE `products` p
JOIN `categories` c ON c.id = p.categoryId
SET p.tag = 'Popular'
WHERE (p.tag IS NULL OR p.tag = '')
  AND c.slug IN ('milkshake', 'sundae');

UPDATE `products` p
JOIN `categories` c ON c.id = p.categoryId
SET p.tag = 'Rs.200 Only'
WHERE (p.tag IS NULL OR p.tag = '')
  AND c.slug = 'ice-cream'
  AND p.basePrice <= 200;
