import type { RequestHandler } from 'express';
import { registerSchema, loginSchema } from '../schema/auth.schema.js';
import * as auth from '../services/auth.service.js';
import * as google from '../services/google.service.js';
import { env, googleEnabled } from '../config/env.js';
import { refreshCookieName, oauthCookieName, oauthCookieOptions, setRefreshCookie, clearRefreshCookie } from '../utils/cookies.js';
import { AppError } from '../utils/errors.js';
import { userRepository } from '../repositories/user.repository.js';

export const config: RequestHandler = (_req, res) => { res.json({ googleEnabled }); };
export const register: RequestHandler = async (req, res) => {
  const result = await auth.register(registerSchema.parse(req.body));
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({ accessToken: result.accessToken, user: result.user });
};
export const login: RequestHandler = async (req, res) => {
  const result = await auth.login(loginSchema.parse(req.body));
  setRefreshCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, user: result.user });
};
export const refresh: RequestHandler = async (req, res) => {
  try {
    const result = await auth.refresh(req.cookies?.[refreshCookieName]);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (error) {
    if (error instanceof AppError && error.status === 401) clearRefreshCookie(res);
    throw error;
  }
};
export const logout: RequestHandler = async (req, res) => {
  await auth.logout(req.cookies?.[refreshCookieName]);
  clearRefreshCookie(res);
  res.status(204).end();
};
export const me: RequestHandler = async (req, res) => { res.json({ user: await userRepository.findPublic(req.auth!.userId) }); };
export const googleStart: RequestHandler = (_req, res) => {
  const result = google.googleAuthorization();
  res.cookie(oauthCookieName, result.cookie, { ...oauthCookieOptions, maxAge: 600000 });
  res.redirect(result.url);
};
export const googleCallback: RequestHandler = async (req, res) => {
  const cookie = req.cookies?.[oauthCookieName];
  res.clearCookie(oauthCookieName, oauthCookieOptions);
  try {
    const result = await google.googleCallback(req.query.code, req.query.state, cookie);
    setRefreshCookie(res, result.refreshToken);
    res.redirect(`${env.FRONTEND_ORIGIN}/?auth=success`);
  } catch (error) {
    const reason = error instanceof AppError && error.code === 'ACCOUNT_EXISTS' ? 'account_exists' : 'google_failed';
    res.redirect(`${env.FRONTEND_ORIGIN}/?auth=${reason}`);
  }
};
