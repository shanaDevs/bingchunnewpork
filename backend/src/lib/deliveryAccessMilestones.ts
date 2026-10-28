import { ensureAppSchema } from './appSchema';
import { prisma } from './prisma';

export const MILESTONE_LABELS = ['Starter', 'Growth', 'Delivery ready'] as const;

export const DEFAULT_DELIVERY_MILESTONE_ORDERS = {
  milestone1: 50,
  milestone2: 150,
  milestone3: 300,
} as const;

export type DeliveryMilestoneSettings = {
  milestone1: number;
  milestone2: number;
  milestone3: number;
};

export type DeliveryMilestoneProgress = {
  currentIndex: number;
  currentLabel: string;
  progressPercent: number;
  ordersThisMonth: number;
  nextTarget: number | null;
  status: 'in_progress' | 'ready' | 'active';
  thresholds: [number, number, number];
};

let milestoneSettingsCache: DeliveryMilestoneSettings | null = null;

export function invalidateDeliveryMilestoneSettingsCache(): void {
  milestoneSettingsCache = null;
}

function clampMilestoneOrders(value: number): number {
  return Math.max(1, Math.round(value));
}

export function validateMilestoneSettings(settings: DeliveryMilestoneSettings): void {
  const m1 = clampMilestoneOrders(settings.milestone1);
  const m2 = clampMilestoneOrders(settings.milestone2);
  const m3 = clampMilestoneOrders(settings.milestone3);
  if (!(m1 < m2 && m2 < m3)) {
    throw new Error('Milestone order targets must be strictly ascending (Starter < Growth < Delivery ready)');
  }
}

async function readDeliveryMilestoneSettingsFromDb(): Promise<DeliveryMilestoneSettings> {
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      deliveryMilestone1Orders: number | bigint | null;
      deliveryMilestone2Orders: number | bigint | null;
      deliveryMilestone3Orders: number | bigint | null;
    }>
  >(
    'SELECT "deliveryMilestone1Orders", "deliveryMilestone2Orders", "deliveryMilestone3Orders" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  const row = rows[0];
  return {
    milestone1: clampMilestoneOrders(
      row?.deliveryMilestone1Orders == null
        ? DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone1
        : Number(row.deliveryMilestone1Orders),
    ),
    milestone2: clampMilestoneOrders(
      row?.deliveryMilestone2Orders == null
        ? DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone2
        : Number(row.deliveryMilestone2Orders),
    ),
    milestone3: clampMilestoneOrders(
      row?.deliveryMilestone3Orders == null
        ? DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone3
        : Number(row.deliveryMilestone3Orders),
    ),
  };
}

export async function getDeliveryMilestoneSettings(): Promise<DeliveryMilestoneSettings> {
  if (milestoneSettingsCache) return milestoneSettingsCache;
  milestoneSettingsCache = await readDeliveryMilestoneSettingsFromDb();
  return milestoneSettingsCache;
}

export async function setDeliveryMilestoneSettings(
  settings: DeliveryMilestoneSettings,
): Promise<DeliveryMilestoneSettings> {
  const normalized = {
    milestone1: clampMilestoneOrders(settings.milestone1),
    milestone2: clampMilestoneOrders(settings.milestone2),
    milestone3: clampMilestoneOrders(settings.milestone3),
  };
  validateMilestoneSettings(normalized);
  await ensureAppSchema();
  await prisma.$executeRawUnsafe(
    'UPDATE "app_settings" SET "deliveryMilestone1Orders" = $1, "deliveryMilestone2Orders" = $2, "deliveryMilestone3Orders" = $3 WHERE "id" = $4',
    normalized.milestone1,
    normalized.milestone2,
    normalized.milestone3,
    'default',
  );
  milestoneSettingsCache = normalized;
  return normalized;
}

export function computeDeliveryMilestoneProgress(
  ordersThisMonth: number,
  deliveryEnabled: boolean,
  settings: DeliveryMilestoneSettings,
): DeliveryMilestoneProgress {
  const thresholds: [number, number, number] = [
    settings.milestone1,
    settings.milestone2,
    settings.milestone3,
  ];

  const orders = Math.max(0, ordersThisMonth);

  if (deliveryEnabled) {
    return {
      currentIndex: thresholds.length - 1,
      currentLabel: MILESTONE_LABELS[thresholds.length - 1],
      progressPercent: 100,
      ordersThisMonth: orders,
      nextTarget: null,
      status: 'active',
      thresholds,
    };
  }

  const finalTarget = thresholds[thresholds.length - 1];

  let progress: Omit<DeliveryMilestoneProgress, 'status'>;
  let baseStatus: 'in_progress' | 'ready';

  if (orders >= finalTarget) {
    progress = {
      currentIndex: thresholds.length - 1,
      currentLabel: MILESTONE_LABELS[thresholds.length - 1],
      progressPercent: 100,
      ordersThisMonth: orders,
      nextTarget: null,
      thresholds,
    };
    baseStatus = 'ready';
  } else {
    baseStatus = 'in_progress';
    progress = {
      currentIndex: 0,
      currentLabel: MILESTONE_LABELS[0],
      progressPercent: 0,
      ordersThisMonth: orders,
      nextTarget: thresholds[0],
      thresholds,
    };

    for (let i = 0; i < thresholds.length; i++) {
      const ceiling = thresholds[i];
      if (orders < ceiling) {
        const floor = i === 0 ? 0 : thresholds[i - 1];
        const span = ceiling - floor;
        const progressPercent = span > 0 ? Math.min(100, ((orders - floor) / span) * 100) : 0;
        progress = {
          currentIndex: i,
          currentLabel: MILESTONE_LABELS[i],
          progressPercent,
          ordersThisMonth: orders,
          nextTarget: ceiling,
          thresholds,
        };
        break;
      }
    }
  }

  return {
    ...progress,
    status: baseStatus,
  };
}
