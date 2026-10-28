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
 * Best customer label for admin UI.
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

/** Checkout: prefer the form name when the account is still the OTP placeholder "Guest". */
export function resolveCheckoutContactName(
  formName?: string | null,
  accountName?: string | null,
): string {
  const form = formName?.trim() ?? '';
  const account = accountName?.trim() ?? '';
  if (form && !isPlaceholderCustomerName(form)) return form;
  if (account && !isPlaceholderCustomerName(account)) return account;
  return '';
}

/** Profile page label — never show legacy &quot;[Deleted]&quot; placeholder. */
export function formatAccountProfileName(parts: {
  name?: string | null;
  phone?: string | null;
}): string {
  return resolveCustomerDisplayName({
    userName: parts.name,
    phone: parts.phone,
    fallback: 'Your account',
  });
}

export function accountProfileInitial(parts: {
  name?: string | null;
  phone?: string | null;
}): string {
  const label = formatAccountProfileName(parts);
  const ch = label.replace(/\D/g, '').charAt(0) || label.charAt(0);
  return (ch || '?').toUpperCase();
}
