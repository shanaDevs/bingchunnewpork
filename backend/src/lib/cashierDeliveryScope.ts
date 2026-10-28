import { dateStringInColombo, todayDateRange, todayDateString } from './datetime';
import { AppError } from '../middleware/errorHandler';

export type CashierListDateFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  scheduledAtFrom?: Date;
  scheduledAtTo?: Date;
  /** When set, replaces the default status filter for live-scope queries. */
  liveStatusFilter?: { in: string[] };
};

export function resolveCashierListDateFilters(
  role: string | undefined,
  statusFilter: string | undefined,
  query: Record<string, unknown>,
  incoming: {
    dateFrom?: Date;
    dateTo?: Date;
    scheduledAtFrom?: Date;
    scheduledAtTo?: Date;
  },
): CashierListDateFilters {
  if (role !== 'CASHIER') {
    return incoming;
  }

  const liveScope = query.liveScope === '1' || query.liveScope === 1;
  if (liveScope) {
    return {
      liveStatusFilter: { in: ['IN_PROGRESS', 'RETURNING'] },
    };
  }

  const { from, to } = todayDateRange();

  if (statusFilter === 'COMPLETED') {
    return {
      dateFrom: from,
      dateTo: to,
    };
  }

  return {
    scheduledAtFrom: from,
    scheduledAtTo: to,
  };
}

export function assertCashierCanViewJob(
  role: string | undefined,
  job: { status: string; scheduledAt: Date; completedAt: Date | null },
): void {
  if (role !== 'CASHIER') return;

  const today = todayDateString();

  if (job.status === 'COMPLETED') {
    if (!job.completedAt || dateStringInColombo(job.completedAt) !== today) {
      throw new AppError('Job not found', 404);
    }
    return;
  }

  if (dateStringInColombo(job.scheduledAt) !== today) {
    throw new AppError('Job not found', 404);
  }
}
