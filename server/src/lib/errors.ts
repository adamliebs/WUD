/**
 * Typed application error. Carries a stable machine-readable `code` (clients
 * branch on this, never on `message`) per SRS §6.7.
 */
export class AppError extends Error {
  status: number;
  code: string;
  field: string | null;

  constructor(status: number, code: string, message: string, field: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/* Common error constructors ------------------------------------------------- */

export const badRequest = (code: string, msg: string, field: string | null = null) =>
  new AppError(400, code, msg, field);

export const unauthorized = (msg = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', msg);

export const forbidden = (msg = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', msg);

export const notFound = (code = 'NOT_FOUND', msg = 'Resource not found') =>
  new AppError(404, code, msg);

export const conflict = (code: string, msg: string, field: string | null = null) =>
  new AppError(409, code, msg, field);

export const tooMany = (msg = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', msg);
