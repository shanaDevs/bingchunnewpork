import type { GenerateCommissionSettlementInvoiceInput, GenerateWithdrawalInvoiceInput } from './invoice/types';
import {
  buildInvoiceChannelSummary,
  buildInvoicePromoSummaryFromUsages,
  buildInvoiceSummaryRows,
  buildOnlineGrossCalculation,
  buildPage2PayoutSections,
  buildPayoutSettlementTableRows,
  buildPlatformSalesRows,
  parseInvoicePeriodBreakdown,
} from './invoice/dataBuilders';
import { formatSettlementPeriodLabel } from './invoice/format';
import { buildPayoutStatementFromBreakdown } from './invoice/payoutStatement';
import {
  enrichWithdrawalInvoiceInputFromWithdrawal,
  parseCommissionSettlementInvoiceInput,
  parseWithdrawalInvoiceInput,
} from './invoice/parsing';
import { renderCommissionSettlementInvoiceToBuffer } from './invoice/renderCommissionSettlementInvoice';
import { renderWithdrawalInvoiceToBuffer } from './invoice/renderWithdrawalInvoice';
import {
  commissionSettlementInvoiceApiPath,
  commissionSettlementInvoiceRef,
  withdrawalInvoiceApiPath,
  withdrawalInvoicePublicPath,
  withdrawalInvoiceRef,
} from './invoice/refs';

export {
  buildInvoiceChannelSummary,
  buildInvoicePromoSummaryFromUsages,
  buildInvoiceSummaryRows,
  buildOnlineGrossCalculation,
  buildPage2PayoutSections,
  buildPayoutSettlementTableRows,
  buildPlatformSalesRows,
  buildPayoutStatementFromBreakdown,
  commissionSettlementInvoiceApiPath,
  commissionSettlementInvoiceRef,
  formatSettlementPeriodLabel,
  enrichWithdrawalInvoiceInputFromWithdrawal,
  parseCommissionSettlementInvoiceInput,
  parseInvoicePeriodBreakdown,
  parseWithdrawalInvoiceInput,
  renderCommissionSettlementInvoiceToBuffer,
  renderWithdrawalInvoiceToBuffer,
  withdrawalInvoiceApiPath,
  withdrawalInvoicePublicPath,
  withdrawalInvoiceRef,
};

export type {
  GenerateCommissionSettlementInvoiceInput,
  GenerateWithdrawalInvoiceInput,
  InvoiceChannelRow,
  InvoiceChannelSummary,
  InvoicePayoutStatement,
  InvoicePeriodBreakdown,
  InvoicePromoLine,
  InvoicePromoSummary,
  PromoUsageInvoiceRow,
  WithdrawalTableRow,
} from './invoice/types';

export async function generateWithdrawalInvoice(
  input: GenerateWithdrawalInvoiceInput,
): Promise<{ invoiceRef: string; invoiceUrl: string; invoiceData: GenerateWithdrawalInvoiceInput }> {
  const invoiceRef = withdrawalInvoiceRef(input.withdrawalId);
  return {
    invoiceRef,
    invoiceUrl: withdrawalInvoiceApiPath(input.withdrawalId),
    invoiceData: input,
  };
}

/** Commission settlement invoice (branch pays DartCodes). */
export async function generateCommissionSettlementInvoice(
  input: GenerateCommissionSettlementInvoiceInput,
): Promise<{
  invoiceRef: string;
  invoiceUrl: string;
  invoiceData: GenerateCommissionSettlementInvoiceInput;
}> {
  const invoiceRef = commissionSettlementInvoiceRef(input.settlementId);
  return {
    invoiceRef,
    invoiceUrl: commissionSettlementInvoiceApiPath(input.settlementId),
    invoiceData: input,
  };
}
