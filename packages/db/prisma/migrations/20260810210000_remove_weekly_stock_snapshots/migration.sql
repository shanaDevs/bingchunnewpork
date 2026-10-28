-- Drop weekly_stock_snapshots regardless of FK constraint naming
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `weekly_stock_snapshots`;
SET FOREIGN_KEY_CHECKS = 1;
