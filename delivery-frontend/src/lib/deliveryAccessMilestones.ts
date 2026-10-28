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

export function milestoneTooltipLines(milestone: DeliveryMilestoneProgress): string[] {
  return milestone.thresholds.map((target, index) => {
    const met = milestone.status === 'active' || milestone.ordersThisMonth >= target;
    const check = met ? '✓' : '○';
    return `${check} ${MILESTONE_LABELS[index]}: ${target} orders/mo`;
  });
}

export const MILESTONE_STEP_HEX = ['#f97316', '#a855f7', '#3b82f6'] as const;
export const MILESTONE_COMPLETE_HEX = ['#f97316', '#a855f7', '#22c55e'] as const;

export function getMilestoneStepDotColor(
  milestone: DeliveryMilestoneProgress,
  stepIndex: number,
): string {
  if (milestone.status === 'active') return '#10b981';
  const state = getMilestoneStepState(milestone, stepIndex);
  if (state === 'pending') return '#94a3b8';
  if (
    stepIndex === 2 &&
    (milestone.status === 'ready' || milestone.ordersThisMonth >= milestone.thresholds[2])
  ) {
    return MILESTONE_COMPLETE_HEX[2];
  }
  if (state === 'completed') return MILESTONE_COMPLETE_HEX[stepIndex];
  return MILESTONE_STEP_HEX[stepIndex];
}

/** Tier colors when delivery is disabled; emerald override when delivery is active. */
export function milestoneFillClass(milestone: DeliveryMilestoneProgress): string {
  if (milestone.status === 'active') return 'bg-emerald-500';

  const orders = milestone.ordersThisMonth;
  const [starter, growth, deliveryReady] = milestone.thresholds;

  if (milestone.status === 'ready' || orders >= deliveryReady) return 'bg-green-500';
  if (orders >= growth) return 'bg-blue-500';
  if (orders >= starter) return 'bg-purple-500';
  return 'bg-orange-500';
}

export const MILESTONE_STEP_COLORS = [
  'bg-orange-500',
  'bg-purple-500',
  'bg-blue-500',
] as const;

export const MILESTONE_STEP_COMPLETE_COLORS = [
  'bg-orange-500',
  'bg-purple-500',
  'bg-green-500',
] as const;

export type MilestoneStepState = 'completed' | 'current' | 'pending';

export function getMilestoneStepState(
  milestone: DeliveryMilestoneProgress,
  stepIndex: number,
): MilestoneStepState {
  if (milestone.status === 'active' || milestone.status === 'ready') return 'completed';
  if (milestone.ordersThisMonth >= milestone.thresholds[stepIndex]) return 'completed';
  if (milestone.currentIndex === stepIndex) return 'current';
  return 'pending';
}

export function getMilestoneStepColor(
  milestone: DeliveryMilestoneProgress,
  stepIndex: number,
  state: MilestoneStepState,
): string {
  if (state === 'pending') return 'bg-navy-border text-muted';
  if (milestone.status === 'active') return 'bg-emerald-500 text-white';
  if (
    stepIndex === 2 &&
    (milestone.status === 'ready' || milestone.ordersThisMonth >= milestone.thresholds[2])
  ) {
    return 'bg-green-500 text-white';
  }
  if (state === 'completed') return `${MILESTONE_STEP_COMPLETE_COLORS[stepIndex]} text-white`;
  return `${MILESTONE_STEP_COLORS[stepIndex]} text-white`;
}

/** Fill percent for connector between step `connectorIndex` and `connectorIndex + 1`. */
export function getMilestoneConnectorFill(
  milestone: DeliveryMilestoneProgress,
  connectorIndex: number,
): number {
  if (milestone.status === 'active' || milestone.status === 'ready') return 100;
  if (milestone.ordersThisMonth >= milestone.thresholds[connectorIndex + 1]) return 100;
  if (milestone.currentIndex === connectorIndex) return milestone.progressPercent;
  if (milestone.ordersThisMonth >= milestone.thresholds[connectorIndex]) return 100;
  return 0;
}

export function getMilestoneConnectorColor(
  milestone: DeliveryMilestoneProgress,
  connectorIndex: number,
): string {
  if (milestone.status === 'active') return 'bg-emerald-500';
  if (milestone.status === 'ready') {
    return connectorIndex === 1 ? 'bg-green-500' : MILESTONE_STEP_COMPLETE_COLORS[connectorIndex];
  }
  if (milestone.ordersThisMonth >= milestone.thresholds[connectorIndex + 1]) {
    return connectorIndex + 1 === 2
      ? 'bg-green-500'
      : MILESTONE_STEP_COMPLETE_COLORS[connectorIndex + 1];
  }
  return MILESTONE_STEP_COLORS[connectorIndex];
}
