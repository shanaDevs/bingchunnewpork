/** Social sign-in accounts use a synthetic phone like `google:sub` or `facebook:id`. */
export function isSocialPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^(google|facebook):/i.test(phone.trim());
}

export function userNeedsPhoneNumber(user: {
  needsPhoneNumber?: boolean;
  isPhoneVerified?: boolean;
  phone?: string;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.isPhoneVerified && user.phone && isValidSriLankanPhone(user.phone)) {
    return false;
  }
  if (user.needsPhoneNumber) return true;
  if (user.isPhoneVerified === false) return true;
  return isSocialPlaceholderPhone(user.phone);
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

export function isValidSriLankanPhone(phone: string): boolean {
  return /^0[0-9]{9}$/.test(normalizePhone(phone));
}

/** Keep only digits, max 10, for phone input fields. */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('94')) {
    return `0${digits.slice(2, 11)}`.slice(0, 10);
  }
  if (digits.length > 0 && digits[0] === '7' && !digits.startsWith('07')) {
    return `0${digits}`.slice(0, 10);
  }
  return digits.slice(0, 10);
}
