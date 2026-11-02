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

/** Open before any await so the click still counts as the user gesture. */
function openBlankTab(): Window | null {
  return window.open('about:blank', '_blank');
}

function contentTypeOf(res: Response): string {
  return (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Blob type for a protected file. PDFs (and responses with no useful type) stay
 * application/pdf so Chrome can draw them. Images keep their own type.
 * JSON and HTML are error pages, not files.
 */
function protectedFileBlobType(contentType: string): string | null {
  if (!contentType || contentType === 'application/octet-stream' || contentType === 'application/pdf') {
    return 'application/pdf';
  }
  if (contentType.startsWith('image/')) return contentType;
  return null;
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
 * Fetch an admin-protected file and show it in a tab.
 * Navigating to the API URL puts the PDF under object-src 'none', which makes
 * Chrome's viewer a black screen. A blob document is not covered by that policy.
 */
async function openProtectedApiPath(apiPath: string): Promise<void> {
  const popup = openBlankTab();
  try {
    await requireAdminSession();
    const res = await fetch(adminApiUrl(apiPath), withAdminCredentials());
    const blobType = protectedFileBlobType(contentTypeOf(res));
    if (!res.ok || !blobType) throw new Error('Could not load file');
    const file = new Blob([await res.blob()], { type: blobType });
    const url = URL.createObjectURL(file);
    if (popup) {
      popup.location.href = url;
      return;
    }
    openUrlInNewTab(url);
  } catch (err) {
    popup?.close();
    throw err;
  }
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

function isRemoteSettlementProofUrl(proofUrl: string): boolean {
  return /^https?:\/\//i.test(proofUrl) && /\/settlements\//i.test(proofUrl);
}

/**
 * Open a payout payment proof via authenticated admin routes (never a public CDN URL).
 */
export async function openPayoutProof(proofUrl: string | null | undefined): Promise<void> {
  if (!proofUrl) throw new Error('No payment proof available');
  if (isSpacesProtectedProofUrl(proofUrl) || isRemoteSettlementProofUrl(proofUrl)) {
    await openProtectedApiPath(`/admin/spaces-proof?url=${encodeURIComponent(proofUrl)}`);
    return;
  }
  if (/^https?:\/\//i.test(proofUrl)) {
    throw new Error('Payment proof is not available');
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

/** Fetch a short-lived signed URL for a commission settlement receipt and open it. */
export async function openCommissionSettlementReceipt(settlementId: string): Promise<void> {
  await requireAdminSession();
  const path = `/admin/payment-history/settlements/${encodeURIComponent(settlementId)}/receipt-url`;
  const res = await fetch(adminApiUrl(path), withAdminCredentials());
  if (!res.ok) throw new Error('Could not load payment receipt');
  const json = (await res.json()) as { data?: ProofAccessResponse };
  const data = json.data;
  if (!data?.url) throw new Error('No payment receipt available');
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
export async function openPlatformProviderSettlementInvoice(settlementId: string): Promise<void> {
  await openProtectedApiPath(
    `/admin/invoices/settlement/${encodeURIComponent(settlementId)}/platform-provider`,
  );
}

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
