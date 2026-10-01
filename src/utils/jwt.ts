import { createHash } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

type Claims = JwtPayload & { sub: string; familyId: string; kind: 'access' | 'refresh' };
const issuer = 'task-manager';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function signAccess(userId: string, familyId: string): string {
  return jwt.sign({ kind: 'access', familyId }, env.ACCESS_TOKEN_SECRET, {
    algorithm: 'HS256', subject: userId, issuer, audience: 'task-manager-api',
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
  });
}

export function signRefresh(userId: string, familyId: string, sessionId: string): string {
  return jwt.sign({ kind: 'refresh', familyId }, env.REFRESH_TOKEN_SECRET, {
    algorithm: 'HS256', subject: userId, jwtid: sessionId, issuer,
    audience: 'task-manager-refresh', expiresIn: env.REFRESH_TOKEN_DAYS * 86400,
  });
}

export function verifyToken(token: string, kind: 'access' | 'refresh'): Claims {
  try {
    const claims = jwt.verify(token, kind === 'access' ? env.ACCESS_TOKEN_SECRET : env.REFRESH_TOKEN_SECRET, {
      algorithms: ['HS256'], issuer,
      audience: kind === 'access' ? 'task-manager-api' : 'task-manager-refresh',
    });
    if (typeof claims === 'string' || claims.kind !== kind || typeof claims.sub !== 'string' || typeof claims.familyId !== 'string' || (kind === 'refresh' && !claims.jti)) {
      throw new Error('Invalid token claims');
    }
    return claims as Claims;
  } catch (error) {
    throw new AppError(401, error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', 'Your session has expired. Please sign in again.');
  }
}
