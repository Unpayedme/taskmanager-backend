import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';

declare global {
  namespace Express {
    interface Request { auth?: { userId: string; familyId: string } }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
  const claims = verifyToken(authorization.slice(7), 'access');
  const session = await prisma.refreshSession.findFirst({
    where: { userId: claims.sub, familyId: claims.familyId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!session) throw new AppError(401, 'SESSION_REVOKED', 'Your session has ended. Please sign in again.');
  req.auth = { userId: claims.sub, familyId: claims.familyId };
  next();
};
