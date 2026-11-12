import { getApiBaseUrl } from '@/lib/apiBase';
import { ensureAdminAccessToken, withAdminCredentials } from '@/lib/adminSession';

const API_ADMIN_INVOICE_PATH = /^\/api(\/admin\/invoices\/[^?#]+)/;
const ADMIN_INVOICE_PATH = /^(\/admin\/invoices\/[^?#]+)/;

function legacyProtectedFileApiPath(
  url: string | null | undefined,
  legacySegment: string,
  adminRouteSegment: string,
): string | null {
  if (!url) return null;
  const match = url.match(new RegExp(`^\\/${legacySegment}\\/([^/]+)\\/([^/?#]+)`));
  if (!match) return null;
  return `/${adminRouteSegment}/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
}

/** Map legacy `/settlements/:storeId/:file` paths to authenticated admin API routes. */
export function protectedSettlementReceiptApiPath(receiptUrl: string | null | undefined): string | null {
  return legacyProtectedFileApiPath(receiptUrl, 'settlements', 'admin/settlement-receipts');
}

export function protectedInvoiceFileApiPath(invoiceUrl: string | null | undefined): string | null {
  return legacyProtectedFileApiPath(invoiceUrl, 'invoices', 'admin/invoice-files');
}

function resolveAdminInvoiceApiPath(path: string): string | null {
  const apiMatch = path.match(API_ADMIN_INVOICE_PATH);
  if (apiMatch) return apiMatch[1];
  const adminMatch = path.match(ADMIN_INVOICE_PATH);
  if (adminMatch) return adminMatch[1];
  return protectedInvoiceFileApiPath(path);
}

function openUrlInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function normalizeAdminApiPath(apiPath: string): string {
  return apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
}

function adminApiUrl(apiPath: string): string {
  return `${getApiBaseUrl()}${normalizeAdminApiPath(apiPath)}`;
}

async function requireAdminSession(): Promise<void> {
  const ok = await ensureAdminAccessToken();
  if (!ok) throw new Error('Session expired');
}

/** Fetch an admin-protected file and return a blob URL for display/download. */
export async function fetchAdminProtectedFileUrl(apiPath: string): Promise<string> {
  await requireAdminSession();
  const res = await fetch(adminApiUrl(apiPath), withAdminCredentials());
  if (!res.ok) throw new Error('Could not load file');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Open an admin-protected file in a new tab.
 * Prefer same-origin navigation so httpOnly session cookies are sent (works behind /api proxy in production).
 */
async function openProtectedApiPath(apiPath: string): Promise<void> {
  await requireAdminSession();
  openUrlInNewTab(adminApiUrl(apiPath));
}

export async function openAdminProtectedFile(receiptUrl: string | null | undefined): Promise<void> {
  const apiPath = protectedSettlementReceiptApiPath(receiptUrl);
  if (!apiPath) throw new Error('Invalid file path');
  await openProtectedApiPath(apiPath);
}

function isSpacesProtectedProofUrl(proofUrl: string): boolean {
  return (
    /^https?:\/\//i.test(proofUrl) &&
    /digitaloceanspaces\.com/i.test(proofUrl) &&
    /\/(settlements|drivers\/license)\//i.test(proofUrl)
  );
}

/**
 * Open a payout payment proof:
 * - Absolute http(s) URLs (e.g. Spaces CDN) open directly
 * - Legacy `/settlements/...` paths use the authenticated admin API
 */
export async function openPayoutProof(proofUrl: string | null | undefined): Promise<void> {
  if (!proofUrl) throw new Error('No payment proof available');
  if (isSpacesProtectedProofUrl(proofUrl)) {
    await openProtectedApiPath(`/admin/spaces-proof?url=${encodeURIComponent(proofUrl)}`);
    return;
  }
  if (/^https?:\/\//i.test(proofUrl)) {
    openUrlInNewTab(proofUrl);
    return;
  }
  await openAdminProtectedFile(proofUrl);
}

export type PayoutProofKind = 'withdrawal' | 'deliveryPayout';

type ProofAccessResponse = {
  url: string;
  expiresAt?: string | null;
  legacyLocal?: boolean;
};

/** Fetch a short-lived signed URL (or legacy path) and open the payout proof. */
export async function openPayoutProofById(
  kind: PayoutProofKind,
  id: string,
  opts?: { storeId?: string },
): Promise<void> {
  await requireAdminSession();
  const path =
    kind === 'withdrawal'
      ? `/admin/wallet/withdrawals/${encodeURIComponent(id)}/proof-url`
      : `/admin/delivery-wallet/payouts/${encodeURIComponent(id)}/proof-url`;
  const qs = opts?.storeId ? `?storeId=${encodeURIComponent(opts.storeId)}` : '';
  const res = await fetch(adminApiUrl(`${path}${qs}`), withAdminCredentials());
  if (!res.ok) throw new Error('Could not load payment proof');
  const json = (await res.json()) as { data?: ProofAccessResponse };
  const data = json.data;
  if (!data?.url) throw new Error('No payment proof available');
  if (data.legacyLocal) {
    await openAdminProtectedFile(data.url);
    return;
  }
  openUrlInNewTab(data.url);
}

/** Normalize stored invoice URLs into fetchable admin API paths. */
export function resolveWithdrawalInvoiceApiPath(invoiceUrl: string | null | undefined): string | null {
  if (!invoiceUrl) return null;

  if (/^https?:\/\//i.test(invoiceUrl)) {
    try {
      return resolveAdminInvoiceApiPath(new URL(invoiceUrl).pathname);
    } catch {
      return null;
    }
  }

  return resolveAdminInvoiceApiPath(invoiceUrl);
}

/**
 * Open a withdrawal or settlement invoice:
 * - Public absolute http(s) URLs open directly
 * - API-generated and legacy static invoice paths use the authenticated admin API
 */
export async function openWithdrawalInvoice(invoiceUrl: string | null | undefined): Promise<void> {
  if (!invoiceUrl) throw new Error('No invoice available');

  const apiPath = resolveWithdrawalInvoiceApiPath(invoiceUrl);
  if (apiPath) {
    await openProtectedApiPath(apiPath);
    return;
  }

  if (/^https?:\/\//i.test(invoiceUrl)) {
    openUrlInNewTab(invoiceUrl);
    return;
  }

  throw new Error('Invalid invoice path');
}
