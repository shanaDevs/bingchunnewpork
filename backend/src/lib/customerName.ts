const PLACEHOLDER_NAMES = new Set([
  'guest',
  'walk-in',
  'bing chun user',
  '[deleted]',
  'customer',
]);

/** True when the value is missing or a known placeholder (e.g. phone-OTP default "Guest"). */
export function isPlaceholderCustomerName(name?: string | null): boolean {
  if (name == null) return true;
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

/**
 * Best customer label for admin UI / notifications.
 * Prefers order contact name, then account name, then phone — never surfaces "Guest".
 */
export function resolveCustomerDisplayName(parts: {
  guestName?: string | null;
  userName?: string | null;
  phone?: string | null;
  fallback?: string;
}): string {
  if (!isPlaceholderCustomerName(parts.guestName)) return parts.guestName!.trim();
  if (!isPlaceholderCustomerName(parts.userName)) return parts.userName!.trim();
  const phone = parts.phone?.trim();
  if (phone) return phone;
  return parts.fallback ?? 'Customer';
}

/** Pick the best name to persist on an order from checkout body + account. */
export function resolveOrderContactName(
  bodyName?: string | null,
  accountName?: string | null,
): string | undefined {
  const body = bodyName?.trim();
  const account = accountName?.trim();
  if (body && !isPlaceholderCustomerName(body)) return body;
  if (account && !isPlaceholderCustomerName(account)) return account;
  return undefined;
}
