export function withdrawalInvoiceRef(withdrawalId: string): string {
  return `WD-INV-${withdrawalId.slice(0, 8).toUpperCase()}`;
}

export function commissionSettlementInvoiceRef(settlementId: string): string {
  return `CS-INV-${settlementId.slice(0, 8).toUpperCase()}`;
}

export function withdrawalInvoicePublicPath(storeId: string, filename: string): string {
  return `/invoices/${storeId}/${filename}`;
}

export function withdrawalInvoiceApiPath(withdrawalId: string): string {
  return `/api/admin/invoices/withdrawal/${withdrawalId}`;
}

export function commissionSettlementInvoiceApiPath(settlementId: string): string {
  return `/api/admin/invoices/settlement/${settlementId}`;
}
