import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors.js';
import { logger } from './logger.js';

/**
 * Wrap an async route handler so thrown errors land in the error middleware
 * instead of crashing the process. (Express 4 doesn't await handlers.)
 */
export function handler(
  fn: (req: Request, res: Response) => Promise<unknown> | unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/** Express error-handling middleware — renders AppError as the SRS §6.7 shape. */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
    return;
  }
  // Unexpected — log and return a generic 500 (never leak internals).
  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.', field: null },
  });
}

/** Require a body field to be a non-empty string; returns the trimmed value. */
export function requireString(body: unknown, key: string): string {
  const v = (body as Record<string, unknown> | null)?.[key];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new AppError(400, 'VALIDATION', `Missing or invalid field: ${key}`, key);
  }
  return v.trim();
}

/** Read an optional string field. */
export function optionalString(body: unknown, key: string): string | undefined {
  const v = (body as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' ? v : undefined;
}
