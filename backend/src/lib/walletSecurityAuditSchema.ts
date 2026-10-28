import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from './prisma';
import { createIndexIfMissing, tableExists } from './schemaPatch';

export const walletSecurityAuditListQuerySchema = z.object({
  storeId: z.string().optional(),
  event: z.string().optional(),
  outcome: z.enum(['success', 'denied']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export type WalletSecurityAuditListQuery = z.infer<typeof walletSecurityAuditListQuerySchema>;

function parseOptionalDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const parsed = endOfDay ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseWalletSecurityAuditListQuery(query: unknown): {
  filters: Omit<WalletSecurityAuditListQuery, 'page' | 'limit' | 'from' | 'to'> & {
    from?: Date;
    to?: Date;
  };
  page: number;
  limit: number;
} {
  const parsed = walletSecurityAuditListQuerySchema.parse(query);
  const { page, limit, from, to, ...rest } = parsed;
  return {
    page,
    limit,
    filters: {
      ...rest,
      from: parseOptionalDate(from),
      to: parseOptionalDate(to, true),
    },
  };
}

let walletSecurityAuditReady = false;

export async function ensureWalletSecurityAuditLogTable(): Promise<void> {
  if (walletSecurityAuditReady) return;

  if (!(await tableExists('wallet_security_audit_logs'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "wallet_security_audit_logs" (
        "id" TEXT NOT NULL,
        "event" TEXT NOT NULL,
        "outcome" TEXT NOT NULL,
        "actorId" TEXT NULL,
        "actorRole" TEXT NULL,
        "storeId" TEXT NULL,
        "amountCents" INTEGER NULL,
        "reference" TEXT NULL,
        "withdrawalId" TEXT NULL,
        "transactionId" TEXT NULL,
        "payoutId" TEXT NULL,
        "clientIp" TEXT NULL,
        "reason" TEXT NULL,
        "orderNumber" TEXT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "wallet_security_audit_logs_pkey" PRIMARY KEY ("id")
      )
    `);
  }

  await createIndexIfMissing(
    'wallet_security_audit_logs',
    'wallet_security_audit_logs_createdAt_idx',
    'createdAt',
  );
  await createIndexIfMissing(
    'wallet_security_audit_logs',
    'wallet_security_audit_logs_event_createdAt_idx',
    'event, createdAt',
  );
  await createIndexIfMissing(
    'wallet_security_audit_logs',
    'wallet_security_audit_logs_storeId_createdAt_idx',
    'storeId, createdAt',
  );

  walletSecurityAuditReady = true;
}

export type WalletSecurityAuditRow = {
  id: string;
  event: string;
  outcome: string;
  actorId: string | null;
  actorRole: string | null;
  storeId: string | null;
  amountCents: number | null;
  reference: string | null;
  withdrawalId: string | null;
  transactionId: string | null;
  payoutId: string | null;
  clientIp: string | null;
  reason: string | null;
  orderNumber: string | null;
  createdAt: Date;
};

export async function listWalletSecurityAuditLogs(params: {
  storeId?: string;
  event?: string;
  outcome?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
  /** When set, only rows whose event starts with one of these prefixes (e.g. delivery., wallet.). */
  eventPrefixes?: string[];
}): Promise<{ rows: WalletSecurityAuditRow[]; total: number }> {
  await ensureWalletSecurityAuditLogTable();
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;

  if (params.storeId) {
    conditions.push(`"storeId" = $${idx++}`);
    values.push(params.storeId);
  }
  if (params.event) {
    conditions.push(`"event" = $${idx++}`);
    values.push(params.event);
  } else if (params.eventPrefixes?.length) {
    const prefixClauses = params.eventPrefixes.map((prefix) => {
      values.push(`${prefix}%`);
      return `"event" LIKE $${idx++}`;
    });
    conditions.push(`(${prefixClauses.join(' OR ')})`);
  }
  if (params.outcome) {
    conditions.push(`"outcome" = $${idx++}`);
    values.push(params.outcome);
  }
  if (params.from) {
    conditions.push(`"createdAt" >= $${idx++}`);
    values.push(params.from);
  }
  if (params.to) {
    conditions.push(`"createdAt" <= $${idx++}`);
    values.push(params.to);
  }

  const where = conditions.join(' AND ');
  const skip = (params.page - 1) * params.limit;

  const countRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "wallet_security_audit_logs" WHERE ${where}`,
    ...values,
  );
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await prisma.$queryRawUnsafe<WalletSecurityAuditRow[]>(
    `SELECT * FROM "wallet_security_audit_logs" WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${idx++} OFFSET $${idx++}`,
    ...values,
    params.limit,
    skip,
  );

  return { rows, total };
}

export async function insertWalletSecurityAuditRow(
  row: Omit<WalletSecurityAuditRow, 'id' | 'createdAt'> & { id?: string },
): Promise<void> {
  await ensureWalletSecurityAuditLogTable();
  const id = row.id ?? randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "wallet_security_audit_logs" (
      "id", "event", "outcome", "actorId", "actorRole", "storeId", "amountCents",
      "reference", "withdrawalId", "transactionId", "payoutId", "clientIp", "reason", "orderNumber"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    id,
    row.event,
    row.outcome,
    row.actorId,
    row.actorRole,
    row.storeId,
    row.amountCents,
    row.reference,
    row.withdrawalId,
    row.transactionId,
    row.payoutId,
    row.clientIp,
    row.reason,
    row.orderNumber,
  );
}
