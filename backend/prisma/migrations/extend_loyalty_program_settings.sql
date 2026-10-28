-- Extend loyalty_settings for admin-configurable program + offers
ALTER TABLE `loyalty_settings`
  ADD COLUMN IF NOT EXISTS `referralBonusPoints` INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS `tiersJson` JSON NULL,
  ADD COLUMN IF NOT EXISTS `redeemRewardsJson` JSON NULL,
  ADD COLUMN IF NOT EXISTS `upcomingOffersJson` JSON NULL;

UPDATE `loyalty_settings`
SET `pointsPerLkr` = 0.01,
    `referralBonusPoints` = COALESCE(`referralBonusPoints`, 100)
WHERE `id` = 'default';
