import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ensurePlatformEarningsSchema } from '../lib/platformEarningsSchema';
import {
  getMonthlyEarningsSummary,
  getMonthlyEarningsBreakdown,
  getSettlementPreview,
  settleMonth,
} from '../lib/platformEarningsService';
import {
  serializeMonthlyEarningsBreakdown,
  serializeMonthlyEarningsSummary,
  serializeSettledMonth,
  serializeSettlementPreview,
} from '../lib/platformEarningsApi';

const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'calendarMonth must be YYYY-MM');

const settleBodySchema = z.object({
  notes: z.string().max(2000).optional(),
});

export async function listMonthlyEarningsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensurePlatformEarningsSchema();
    const data = await getMonthlyEarningsSummary();
    res.json({ success: true, data: serializeMonthlyEarningsSummary(data) });
  } catch (err) {
    next(err);
  }
}

export async function getMonthlyEarningsDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensurePlatformEarningsSchema();
    const calendarMonth = yearMonthSchema.parse(req.params.yearMonth);
    const data = await getMonthlyEarningsBreakdown(calendarMonth);
    res.json({ success: true, data: serializeMonthlyEarningsBreakdown(data) });
  } catch (err) {
    next(err);
  }
}

export async function getSettlementPreviewHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensurePlatformEarningsSchema();
    const calendarMonth = yearMonthSchema.parse(req.params.yearMonth);
    const data = await getSettlementPreview(calendarMonth);
    res.json({ success: true, data: serializeSettlementPreview(data) });
  } catch (err) {
    next(err);
  }
}

export async function settleMonthlyEarningsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensurePlatformEarningsSchema();
    const calendarMonth = yearMonthSchema.parse(req.params.yearMonth);
    const body = settleBodySchema.parse(req.body ?? {});
    const adminId = req.user!.sub;
    const data = await settleMonth(calendarMonth, adminId, body.notes);
    res.json({ success: true, data: serializeSettledMonth(data) });
  } catch (err) {
    next(err);
  }
}
