import { initializeApp, cert, App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger';

let app: App | null = null;
let initialized = false;
let initAttempted = false;

function unwrapJsonEnv(value: string): string {
  let v = value.trim();
  if (!v) return '';

  if (v.charCodeAt(0) === 0xfeff) {
    v = v.slice(1).trim();
  }

  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    const inner = v.slice(1, -1).trim();
    if (inner.startsWith('{')) {
      v = inner;
    }
  }

  return v;
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function describeCredentialProblem(obj: Record<string, unknown>): string | null {
  const nestedProjectId =
    obj.project_info &&
    typeof obj.project_info === 'object' &&
    !Array.isArray(obj.project_info)
      ? (obj.project_info as Record<string, unknown>).project_id
      : undefined;

  if (nestedProjectId || Array.isArray(obj.client) || obj.configuration_version) {
    return (
      'FIREBASE_SERVICE_ACCOUNT_JSON looks like a client config (google-services.json / GoogleService-Info.plist JSON), ' +
      'not a service account. Firebase Admin needs a key with type "service_account", project_id, client_email, and private_key. ' +
      'In Firebase Console: Project settings → Service accounts → Generate new private key.'
    );
  }

  if (typeof obj.project_id !== 'string' || !obj.project_id) {
    return 'Firebase service account JSON must have a top-level string "project_id" (not nested under project_info).';
  }

  return null;
}

function loadServiceAccountFromFile(): { account: ServiceAccount } | { error: string } | null {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const candidates = [
    pathEnv,
    resolve(process.cwd(), 'firebase-service-account.json'),
    resolve(process.cwd(), 'src', 'firebase-service-account.json'),
    resolve(__dirname, '..', 'firebase-service-account.json'),
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) continue;
      const raw = readFileSync(filePath, 'utf8');
      const parsed = tryParseJsonObject(unwrapJsonEnv(raw));
      if (!parsed) return { error: `Could not parse Firebase service account file: ${filePath}` };
      const problem = describeCredentialProblem(parsed);
      if (problem) return { error: problem };
      logger.info(`Loaded Firebase service account from ${filePath}`);
      return { account: parsed as ServiceAccount };
    } catch (err) {
      return { error: `Failed reading Firebase service account file ${filePath}: ${String(err)}` };
    }
  }
  return null;
}

function parseServiceAccountFromEnv(): { account: ServiceAccount } | { error: string } | null {
  const fromFile = loadServiceAccountFromFile();
  if (fromFile) return fromFile;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const unwrapped = unwrapJsonEnv(raw);
    if (unwrapped) {
      let parsed = tryParseJsonObject(unwrapped);
      if (parsed) {
        const problem = describeCredentialProblem(parsed);
        if (problem) return { error: problem };
        return { account: parsed as ServiceAccount };
      }

      try {
        const decoded = Buffer.from(unwrapped, 'base64').toString('utf8');
        parsed = tryParseJsonObject(unwrapJsonEnv(decoded));
        if (parsed) {
          const problem = describeCredentialProblem(parsed);
          if (problem) return { error: problem };
          return { account: parsed as ServiceAccount };
        }
      } catch {
        /* not base64 */
      }

      try {
        const stringParsed = JSON.parse(unwrapped) as unknown;
        if (typeof stringParsed === 'string') {
          parsed = tryParseJsonObject(unwrapJsonEnv(stringParsed));
          if (parsed) {
            const problem = describeCredentialProblem(parsed);
            if (problem) return { error: problem };
            return { account: parsed as ServiceAccount };
          }
        }
      } catch {
        /* not double-encoded */
      }
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    return {
      account: {
        type: 'service_account',
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      } as ServiceAccount,
    };
  }

  return null;
}

