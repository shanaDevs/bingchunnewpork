-- Persist Meta WhatsApp webhook callback URL on system_settings
ALTER TABLE `system_settings`
  ADD COLUMN `whatsappCallbackUrl` TEXT NULL;
