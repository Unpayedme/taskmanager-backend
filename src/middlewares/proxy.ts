import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

declare global {
  namespace Express {
    interface Request { verifiedClientIp?: string }
  }
}

export const requireApiProxy: RequestHandler = (req, _res, next) => {
  if (!env.API_PROXY_SECRET) return next();
  const supplied = Buffer.from(req.get('x-taskmanager-proxy-secret') ?? '');
  const expected = Buffer.from(env.API_PROXY_SECRET);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AppError(403, 'UNTRUSTED_PROXY', 'Use the application API endpoint.');
  }
  const clientIp = req.get('x-taskmanager-client-ip');
  if (!clientIp || !isIP(clientIp)) throw new AppError(400, 'INVALID_CLIENT_IP', 'Invalid proxy client address.');
  req.verifiedClientIp = clientIp;
  next();
};

export const clientRateLimitKey = (req: Request) => ipKeyGenerator(req.verifiedClientIp ?? req.ip ?? req.socket.remoteAddress ?? '127.0.0.1');
