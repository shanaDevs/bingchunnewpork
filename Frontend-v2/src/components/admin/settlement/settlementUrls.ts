import { getApiBaseUrl } from '@/lib/apiBase';

import type { SettlementStatement } from './settlementModels';

export function settlementApiBase(): string {
  const api = getApiBaseUrl();
  return api.replace(/\/api\/?$/, '');
}

export function settlementReceiptHref(receiptUrl: string | null | undefined): string | null {
  if (!receiptUrl) return null;
  if (receiptUrl.startsWith('http')) return receiptUrl;
  if (receiptUrl.startsWith('/settlements/')) return null;
  return `${settlementApiBase()}${receiptUrl}`;
}

export function hasProtectedSettlementReceipt(receiptUrl: string | null | undefined): boolean {
  return Boolean(receiptUrl?.startsWith('/settlements/'));
}

export function settlementReceiptIsPdf(href: string): boolean {
  try {
    const pathname = new URL(href, 'http://local').pathname;
    return pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return href.split('?')[0].toLowerCase().endsWith('.pdf');
  }
}

export function isProtectedWithdrawalInvoice(invoiceUrl: string | null | undefined): boolean {
  if (!invoiceUrl) return false;
  if (invoiceUrl.startsWith('/invoices/')) return true;
  if (invoiceUrl.startsWith('/api/admin/invoices/')) return true;
  if (/^https?:\/\//i.test(invoiceUrl)) {
    try {
      const pathname = new URL(invoiceUrl).pathname;
      return pathname.includes('/admin/invoices/');
    } catch {
      return false;
    }
  }
  return false;
}

export function hasWithdrawalInvoice(invoiceUrl: string | null | undefined): boolean {
  return Boolean(invoiceUrl?.trim());
}

export function withdrawalInvoiceHref(invoiceUrl: string | null | undefined): string | null {
  if (!invoiceUrl || isProtectedWithdrawalInvoice(invoiceUrl)) return null;
  return settlementReceiptHref(invoiceUrl);
}

export function settlementStatusLabel(status: SettlementStatement['status']): string {
  switch (status) {
    case 'VERIFIED':
      return 'Settled';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Pending';
  }
}