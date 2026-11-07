import { ApiError } from "@/lib/api";
import { isValidSriLankanPhone } from "@/lib/phone";

/** Nine digits follow +94 in a Sri Lankan number (7X XXX XXXX). */
const LOCAL_DIGITS = 9;

/**
 * For the number field after its fixed +94 chip: the digits typed. A leading 0 (077…) or a pasted 94 / +94 / 0094
 * is dropped, so any way of writing the number ends up as the nine digits after +94.
 */
export function toLocalDigits(input: string) {
  let digits = input.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.startsWith("94")) digits = digits.slice(2).replace(/^0+/, "");
  return digits.slice(0, LOCAL_DIGITS);
}

/** "771234567" → "77 123 4567", as it's typed. */
export const groupLocalDigits = (digits: string) => [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5)].filter(Boolean).join(" ");

/** The digits after +94 as the app's 07XXXXXXXX form (lib/phone), or null when that isn't a valid number. */
export function phoneFromLocalDigits(digits: string): string | null {
  const phone = `0${digits}`;
  return isValidSriLankanPhone(phone) ? phone : null;
}

/** For showing a 07XXXXXXXX number: "+94 77 123 4567". */
export const displayPhone = (phone: string) => `+94 ${groupLocalDigits(toLocalDigits(phone))}`;

/** Names the backend gives an account before its owner has told us theirs (new numbers, social sign-ins). */
const PLACEHOLDER_NAMES = new Set(["guest", "bing chun user"]);

/** True when the account has no real name yet, so the sign-in asks for one. */
export const needsName = (name: string | null | undefined) => !name?.trim() || PLACEHOLDER_NAMES.has(name.trim().toLowerCase());

/** What to tell the customer when a sign-in request fails. `fallback` covers anything without a useful message. */
export function authErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    if (err.status === 400 && /otp|code/i.test(err.message)) return "That code isn't right, or it has expired. Check it or send a new one.";
    if (err.status === 409) return "This number already has a Bing Chun account. Cancel Google sign-in and sign in with your number instead.";
    if (err.status === 429) return err.message || "Too many tries. Please wait a few minutes and try again.";
    return err.message || fallback;
  }
  // fetch itself failed: no connection, or the server is down.
  if (err instanceof TypeError) return "We couldn't reach Bing Chun. Check your connection and try again.";
  return fallback;
}
