import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { success } from '../utils/apiResponse';
import {
  emptyDeliveryWalletSummary,
  getDeliveryWalletSummary,
  maxDeliveryWalletRangeDays,
} from '../lib/deliveryWalletService';
import { DATE_RE, DELIVERY_PAYOUT_PERIOD_DAYS, daysInclusive } from '../lib/deliveryPayoutMath';
import {
  approveDeliveryPayout,
  attachDeliveryPayoutProof,
  cancelDeliveryPayout,
  createDeliveryPayout,
  getDeliveryPayoutById,
  getDeliveryPayoutPreview,
  getLiveDeliveryWalletRange,
  listDeliveryPayouts,
  listDeliveryPayoutsDue,
  payDeliveryPayout,
  rejectDeliveryPayout,
} from '../lib/deliveryPayoutService';
import { buildProofAccessResponse } from '../lib/settlementProofAccess';
import {
  logDeliveryPayoutAuditFromRequest,
  logPinGatedDeniedIf401,
  logWalletSecurityEventFromRequest,
} from '../lib/walletSecurityAudit';
import { verifyAdminPin } from '../lib/verifyAdminPin';
import {
  requireSystemAdminFromRequest,
  signDeliveryWalletUnlockToken,
} from '../lib/deliveryWalletUnlock';
import {
  optionalSettlementProofUpload,
  requireSettlementProofUpload,
  withUploadedProofCleanup,
} from '../lib/settlementProofUpload';
import { parseSettlementCheckDate } from '../lib/walletControllerSupport';
import {
  renderDeliveryPayoutStatementForId,
  renderDeliveryPayoutStatementZip,
} from '../lib/deliveryPayoutStatement';

const deliveryPayoutStatementZipSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(40),
});

function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sendAttachment(res: Response, buffer: Buffer, contentType: string, filename: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', attachmentDisposition(filename));
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

const rangeSchema = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  periodDays: z.coerce.number().int().optional(),
  scope: z.enum(['all']).optional(),
});

const rejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const unlockSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

const adminPinField = z.string().min(1, 'PIN is required');

const payoutCreateSchema = z.object({
  periodDays: z.coerce.number().int(),
  remarks: z.string().max(500).optional(),
  password: adminPinField,
});

const approveDeliveryPayoutBodySchema = z.object({
  password: adminPinField,
});

const payDeliveryPayoutBodySchema = z
  .object({
    periodFrom: z.string().regex(DATE_RE),
    paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'CHECK']),
    checkNumber: z.string().max(64).optional(),
    checkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    remarks: z.string().max(500).optional(),
    password: adminPinField,
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod !== 'CHECK') return;
    if (!data.checkNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Check number is required',
        path: ['checkNumber'],
      });
    }
    if (!data.checkDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Check date is required',
        path: ['checkDate'],
      });
    }
  });

function isPayDeliveryPayoutBody(body: Record<string, unknown>): boolean {
  return body.periodFrom != null || body.paymentMethod != null || body.password != null;
}

export async function unlockDeliveryWalletHandler(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  try {
    const { password } = unlockSchema.parse(req.body ?? {});
    const adminId = req.user?.sub;
    await verifyAdminPin(adminId, password);
    const token = signDeliveryWalletUnlockToken(adminId!);
    logWalletSecurityEventFromRequest(req, user, { event: 'delivery.wallet.unlock' });
    return success(res, { unlocked: true, token });
  } catch (err) {
    logPinGatedDeniedIf401(req, user, 'delivery.wallet.unlock', err);
    next(err);
  }
}

export async function getDeliveryWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, scope } = rangeSchema.parse(req.query);
    if (from && to && from > to) {
      throw new AppError('Start date must be on or before end date', 400);
    }
    if (from && to && daysInclusive(from, to) > maxDeliveryWalletRangeDays()) {
      throw new AppError(`Date range cannot exceed ${maxDeliveryWalletRangeDays()} days`, 400);
    }

    if (from && to) {
      const data = await getDeliveryWalletSummary(from, to);
      return success(res, data);
    }

    if (scope === 'all') {
      if (req.user?.role !== 'SYSTEM_ADMIN') {
        throw new AppError('All-time delivery wallet is restricted to super admins', 403);
      }
      const data = await getDeliveryWalletSummary();
      return success(res, data);
    }

    const live = await getLiveDeliveryWalletRange();
    if (!live) {
      return success(res, emptyDeliveryWalletSummary());
    }
    const data = await getDeliveryWalletSummary(live.from, live.to);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryPayoutPreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, periodDays } = rangeSchema.parse(req.query);
    const data = await getDeliveryPayoutPreview(from, to, periodDays);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}

export async function listDeliveryPayoutsDueHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await requireSystemAdminFromRequest(req);
    const items = await listDeliveryPayoutsDue();
    return success(res, items);
  } catch (err) {
    next(err);
  }
}

