import type PDFKit from 'pdfkit';
import type {
  GenerateCommissionSettlementInvoiceInput,
  GenerateWithdrawalInvoiceInput,
} from './types';
import { parsePayoutStatement } from './payoutStatement';

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value == null) return value === null ? null : undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

/** Rehydrate stored JSON into withdrawal invoice input (dates restored). */
export function parseWithdrawalInvoiceInput(data: unknown): GenerateWithdrawalInvoiceInput | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.storeId !== 'string' || typeof o.withdrawalId !== 'string') return null;

  return {
    ...(o as GenerateWithdrawalInvoiceInput),
    approvedAt: parseOptionalDate(o.approvedAt) ?? new Date(),
    checkDate: parseOptionalDate(o.checkDate) ?? null,
    periodFrom: parseOptionalDate(o.periodFrom) ?? null,
    periodTo: parseOptionalDate(o.periodTo) ?? null,
    netTransferableEarningsAsOf:
      parseOptionalDate(o.netTransferableEarningsAsOf) ?? new Date(),
    payoutStatement: parsePayoutStatement(o.payoutStatement),
  };
}

/** Rehydrate stored JSON into commission settlement invoice input (dates restored). */
export function parseCommissionSettlementInvoiceInput(
  data: unknown,
): GenerateCommissionSettlementInvoiceInput | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.settlementId !== 'string' || typeof o.storeId !== 'string') return null;

  const periodFrom = parseOptionalDate(o.periodFrom);
  const periodTo = parseOptionalDate(o.periodTo);
  const settledAt = parseOptionalDate(o.settledAt);
  if (!periodFrom || !periodTo || !settledAt) return null;

  return {
    ...(o as GenerateCommissionSettlementInvoiceInput),
    periodFrom,
    periodTo,
    settledAt,
  };
}

export function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
