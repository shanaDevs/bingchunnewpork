import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildProofAccessResponse } from '../../src/lib/settlementProofAccess';
import * as spaces from '../../src/lib/spaces';

vi.mock('../../src/lib/spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/spaces')>();
  return {
    ...actual,
    createSignedProofAccessFromStoredUrl: vi.fn(),
  };
});

describe('buildProofAccessResponse', () => {
  beforeEach(() => {
    vi.mocked(spaces.createSignedProofAccessFromStoredUrl).mockReset();
  });

  it('returns presigned payload when Spaces resolves the URL', async () => {
    vi.mocked(spaces.createSignedProofAccessFromStoredUrl).mockResolvedValue({
      url: 'https://signed.example/slip',
      expiresAt: '2026-01-01T00:10:00.000Z',
    });
    const result = await buildProofAccessResponse('https://bucket.sgp1.digitaloceanspaces.com/x');
    expect(result.url).toBe('https://signed.example/slip');
  });

  it('returns legacy local path when not an http URL', async () => {
    vi.mocked(spaces.createSignedProofAccessFromStoredUrl).mockResolvedValue(null);
    const result = await buildProofAccessResponse('/settlements/store-a/slip.png');
    expect(result).toEqual({
      url: '/settlements/store-a/slip.png',
      expiresAt: null,
      legacyLocal: true,
    });
  });

  it('throws when no proof is stored', async () => {
    await expect(buildProofAccessResponse(null)).rejects.toMatchObject({ statusCode: 404 });
  });
});
