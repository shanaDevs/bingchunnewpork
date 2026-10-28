import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { uuidParamSchema } from '../lib/httpSchemas';
import { AppError } from '../middleware/errorHandler';
import { assertOrderStoreAccess } from '../middleware/auth';
import {
  parseWithdrawalInvoiceInput,
  parseCommissionSettlementInvoiceInput,
  renderWithdrawalInvoiceToBuffer,
  renderCommissionSettlementInvoiceToBuffer,
  withdrawalInvoiceRef,
  commissionSettlementInvoiceRef,
} from '../lib/withdrawalInvoice';

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

/** GET /admin/invoices/withdrawal/:withdrawalId — generate PDF from stored invoiceData. */
export async function getWithdrawalInvoiceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const withdrawalId = uuidParamSchema.parse(req.params.withdrawalId);
    const withdrawal = await prisma.storeWithdrawal.findUnique({
      where: { id: withdrawalId },
      select: { id: true, storeId: true, invoiceRef: true, invoiceData: true },
    });

    if (!withdrawal) throw new AppError('Invoice not found', 404);
    await assertOrderStoreAccess(req, withdrawal.storeId);
    if (!withdrawal.invoiceData) throw new AppError('Invoice data not available', 404);

    const input = parseWithdrawalInvoiceInput(withdrawal.invoiceData);
    if (!input) throw new AppError('Invalid invoice data', 500);

    const buffer = await renderWithdrawalInvoiceToBuffer(input);
    const ref = withdrawal.invoiceRef ?? withdrawalInvoiceRef(withdrawal.id);
    sendPdf(res, buffer, `${ref}.pdf`);
  } catch (err) {
    next(err);
  }
}

/** GET /admin/invoices/settlement/:settlementId — generate PDF from stored invoiceData. */
export async function getSettlementInvoiceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settlementId = uuidParamSchema.parse(req.params.settlementId);
    const settlement = await prisma.commissionSettlement.findUnique({
      where: { id: settlementId },
      select: { id: true, storeId: true, invoiceRef: true, invoiceData: true },
    });

    if (!settlement) throw new AppError('Invoice not found', 404);
    await assertOrderStoreAccess(req, settlement.storeId);
    if (!settlement.invoiceData) throw new AppError('Invoice data not available', 404);

    const input = parseCommissionSettlementInvoiceInput(settlement.invoiceData);
    if (!input) throw new AppError('Invalid invoice data', 500);

    const buffer = await renderCommissionSettlementInvoiceToBuffer(input);
    const ref = settlement.invoiceRef ?? commissionSettlementInvoiceRef(settlement.id);
    sendPdf(res, buffer, `${ref}.pdf`);
  } catch (err) {
    next(err);
  }
}
