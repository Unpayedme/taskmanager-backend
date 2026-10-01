import { randomUUID } from 'node:crypto';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccess, signRefresh, tokenHash, verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

const dummyHash = hashPassword('This is only a timing comparison password');

function newSession(userId: string, familyId: string) {
  const id = randomUUID();
  const refreshToken = signRefresh(userId, familyId, id);
  return { refreshToken, data: { id, userId, familyId, tokenHash: tokenHash(refreshToken), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000) } };
}

export async function createLogin(userId: string) {
  const familyId = randomUUID();
  const { refreshToken, data } = newSession(userId, familyId);
  await sessionRepository.create(data);
  return { refreshToken, accessToken: signAccess(userId, familyId), user: await userRepository.findPublic(userId) };
}

export async function register(input: { name: string; email: string; password: string }) {
  const user = await userRepository.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) });
  return createLogin(user.id);
}

export async function login(input: { email: string; password: string }) {
  const user = await userRepository.findByEmail(input.email);
  const valid = await verifyPassword(input.password, user?.passwordHash ?? await dummyHash);
  if (!user?.passwordHash || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  return createLogin(user.id);
}

export async function refresh(token: string | undefined) {
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
  const claims = verifyToken(token, 'refresh');
  const hash = tokenHash(token);
  const existing = await sessionRepository.find(claims.jti!);
  if (!existing || existing.userId !== claims.sub || existing.familyId !== claims.familyId || existing.tokenHash !== hash) {
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid refresh session.');
  }
  if (existing.revokedAt) {
    await sessionRepository.revokeFamily(existing.familyId, existing.userId);
    throw new AppError(401, 'TOKEN_REUSED', 'Your session has ended. Please sign in again.');
  }
  if (existing.expiresAt <= new Date()) throw new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired.');
  const { refreshToken, data } = newSession(existing.userId, existing.familyId);
  if (!await sessionRepository.rotate(existing.id, hash, data)) {
    await sessionRepository.revokeFamily(existing.familyId, existing.userId);
    throw new AppError(401, 'TOKEN_REUSED', 'Your session has ended. Please sign in again.');
  }
  return { refreshToken, accessToken: signAccess(existing.userId, existing.familyId), user: await userRepository.findPublic(existing.userId) };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  let claims;
  try { claims = verifyToken(token, 'refresh'); } catch { return; }
  const session = await sessionRepository.find(claims.jti!);
  if (session && session.userId === claims.sub && session.tokenHash === tokenHash(token)) {
    await sessionRepository.revokeFamily(session.familyId, session.userId);
  }
}
