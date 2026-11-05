/** Shared order sales-channel labels for admin UI */

export type OrderChannel = 'WEB' | 'APP' | 'POS' | 'WHATSAPP' | 'TELEGRAM';

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  WEB: 'Website',
  APP: 'App',
  POS: 'POS',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
};

export const ORDER_CHANNEL_EMOJI: Record<OrderChannel, string> = {
  WEB: '🌐',
  APP: '📱',
  POS: '🧾',
  WHATSAPP: '🟢',
  TELEGRAM: '🔵',
};

export function formatOrderChannel(channel: string | null | undefined): string {
  if (!channel) return ORDER_CHANNEL_LABELS.WEB;
  const raw = channel.toUpperCase();
  // Legacy DB values before WEB/APP/POS/WHATSAPP/TELEGRAM
  const normalized = raw === 'ONLINE' ? 'WEB' : raw === 'COUNTER' ? 'POS' : raw;
  const key = normalized as OrderChannel;
  const label = ORDER_CHANNEL_LABELS[key];
  const emoji = ORDER_CHANNEL_EMOJI[key];
  if (!label) return channel;
  return `${emoji} ${label}`;
}

export function isOrderChannel(value: string): value is OrderChannel {
  return value in ORDER_CHANNEL_LABELS;
}
