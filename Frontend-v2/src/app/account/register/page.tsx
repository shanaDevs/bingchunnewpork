import { redirect } from 'next/navigation';

/**
 * Joining now happens on the sign-in page (one flow for both, components/login-redesign). Kept as a redirect so
 * old links still work, including friends' referral links (/account/register?ref=CODE, see LoyaltyDashboard).
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { ref } = await searchParams;
  const referralCode = (Array.isArray(ref) ? ref[0] : ref)?.trim();
  redirect(referralCode ? `/account/login?ref=${encodeURIComponent(referralCode)}` : '/account/login');
}
