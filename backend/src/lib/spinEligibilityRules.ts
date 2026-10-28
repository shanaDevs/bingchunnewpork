import { prisma } from './prisma';
import { passesScheduleRules } from './promotionAutoApply';
import type { SpinSettings } from './appSchema';
import {
  evaluateLoyaltySpinAudience,
  getCustomerOrderStats,
  type LoyaltySpinProgress,
} from './loyaltyCampaign';
import { hasSpinCriterion } from './spinDisplay';

export type SpinEligibilityResult = {
  canSpin: boolean;
  reason: string | null;
  nextSpinAt: Date | null;
  loyaltySpin?: LoyaltySpinProgress | null;
};

function spinScheduleRules(settings: SpinSettings): Record<string, unknown> {
  return {
    daysOfWeek: settings.daysOfWeek,
    timeStart: settings.timeStart ?? undefined,
    timeEnd: settings.timeEnd ?? undefined,
  };
}

async function countUserLifetimeSpins(userId: string): Promise<number> {
  return prisma.spinResult.count({ where: { userId } });
}

async function countUserSpinsToday(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.spinResult.count({
    where: { userId, createdAt: { gte: startOfDay } },
  });
}

function fail(
  reason: string,
  extra?: { nextSpinAt?: Date | null; loyaltySpin?: LoyaltySpinProgress | null },
): SpinEligibilityResult {
  return {
    canSpin: false,
    reason,
    nextSpinAt: extra?.nextSpinAt ?? null,
    loyaltySpin: extra?.loyaltySpin ?? null,
  };
}

async function evaluateAddedCriteria(opts: {
  settings: SpinSettings;
  userId?: string;
  loyaltySpin: LoyaltySpinProgress;
}): Promise<SpinEligibilityResult | null> {
  const { settings, userId, loyaltySpin } = opts;
  const criteria = settings.criteria;
  const requireLogin =
    hasSpinCriterion(criteria, 'REQUIRE_LOGIN') || (criteria.length === 0 && settings.requireLogin);
  const firstOrderOnly =
    hasSpinCriterion(criteria, 'FIRST_ORDER_ONLY') || (criteria.length === 0 && settings.firstOrderOnly);
  const returningOnly = hasSpinCriterion(criteria, 'RETURNING_CUSTOMERS');
  const minOrders = criteria.find((c) => c.type === 'MIN_ORDERS');
  const minSpend = criteria.find((c) => c.type === 'MIN_SPEND');
  const loyaltyGate = hasSpinCriterion(criteria, 'LOYALTY_JOURNEY') && loyaltySpin.enabled;

  if (requireLogin && !userId) {
    return fail('Sign in to spin the wheel', { loyaltySpin });
  }

  if (loyaltyGate) {
    if (!userId) {
      return fail('Sign in and complete qualifying orders to unlock Spin & Win', { loyaltySpin });
    }
    if (!loyaltySpin.unlocked) {
      const needed = loyaltySpin.ordersNeeded;
      return fail(
        needed > 0
          ? `Complete ${needed} more qualifying order${needed === 1 ? '' : 's'} to unlock Spin & Win`
          : `Your ${loyaltySpin.requiredOrders}rd order must be at least LKR ${loyaltySpin.minOrderAmount.toLocaleString()} to unlock Spin & Win`,
        { loyaltySpin },
      );
    }
  }

  // Loyalty journey unlock needs multiple paid orders — never combine with first-order-only.
  const enforceFirstOrderOnly = firstOrderOnly && !(loyaltyGate && loyaltySpin.unlocked);

  let orderCount = 0;
  let lifetimeSpend = 0;
  if (userId && (enforceFirstOrderOnly || returningOnly || minOrders || minSpend)) {
    const stats = await getCustomerOrderStats(userId);
    orderCount = stats.validOrderCount;
    lifetimeSpend = stats.validOrderSubtotals.reduce((sum, n) => sum + n, 0);
  }

  if (enforceFirstOrderOnly) {
    if (!userId) {
      return fail('Sign in to use your first-order spin', { loyaltySpin });
    }
    if (orderCount > 0) {
      return fail('This spin is for first-time customers only', { loyaltySpin });
    }
  }

  if (returningOnly) {
    if (!userId) {
      return fail('Sign in to spin the wheel', { loyaltySpin });
    }
    if (orderCount < 1) {
      return fail('Place an order first to unlock this spin', { loyaltySpin });
    }
  }

  if (minOrders) {
    const needed = Math.max(1, minOrders.value ?? 1);
    if (!userId) {
      return fail(`Sign in and complete ${needed} order${needed === 1 ? '' : 's'} to spin`, { loyaltySpin });
    }
    if (orderCount < needed) {
      return fail(
        `Complete ${needed - orderCount} more order${needed - orderCount === 1 ? '' : 's'} to spin`,
        { loyaltySpin },
      );
    }
  }

  if (minSpend) {
    const needed = Math.max(1, minSpend.value ?? 0);
    if (!userId) {
      return fail(`Sign in and spend at least LKR ${needed.toLocaleString()} to spin`, { loyaltySpin });
    }
    if (lifetimeSpend < needed) {
      return fail(`Spend LKR ${needed.toLocaleString()} across orders to unlock this spin`, { loyaltySpin });
    }
  }

  return null;
}

export async function evaluateSpinAudienceRules(opts: {
  settings: SpinSettings;
  userId?: string;
  guestKey?: string;
  storeId?: string;
  now?: Date;
}): Promise<SpinEligibilityResult> {
  const { settings, userId, guestKey, storeId } = opts;
  const now = opts.now ?? new Date();

  if (!settings.spinEnabled) {
    return fail('Spin wheel is currently unavailable');
  }

  if (settings.startsAt) {
    const startsAt = new Date(settings.startsAt);
    if (!Number.isNaN(startsAt.getTime()) && now < startsAt) {
      return fail(`Spin wheel opens ${startsAt.toLocaleString()}`, { nextSpinAt: startsAt });
    }
  }

  if (settings.expiresAt) {
    const expiresAt = new Date(settings.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && now > expiresAt) {
      return fail('This spin campaign has ended');
    }
  }

  if (!passesScheduleRules('CUSTOM', spinScheduleRules(settings), now)) {
    return fail('Spin wheel is not available at this time');
  }

  const loyaltyEval = await evaluateLoyaltySpinAudience({ storeId, userId, now });
  const loyaltyGate = hasSpinCriterion(settings.criteria, 'LOYALTY_JOURNEY') && Boolean(loyaltyEval.spin.enabled);
  const loyaltySpin: LoyaltySpinProgress = {
    ...loyaltyEval.spin,
    gatesSpin: loyaltyGate,
  };

  const blocked = await evaluateAddedCriteria({ settings, userId, loyaltySpin });
  if (blocked) return blocked;

  if (userId && settings.maxPerCustomer != null) {
    const lifetime = await countUserLifetimeSpins(userId);
    if (lifetime >= settings.maxPerCustomer) {
      return fail('You have used all your spins for this campaign', { loyaltySpin });
    }
  }

  if (userId && settings.maxPerDay != null) {
    const today = await countUserSpinsToday(userId);
    if (today >= settings.maxPerDay) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return fail('Daily spin limit reached. Try again tomorrow.', { nextSpinAt: tomorrow, loyaltySpin });
    }
  }

  if (!userId && !guestKey && (settings.requireLogin || hasSpinCriterion(settings.criteria, 'REQUIRE_LOGIN'))) {
    return fail('Sign in to spin the wheel', { loyaltySpin });
  }

  return { canSpin: true, reason: null, nextSpinAt: null, loyaltySpin };
}
