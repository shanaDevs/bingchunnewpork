import type { NextFunction, Request, Response } from 'express';

type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

function backendAuth(): { authenticate: AuthMiddleware; requireAdmin: AuthMiddleware } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@bingchun/backend/dist/middleware/auth');
}

/** Same admin JWT / cookie auth as core (shared secret + Prisma permissions). */
export function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
  void backendAuth().authenticate(req, res, next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  backendAuth().requireAdmin(req, res, next);
}
