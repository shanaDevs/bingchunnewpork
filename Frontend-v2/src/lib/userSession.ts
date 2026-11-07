import { ORDER_CELEBRATION_STORAGE_KEY } from '@/lib/orderCelebration';
import { ORDER_PROMPT_SKIP_KEY } from '@/components/order/SiteOrderPrompt';

/** Clear per-session user data on sign-out (cart is handled separately). */
export function clearUserSessionData() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ORDER_PROMPT_SKIP_KEY);
  sessionStorage.removeItem(ORDER_CELEBRATION_STORAGE_KEY);
}
