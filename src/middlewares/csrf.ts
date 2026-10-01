import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// Cookie-authenticated mutations must come from our frontend. CORS alone does not prevent CSRF.
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (req.get('origin') !== env.FRONTEND_ORIGIN) {
    next(new AppError(403, 'UNTRUSTED_ORIGIN', 'This request must come from the trusted frontend.'));
    return;
  }
  next();
};
