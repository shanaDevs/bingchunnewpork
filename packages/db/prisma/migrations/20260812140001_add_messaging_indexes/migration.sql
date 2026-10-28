-- Speed up retry job and conversation queries
CREATE INDEX `channel_messages_channel_direction_processed_createdAt_idx`
  ON `channel_messages`(`channel`, `direction`, `processed`, `createdAt`);

CREATE INDEX `channel_messages_channel_externalUserId_senderType_createdAt_idx`
  ON `channel_messages`(`channel`, `externalUserId`, `senderType`, `createdAt`);
