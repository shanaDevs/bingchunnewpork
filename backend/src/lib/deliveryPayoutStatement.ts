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
  type DeliveryPayoutDbRow,
} from './deliveryPayoutService';
import { toUtcDateStr } from './deliveryPayoutMath';
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
