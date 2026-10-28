/** Social sign-in accounts use a synthetic phone like `google:sub` or `facebook:id`. */
export function isSocialPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^(google|facebook):/i.test(phone.trim());
}

/** Canonical Sri Lankan mobile: 07XXXXXXXX */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  if (digits.startsWith('7') && digits.length === 9) {
    return `0${digits}`;
  }
  if (digits.startsWith('07') && digits.length === 10) {
    return digits;
  }
  return phone.trim();
}

/**
 * WhatsApp Cloud API `to` field: digits only, country code, no leading +.
 * Uses the inbound sender WA id (e.g. 94759065140), never a hardcoded test number.
 */
export function toWhatsAppApiNumber(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('94') && digits.length >= 11) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return `94${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `94${digits}`;
  return digits;
}

/** Variants for matching guest orders placed with different phone formats */
export function phoneLookupVariants(phone: string): string[] {
  const local = normalizePhone(phone);
  const digits = local.replace(/\D/g, '');
  const withoutLeadingZero = digits.startsWith('0') ? digits.slice(1) : digits;
  return [...new Set([
    local,
    phone.trim(),
    digits,
    withoutLeadingZero,
    `+94${withoutLeadingZero}`,
    `94${withoutLeadingZero}`,
  ])].filter(Boolean);
}
