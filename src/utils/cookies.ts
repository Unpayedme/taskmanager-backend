import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

export const refreshCookieName = 'tm_refresh';
export const oauthCookieName = 'tm_oauth';
const options: CookieOptions = {
  httpOnly: true, secure: env.NODE_ENV === 'production',
  sameSite: env.COOKIE_SAME_SITE, path: '/api/auth',
};

export const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(refreshCookieName, token, { ...options, maxAge: env.REFRESH_TOKEN_DAYS * 86400000 });
};
export const clearRefreshCookie = (res: Response) => res.clearCookie(refreshCookieName, options);
export const oauthCookieOptions: CookieOptions = {
  httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google',
};
