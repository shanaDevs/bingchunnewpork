import { AppError } from '../middleware/errorHandler';
import { createSignedProofAccessFromStoredUrl } from './spaces';

export type ProofAccessPayload =
  | { url: string; expiresAt: string }
  | { url: string; expiresAt: null; legacyLocal: true };

/** Resolve a stored proof reference to a short-lived signed URL or legacy admin path. */
export async function buildProofAccessResponse(
  storedProofUrl: string | null | undefined,
): Promise<ProofAccessPayload> {
  if (!storedProofUrl?.trim()) {
    throw new AppError('No payment proof on file', 404);
  }

  const signed = await createSignedProofAccessFromStoredUrl(storedProofUrl);
  if (signed) return signed;

  if (!/^https?:\/\//i.test(storedProofUrl)) {
    return { url: storedProofUrl, expiresAt: null, legacyLocal: true };
  }

  throw new AppError('Payment proof is not available', 404);
}
