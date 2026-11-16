/** Settlement id for the platform-provider invoice PDF on a payout history row. */
export function platformPayoutInvoiceSettlementId(row: {
  id: string;
  payoutSource?: 'commissionSettlement' | 'branchWithdrawal';
  platformReceivableSettlementId?: string;
  platformInvoiceUrl?: string;
}): string | null {
  const linked = row.platformReceivableSettlementId?.trim();
  if (linked) return linked;

  if (row.payoutSource === 'commissionSettlement') {
    return row.id;
  }

  const url = row.platformInvoiceUrl?.trim();
  if (url) {
    const match = url.match(/\/settlement\/([^/?#]+)\/platform-provider/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  return null;
}

/** Api id for platform receivable breakdown (matches invoice settlement resolution). */
export function platformPayoutBreakdownApiId(row: Parameters<typeof platformPayoutInvoiceSettlementId>[0]): string {
  return platformPayoutInvoiceSettlementId(row) ?? row.id;
}
