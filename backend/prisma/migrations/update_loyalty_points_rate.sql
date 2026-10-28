-- Set loyalty earn rate: 1 point per LKR 100 spent (pointsPerLkr = 0.01)
UPDATE `loyalty_settings`
SET `pointsPerLkr` = 0.01
WHERE `id` = 'default';
