import { AppError } from '../middleware/errorHandler';
import { buildStoredZip } from './zipStore';
import type { DeliveryWalletSummary } from './deliveryWalletService';
import { getDeliveryWalletSummary } from './deliveryWalletService';
import {
  decimalFieldToLkrNumber,
  parseDecimalFromDb,
} from './moneyDecimal';
import {
  getDeliveryPayoutById,
  listDeliveryPayoutsDue,
  type DeliveryPayoutDbRow,
} from './deliveryPayoutService';
import { DATE_RE, toUtcDateStr } from './deliveryPayoutMath';
import { isDeliveryPayoutDueInReview } from './deliveryPayoutDueReview';
import {
  deliveryPayoutStatementDownloadFilename,
  deliveryPayoutStatementZipEntryPath,
} from './deliveryPayoutStatementNames';
import {
  renderDeliveryPayoutStatementToBuffer,
  type DeliveryPayoutStatementInput,
} from './invoice/renderDeliveryPayoutStatement';

export const DELIVERY_PAYOUT_STATEMENT_ZIP_MAX = 40;

function parseStoredSummary(breakdown: unknown): DeliveryWalletSummary | null {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const raw = breakdown as Partial<DeliveryWalletSummary>;
  if (typeof raw.netForDelivery !== 'number') return null;
  return raw as DeliveryWalletSummary;
}

export function mapPayoutStatusLabel(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'Paid';
    case 'PENDING':
      return 'Pending';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

async function resolveSummaryForPayout(row: DeliveryPayoutDbRow): Promise<DeliveryWalletSummary> {
  const stored = parseStoredSummary(row.breakdown);
  if (stored) return stored;
  const from = toUtcDateStr(row.periodFrom);
  const to = toUtcDateStr(row.periodTo);
  return getDeliveryWalletSummary(from, to);
}

export async function buildDeliveryPayoutStatementInput(
  row: DeliveryPayoutDbRow,
): Promise<DeliveryPayoutStatementInput> {
  const summary = await resolveSummaryForPayout(row);
  const amountLkr = decimalFieldToLkrNumber(parseDecimalFromDb(row.amount));
  return {
    payoutId: row.id,
    status: row.status,
    statusLabel: mapPayoutStatusLabel(row.status),
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    paidAt: row.createdAt,
    amountLkr: Number.isFinite(amountLkr) ? amountLkr : summary.netForDelivery,
    paymentMethod: row.paymentMethod ?? null,
    checkNumber: row.checkNumber ?? null,
    checkDate: row.checkDate ?? null,
    summary,
  };
}

export async function renderDeliveryPayoutStatementForId(payoutId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const row = await getDeliveryPayoutById(payoutId);
  if (!row) throw new AppError('Delivery payout not found', 404);
  const input = await buildDeliveryPayoutStatementInput(row);
  const buffer = await renderDeliveryPayoutStatementToBuffer(input);
  const filename = deliveryPayoutStatementDownloadFilename(
    toUtcDateStr(row.periodFrom),
    toUtcDateStr(row.periodTo),
  );
  return { buffer, filename };
}

export async function renderDeliveryPayoutStatementZip(ids: string[]): Promise<Buffer> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new AppError('No payout ids provided', 400);
  if (unique.length > DELIVERY_PAYOUT_STATEMENT_ZIP_MAX) {
    throw new AppError(`At most ${DELIVERY_PAYOUT_STATEMENT_ZIP_MAX} payouts per download`, 400);
  }

  const paths = new Set<string>();
  const files: Array<{ path: string; data: Buffer }> = [];

  for (const id of unique) {
    const row = await getDeliveryPayoutById(id);
    if (!row) throw new AppError('Delivery payout not found', 404);
    const input = await buildDeliveryPayoutStatementInput(row);
    const buffer = await renderDeliveryPayoutStatementToBuffer(input);
    const from = toUtcDateStr(row.periodFrom);
    const to = toUtcDateStr(row.periodTo);
    const path = deliveryPayoutStatementZipEntryPath(from, to, paths);
    files.push({ path, data: buffer });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return buildStoredZip(files);
}

function periodToDates(from: string, to: string): { periodFrom: Date; periodTo: Date } {
  return {
    periodFrom: new Date(`${from}T00:00:00.000Z`),
    periodTo: new Date(`${to}T23:59:59.999Z`),
  };
}

export async function renderDeliveryPayoutDueStatement(
  periodFrom: string,
  periodTo: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const from = periodFrom.slice(0, 10);
  const to = periodTo.slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new AppError('Invalid payout period', 400);
  }

  const due = await listDeliveryPayoutsDue();
  const dueRow = due.find((row) => row.periodFrom === from && row.periodTo === to);
  if (!dueRow) {
    throw new AppError('This delivery payout period is not in the due list', 404);
  }

  const inReview = await isDeliveryPayoutDueInReview(from, to);
  if (!inReview) {
    throw new AppError('Save as draft before downloading the payout statement', 400);
  }

  const summary = await getDeliveryWalletSummary(from, to);
  const dates = periodToDates(from, to);
  const input: DeliveryPayoutStatementInput = {
    payoutId: `due-${from}-${to}`,
    status: 'DUE',
    statusLabel: 'In review',
    periodFrom: dates.periodFrom,
    periodTo: dates.periodTo,
    paidAt: new Date(),
    amountLkr: summary.netForDelivery,
    paymentMethod: null,
    summary,
  };
  const buffer = await renderDeliveryPayoutStatementToBuffer(input);
  const filename = deliveryPayoutStatementDownloadFilename(from, to);
  return { buffer, filename };
}
