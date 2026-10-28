import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAdminProtectedFileUrl,
  openCommissionSettlementReceipt,
  openPayoutProof,
  openWithdrawalInvoice,
  resolveWithdrawalInvoiceApiPath,
} from './adminProtectedFile';

vi.mock('@/lib/adminSession', () => ({
  ensureAdminAccessToken: vi.fn(),
  getAdminToken: vi.fn(),
  withAdminCredentials: (init: RequestInit = {}) => ({ ...init, credentials: 'include' }),
}));

vi.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:4000/api',
}));

import { ensureAdminAccessToken, getAdminToken } from '@/lib/adminSession';

describe('resolveWithdrawalInvoiceApiPath', () => {
  it('maps API withdrawal invoice paths', () => {
    expect(resolveWithdrawalInvoiceApiPath('/api/admin/invoices/withdrawal/wd-abc123')).toBe(
      '/admin/invoices/withdrawal/wd-abc123',
    );
  });

  it('maps API settlement invoice paths', () => {
    expect(resolveWithdrawalInvoiceApiPath('/api/admin/invoices/settlement/set-xyz')).toBe(
      '/admin/invoices/settlement/set-xyz',
    );
  });

  it('maps legacy static invoice file paths', () => {
    expect(resolveWithdrawalInvoiceApiPath('/invoices/store-bing-chun/WD-INV-ABC.pdf')).toBe(
      '/admin/invoice-files/store-bing-chun/WD-INV-ABC.pdf',
    );
  });

  it('maps absolute API invoice URLs', () => {
    expect(
      resolveWithdrawalInvoiceApiPath(
        'http://localhost:4000/api/admin/invoices/withdrawal/wd-abc123',
      ),
    ).toBe('/admin/invoices/withdrawal/wd-abc123');
  });

  it('maps absolute legacy invoice file URLs', () => {
    expect(
      resolveWithdrawalInvoiceApiPath(
        'https://bing-chung-b.mp.dartcodes.com/invoices/store-bing-chun/WD-INV-ABC.pdf',
      ),
    ).toBe('/admin/invoice-files/store-bing-chun/WD-INV-ABC.pdf');
  });

  it('maps admin invoice paths without /api prefix', () => {
    expect(resolveWithdrawalInvoiceApiPath('/admin/invoices/withdrawal/wd-abc123')).toBe(
      '/admin/invoices/withdrawal/wd-abc123',
    );
  });

  it('returns null for public CDN URLs', () => {
    expect(resolveWithdrawalInvoiceApiPath('https://cdn.example.com/invoices/file.pdf')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveWithdrawalInvoiceApiPath(null)).toBeNull();
    expect(resolveWithdrawalInvoiceApiPath('')).toBeNull();
  });
});

describe('fetchAdminProtectedFileUrl', () => {
  beforeEach(() => {
    vi.mocked(ensureAdminAccessToken).mockResolvedValue(true);
    vi.mocked(getAdminToken).mockReturnValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
      }),
    );
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:http://localhost/protected-file'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('fetches with cookie credentials and does not require a localStorage JWT', async () => {
    const url = await fetchAdminProtectedFileUrl('/admin/invoices/withdrawal/wd-1');

    expect(ensureAdminAccessToken).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/invoices/withdrawal/wd-1',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(url).toBe('blob:http://localhost/protected-file');
  });

  it('throws when the admin session cannot be refreshed', async () => {
    vi.mocked(ensureAdminAccessToken).mockResolvedValue(false);
    await expect(fetchAdminProtectedFileUrl('/admin/invoices/withdrawal/wd-1')).rejects.toThrow(
      'Session expired',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('openWithdrawalInvoice', () => {
  const openSpy = vi.fn();
  const popup = { location: { href: '' }, close: vi.fn() };

  function stubPdfFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'application/pdf' : null) },
        blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
      }),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/invoice');
  }

  beforeEach(() => {
    vi.mocked(ensureAdminAccessToken).mockResolvedValue(true);
    popup.location.href = '';
    popup.close.mockReset();
    openSpy.mockReset();
    openSpy.mockReturnValue(popup);
    vi.stubGlobal('window', { open: openSpy });
    stubPdfFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches a protected invoice and opens it as a blob', async () => {
    await openWithdrawalInvoice('/api/admin/invoices/withdrawal/wd-abc123');

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/invoices/withdrawal/wd-abc123',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(popup.location.href).toBe('blob:http://localhost/invoice');
    expect(popup.close).not.toHaveBeenCalled();
  });

  it('maps absolute legacy invoice URLs onto the protected file route', async () => {
    await openWithdrawalInvoice(
      'https://bing-chung-b.mp.dartcodes.com/invoices/store-bing-chun/WD-INV-ABC.pdf',
    );

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/invoice-files/store-bing-chun/WD-INV-ABC.pdf',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(popup.location.href).toBe('blob:http://localhost/invoice');
  });

  it('closes the tab when the invoice response is not a file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => 'application/json' },
        blob: async () => new Blob(['{}'], { type: 'application/json' }),
      }),
    );

    await expect(
      openWithdrawalInvoice('/api/admin/invoices/withdrawal/wd-abc123'),
    ).rejects.toThrow('Could not load file');
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe('');
  });
});

describe('openPayoutProof', () => {
  const openSpy = vi.fn();
  const popup = { location: { href: '' }, close: vi.fn() };

  beforeEach(() => {
    vi.mocked(ensureAdminAccessToken).mockResolvedValue(true);
    popup.location.href = '';
    popup.close.mockReset();
    openSpy.mockReset();
    openSpy.mockReturnValue(popup);
    vi.stubGlobal('window', { open: openSpy });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null) },
        blob: async () => new Blob(['img'], { type: 'image/jpeg' }),
      }),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/proof');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes Spaces settlement URLs through the authenticated spaces-proof proxy', async () => {
    const proof =
      'https://bingchun.sgp1.digitaloceanspaces.com/bingchun/settlements/store-1/slip.pdf';
    await openPayoutProof(proof);

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:4000/api/admin/spaces-proof?url=${encodeURIComponent(proof)}`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(popup.location.href).toBe('blob:http://localhost/proof');
  });

  it('rejects bare http URLs that are not settlement proofs', async () => {
    await expect(openPayoutProof('https://cdn.example.com/other/file.pdf')).rejects.toThrow(
      'Payment proof is not available',
    );
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('openCommissionSettlementReceipt', () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    vi.mocked(ensureAdminAccessToken).mockResolvedValue(true);
    openSpy.mockReset();
    vi.stubGlobal('window', { open: openSpy });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { url: 'https://signed.example/receipt.pdf', expiresAt: '2026-10-09T09:00:00.000Z' },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('fetches receipt-url and opens the presigned link', async () => {
    await openCommissionSettlementReceipt('settlement-uuid-1');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/payment-history/settlements/settlement-uuid-1/receipt-url',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(openSpy).toHaveBeenCalledWith(
      'https://signed.example/receipt.pdf',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
