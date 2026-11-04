import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler';

type JsonBody = { success?: boolean; data?: unknown; message?: string };

export type HarnessUser =
  | { sub: string; type: 'user'; tv?: number }
  | { sub: string; type: 'admin'; role: string; storeId?: string | null; tv?: number };

function createRes(): Response & {
  statusCode: number;
  body: JsonBody | null;
} {
  const state = { statusCode: 200, body: null as JsonBody | null };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: JsonBody) {
      state.body = payload;
      return res;
    },
    send() {
      return res;
    },
    cookie() {
      return res;
    },
    clearCookie() {
      return res;
    },
    setHeader() {
      return res;
    },
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
  };
  return res as unknown as Response & { statusCode: number; body: JsonBody | null };
}

export async function runHandler<T>(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void | Promise<void | Response>,
  reqInit: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    query?: Record<string, string>;
    user?: HarnessUser;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const headers: Record<string, string | string[] | undefined> = { ...(reqInit.headers ?? {}) };
  const req = {
    method: reqInit.method ?? 'POST',
    body: reqInit.body ?? {},
    params: reqInit.params ?? {},
    query: reqInit.query ?? {},
    user: reqInit.user,
    headers,
    get(name: string) {
      const key = name.toLowerCase();
      const value = headers[key] ?? headers[name];
      return Array.isArray(value) ? value[0] : value;
    },
  } as Request;

  const res = createRes();
  const next: NextFunction = (err: unknown) => {
    if (err instanceof AppError) {
      throw new Error(`[${err.statusCode}] ${err.message}`);
    }
    if (err instanceof Error) throw err;
    throw new Error(String(err));
  };

  await handler(req, res, next);

  if (res.statusCode >= 400) {
    const msg = res.body?.message ?? `HTTP ${res.statusCode}`;
    throw new Error(msg);
  }
  if (res.body?.success === false) {
    throw new Error(res.body.message ?? 'Request failed');
  }
  return res.body?.data as T;
}
