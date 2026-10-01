import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { env, googleEnabled } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { userRepository } from '../repositories/user.repository.js';
import { createLogin } from './auth.service.js';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

export function googleAuthorization() {
  if (!googleEnabled) throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured.');
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const cookie = jwt.sign({ state, nonce, verifier }, env.REFRESH_TOKEN_SECRET, {
    algorithm: 'HS256', audience: 'task-manager-oauth', issuer: 'task-manager', expiresIn: 600,
  });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', prompt: 'select_account',
  });
  return { cookie, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

export async function googleCallback(code: unknown, state: unknown, cookie: unknown) {
  if (!googleEnabled || typeof code !== 'string' || typeof state !== 'string' || typeof cookie !== 'string') {
    throw new AppError(400, 'INVALID_OAUTH', 'Google sign-in could not be completed.');
  }
  let flow;
  try {
    flow = jwt.verify(cookie, env.REFRESH_TOKEN_SECRET, { algorithms: ['HS256'], audience: 'task-manager-oauth', issuer: 'task-manager' });
  } catch { throw new AppError(400, 'INVALID_OAUTH', 'Google sign-in expired. Please try again.'); }
  if (typeof flow === 'string' || flow.state !== state || typeof flow.nonce !== 'string' || typeof flow.verifier !== 'string') {
    throw new AppError(400, 'INVALID_OAUTH', 'Google sign-in state is invalid.');
  }
  const { tokens } = await client.getToken({ code, codeVerifier: flow.verifier });
  if (!tokens.id_token) throw new AppError(401, 'INVALID_OAUTH', 'Google did not return an identity token.');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified || (payload as typeof payload & { nonce?: string }).nonce !== flow.nonce) {
    throw new AppError(401, 'INVALID_OAUTH', 'A verified Google email is required.');
  }
  let user = await userRepository.findByGoogleId(payload.sub);
  if (!user) {
    const email = payload.email.toLowerCase();
    // Never automatically link a password account based only on matching email.
    if (await userRepository.findByEmail(email)) throw new AppError(409, 'ACCOUNT_EXISTS', 'Use your email and password to sign in to your existing account.');
    const created = await userRepository.create({ googleId: payload.sub, email, name: (payload.name || email.split('@')[0]!).slice(0, 80) });
    return createLogin(created.id);
  }
  return createLogin(user.id);
}
