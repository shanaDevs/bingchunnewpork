import { AppError } from '../middleware/errorHandler';
import { assertAllowedSettlementProof } from '../middleware/upload';
import { deleteFromSpaces, isSpacesConfigured, uploadSettlementProof } from './spaces';

/** Validate proof file + Spaces config without uploading (for fast request paths). */
export function assertSettlementProofFile(
  file: Express.Multer.File | undefined,
  missingMessage = 'Payment proof (slip/receipt) is required',
): Express.Multer.File {
  if (!file) {
    throw new AppError(missingMessage, 400);
  }
  if (!isSpacesConfigured()) {
    throw new AppError('Payment proof storage is not configured', 503);
  }
  assertAllowedSettlementProof(file);
  return file;
}

/**
 * Validate + upload a multer memory file as a settlement/payout proof to Spaces.
 * Callers should pass the returned URL into `withUploadedProofCleanup` around DB work.
 */
export async function requireSettlementProofUpload(
  file: Express.Multer.File | undefined,
  storeId: string,
  missingMessage = 'Payment proof (slip/receipt) is required',
): Promise<string> {
  const proof = assertSettlementProofFile(file, missingMessage);
  try {
    return await uploadSettlementProof(
      proof.buffer,
      proof.originalname,
      proof.mimetype,
      storeId,
    );
  } catch (err) {
    throw new AppError(
      err instanceof Error ? err.message : 'Failed to upload payment proof',
      500,
    );
  }
}

/** Like `requireSettlementProofUpload`, but returns null when no file was sent. */
export async function optionalSettlementProofUpload(
  file: Express.Multer.File | undefined,
  storeId: string,
): Promise<string | null> {
  if (!file) return null;
  return requireSettlementProofUpload(file, storeId);
}

/** Run work that persists a proof URL; delete the Spaces object if the work fails. */
export async function withUploadedProofCleanup<T>(
  proofUrl: string | null,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (proofUrl) await deleteFromSpaces(proofUrl);
    throw err;
  }
}