export async function listDeliveryPayoutsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
    const result = await listDeliveryPayouts({
      page,
      limit,
    });
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function downloadDeliveryPayoutStatementZipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = deliveryPayoutStatementZipSchema.parse(req.body ?? {});
    const zip = await renderDeliveryPayoutStatementZip(body.ids);
    const stamp = new Date().toISOString().slice(0, 10);
    sendAttachment(res, zip, 'application/zip', `delivery-payouts-${stamp}.zip`);
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryPayoutStatementHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const file = await renderDeliveryPayoutStatementForId(id);
    sendAttachment(res, file.buffer, 'application/pdf', file.filename);
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryPayoutProofUrlHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await requireSystemAdminFromRequest(req);
    const id = String(req.params.id);
    const payout = await getDeliveryPayoutById(id);
    if (!payout) throw new AppError('Payout not found', 404);
    const access = await buildProofAccessResponse(payout.proofUrl ?? null);
    return success(res, access);
  } catch (err) {
    next(err);
  }
}

export async function createDeliveryPayoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await requireSystemAdminFromRequest(req);

    const body = payoutCreateSchema.parse(req.body ?? {});
    await verifyAdminPin(user.sub, body.password);
    if (!(DELIVERY_PAYOUT_PERIOD_DAYS as readonly number[]).includes(body.periodDays)) {
      throw new AppError(
        `Invalid payout period. Choose one of: ${DELIVERY_PAYOUT_PERIOD_DAYS.join(', ')} days`,
        400,
      );
    }

    const proofUrl = await optionalSettlementProofUpload(req.file, 'delivery');

    const payout = await withUploadedProofCleanup(proofUrl, () =>
      createDeliveryPayout({
        periodDays: body.periodDays,
        remarks: body.remarks,
        requestedById: user.sub!,
        proofUrl,
      }),
    );
    logDeliveryPayoutAuditFromRequest(req, user, 'delivery.payout.create', payout);
    return success(res, payout, 201);
  } catch (err) {
    next(err);
  }
}

export function attachDeliveryPayoutUploadFolder(req: Request, _res: Response, next: NextFunction) {
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  req.body.storeId = 'delivery';
  next();
}

/** POST /delivery-wallet/payouts — pay due period (PIN + payment method) or legacy create by periodDays. */
export async function postDeliveryPayoutHandler(req: Request, res: Response, next: NextFunction) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (isPayDeliveryPayoutBody(body)) {
    return payDeliveryPayoutHandler(req, res, next);
  }
  return createDeliveryPayoutHandler(req, res, next);
}

export async function payDeliveryPayoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await requireSystemAdminFromRequest(req);

    const data = payDeliveryPayoutBodySchema.parse(req.body ?? {});
    await verifyAdminPin(user.sub, data.password);

    const proofUrl = await requireSettlementProofUpload(
      req.file,
      'delivery',
      'Payment proof (slip/receipt) is required',
    );

    const checkDate = parseSettlementCheckDate(data.paymentMethod, data.checkDate);

    const payout = await withUploadedProofCleanup(proofUrl, () =>
      payDeliveryPayout({
        periodFrom: data.periodFrom,
        paymentMethod: data.paymentMethod,
        proofUrl,
        adminId: user.sub!,
        remarks: data.remarks,
        checkNumber: data.paymentMethod === 'CHECK' ? data.checkNumber?.trim() : null,
        checkDate,
      }),
    );

    logDeliveryPayoutAuditFromRequest(req, user, 'delivery.payout.pay', payout);

    return success(res, payout, 201);
  } catch (err) {
    next(err);
  }
}

export async function approveDeliveryPayoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await requireSystemAdminFromRequest(req);

    const pin = approveDeliveryPayoutBodySchema.parse(req.body ?? {});
    await verifyAdminPin(user.sub, pin.password);

    const proofUrl = await optionalSettlementProofUpload(req.file, 'delivery');

    const payout = await withUploadedProofCleanup(proofUrl, () =>
      approveDeliveryPayout({
        payoutId: req.params.id as string,
        reviewerId: user.sub!,
        proofUrl,
      }),
    );
    logDeliveryPayoutAuditFromRequest(req, user, 'delivery.payout.approve', payout);
    return success(res, payout);
  } catch (err) {
    next(err);
  }
}

export async function attachDeliveryPayoutProofHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await requireSystemAdminFromRequest(req);

    const proofUrl = await requireSettlementProofUpload(
      req.file,
      'delivery',
      'Payment proof (slip/receipt) is required',
    );

    const payout = await withUploadedProofCleanup(proofUrl, () =>
      attachDeliveryPayoutProof({
        payoutId: req.params.id as string,
        proofUrl,
      }),
    );
    logDeliveryPayoutAuditFromRequest(req, req.user!, 'delivery.payout.proof_attach', payout);
    return success(res, payout);
  } catch (err) {
    next(err);
  }
}

export async function rejectDeliveryPayoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await requireSystemAdminFromRequest(req);

    const body = rejectBodySchema.parse(req.body ?? {});
    const payout = await rejectDeliveryPayout({
      payoutId: req.params.id as string,
      reviewerId: user.sub!,
      reason: body.reason,
    });
    logDeliveryPayoutAuditFromRequest(req, user, 'delivery.payout.reject', payout, {
      reason: body.reason,
    });
    return success(res, payout);
  } catch (err) {
    next(err);
  }
}

export async function cancelDeliveryPayoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await requireSystemAdminFromRequest(req);
    const payout = await cancelDeliveryPayout({
      payoutId: req.params.id as string,
      requestedById: user.sub!,
    });
    logDeliveryPayoutAuditFromRequest(req, user, 'delivery.payout.cancel', payout);
    return success(res, payout);
  } catch (err) {
    next(err);
  }
}