function hasFirebaseEnvConfigured(): boolean {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (pathEnv && existsSync(pathEnv)) return true;
  if (existsSync(resolve(process.cwd(), 'firebase-service-account.json'))) return true;
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
      (process.env.FIREBASE_PROJECT_ID?.trim() &&
        process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
        process.env.FIREBASE_PRIVATE_KEY?.trim()),
  );
}

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (initAttempted) return false;
  initAttempted = true;

  if (!hasFirebaseEnvConfigured()) {
    logger.warn('Firebase not configured — push notifications disabled');
    return false;
  }

  const parsed = parseServiceAccountFromEnv();
  if (!parsed) {
    logger.error(
      'Failed to parse Firebase credentials. Use FIREBASE_SERVICE_ACCOUNT_JSON as a single-line JSON object, ' +
        'base64-encoded JSON, FIREBASE_SERVICE_ACCOUNT_PATH to a JSON file, or set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
    );
    return false;
  }
  if ('error' in parsed) {
    logger.error(parsed.error);
    return false;
  }

  try {
    app = initializeApp({
      credential: cert(parsed.account),
    });
    initialized = true;
    logger.info('Firebase Admin SDK initialized');
    return true;
  } catch (err) {
    logger.error('Failed to initialize Firebase Admin SDK', err);
    return false;
  }
}

function isStaleTokenError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered'
  );
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  sound: 'order_placed' | 'order_update' = 'order_update',
): Promise<'sent' | 'stale' | 'error'> {
  if (!ensureInitialized()) return 'error';

  const channelId = sound === 'order_placed' ? 'bing_chun_orders_placed' : 'bing_chun_orders_v2';

  try {
    await getMessaging(app!).send({
      token: fcmToken,
      notification: { title, body },
      data: { ...(data ?? {}), sound },
      android: {
        notification: {
          channelId,
          priority: 'high',
          sound,
        },
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            badge: 1,
            sound: sound === 'order_placed' ? 'order_placed.wav' : 'order_update.wav',
          },
        },
      },
    });
    return 'sent';
  } catch (err: unknown) {
    if (isStaleTokenError(err)) {
      logger.warn(`Stale FCM token removed: ${fcmToken.slice(0, 20)}…`);
      return 'stale';
    }
    logger.error('FCM send error', err);
    return 'error';
  }
}

/**
 * Data-only, high-priority message. The receiving app builds its own notification,
 * which guarantees the custom channel/sound even when the app process is dead.
 * Returns 'stale' when the token should be discarded.
 */
export async function sendDataMessage(
  fcmToken: string,
  data: Record<string, string>,
): Promise<'sent' | 'stale' | 'error'> {
  if (!ensureInitialized()) return 'error';

  try {
    await getMessaging(app!).send({
      token: fcmToken,
      data,
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { 'content-available': 1 } },
      },
    });
    return 'sent';
  } catch (err: unknown) {
    if (isStaleTokenError(err)) {
      logger.warn(`Stale FCM token: ${fcmToken.slice(0, 20)}…`);
      return 'stale';
    }
    logger.error('FCM data send error', err);
    return 'error';
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  sound: 'order_placed' | 'order_update' = 'order_update',
): Promise<{ tokensTargeted: number; tokensSent: number }> {
  if (!ensureInitialized()) return { tokensTargeted: 0, tokensSent: 0 };

  const { prisma } = await import('./prisma');
  const { ensureFcmTokenTable } = await import('./fcmTokenSchema');
  await ensureFcmTokenTable();

  const rows = await prisma.$queryRaw<Array<{ token: string }>>`
    SELECT "token" FROM "customer_fcm_tokens" WHERE "userId" = ${userId}
  `;

  if (!rows.length) return { tokensTargeted: 0, tokensSent: 0 };

  const staleTokens: string[] = [];
  let tokensSent = 0;

  await Promise.all(
    rows.map(async (row) => {
      const result = await sendPushNotification(row.token, title, body, data, sound);
      if (result === 'sent') tokensSent += 1;
      else if (result === 'stale') staleTokens.push(row.token);
    }),
  );

  if (staleTokens.length > 0) {
    for (const token of staleTokens) {
      await prisma.$executeRaw`
        DELETE FROM "customer_fcm_tokens" WHERE "token" = ${token}
      `;
    }
  }

  return { tokensTargeted: rows.length, tokensSent };
}

export function isFcmConfigured(): boolean {
  if (!hasFirebaseEnvConfigured()) return false;
  const parsed = parseServiceAccountFromEnv();
  return parsed !== null && !('error' in parsed);
}
