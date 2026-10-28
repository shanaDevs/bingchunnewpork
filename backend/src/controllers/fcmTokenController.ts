import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { ensureFcmTokenTable } from '../lib/fcmTokenSchema';
import { randomUUID } from 'crypto';

const tokenSchema = z.object({ token: z.string().min(1) });

export async function registerFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureFcmTokenTable();
    const userId = req.user!.sub;
    const { token } = tokenSchema.parse(req.body);

    await prisma.$executeRaw`
      INSERT INTO "customer_fcm_tokens" ("id", "userId", "token")
      VALUES (${randomUUID()}, ${userId}, ${token})
      ON CONFLICT ("token") DO UPDATE SET "userId" = EXCLUDED."userId"
    `;

    return success(res, { registered: true });
  } catch (err) {
    next(err);
  }
}

export async function unregisterFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureFcmTokenTable();
    const userId = req.user!.sub;
    const { token } = tokenSchema.parse(req.body);

    await prisma.$executeRaw`
      DELETE FROM "customer_fcm_tokens" WHERE "userId" = ${userId} AND "token" = ${token}
    `;

    return success(res, { unregistered: true });
  } catch (err) {
    next(err);
  }
}
