import { vi, type Mock } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

export type MockNextFunction = Mock & NextFunction;

export function createMockNext(): MockNextFunction {
  return vi.fn() as unknown as MockNextFunction;
}

/** Narrow a NextFunction (or plain mock) so `.mock` / `mock.calls` type-check. */
export function asMockFn(fn: NextFunction | Mock): Mock {
  return fn as unknown as Mock;
}

export function createMockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  };
}

export function createMockReq(overrides: Partial<Request> = {}): Request {
  const headers: Record<string, string | string[] | undefined> = {
    ...(overrides.headers as Record<string, string | string[] | undefined>),
  };
  const req = {
    body: {},
    headers,
    params: {},
    query: {},
    user: undefined,
    method: 'POST',
    get(name: string) {
      const key = name.toLowerCase();
      const value = headers[key] ?? headers[name];
      if (Array.isArray(value)) return value[0];
      return value;
    },
    ...overrides,
  };
  if (overrides.headers) req.headers = headers;
  return req as Request;
}
