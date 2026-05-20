import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

/** Express request augmented with the authenticated user id. */
export interface AuthedRequest extends Request {
  userId: string;
}

/**
 * Auth middleware — requires a valid `Authorization: Bearer <token>` header.
 * On success, attaches `req.userId`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(unauthorized('Missing bearer token'));

  const userId = verifyAccessToken(token);
  if (!userId) return next(unauthorized('Invalid or expired token'));

  (req as AuthedRequest).userId = userId;
  next();
}

/** Helper to read the authed user id inside a route handler. */
export function uid(req: Request): string {
  return (req as AuthedRequest).userId;
}
