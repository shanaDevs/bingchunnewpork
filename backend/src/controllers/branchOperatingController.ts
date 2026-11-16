import { Request, Response, NextFunction } from 'express';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { requireBranchStoreId } from '../middleware/auth';
import { broadcastBranchOperating } from '../lib/socket';
import {
  fetchStoreBranchOperatingRow,
  updateStoreBranchClosedAt,
} from '../lib/storeOrderingSchema';

async function loadBranchStore(storeId: string) {
  const store = await fetchStoreBranchOperatingRow(storeId);
  if (!store || !store.isActive) throw new AppError('Store not found or inactive', 404);
  return store;
}

async function handleBranchOperatingRoute(
  req: Request,
  res: Response,
  next: NextFunction,
  run: (storeId: string) => Promise<Record<string, unknown>>,
) {
  try {
    const storeId = await requireBranchStoreId(req);
    await loadBranchStore(storeId);
    return success(res, await run(storeId));
  } catch (err) {
    next(err);
  }
}

export async function getBranchOperatingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await requireBranchStoreId(req);
    const store = await loadBranchStore(storeId);
    return success(res, {
      branchClosedAt: store.branchClosedAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function closeBranch(req: Request, res: Response, next: NextFunction) {
  return handleBranchOperatingRoute(req, res, next, async (storeId) => {
    const closedAt = new Date();
    const branchClosedAt = await updateStoreBranchClosedAt(storeId, closedAt);
    const iso = branchClosedAt?.toISOString() ?? null;
    broadcastBranchOperating({ storeId, branchClosedAt: iso });
    return { branchClosedAt: iso };
  });
}

export async function openBranch(req: Request, res: Response, next: NextFunction) {
  return handleBranchOperatingRoute(req, res, next, async (storeId) => {
    await updateStoreBranchClosedAt(storeId, null);
    broadcastBranchOperating({ storeId, branchClosedAt: null });
    return { branchClosedAt: null };
  });
}
