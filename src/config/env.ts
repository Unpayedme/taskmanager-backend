import 'dotenv/config';
import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine(value => {
    try { return ['postgres:', 'postgresql:'].includes(new URL(value).protocol); }
    catch { return false; }
  }, 'Use a PostgreSQL connection URL'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  API_PROXY_SECRET: z.string().default(''),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  SESSION_CLEANUP_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/auth/google/callback'),
}).superRefine((value, ctx) => {
  if (value.ACCESS_TOKEN_SECRET === value.REFRESH_TOKEN_SECRET) {
    ctx.addIssue({ code: 'custom', message: 'Use different access and refresh secrets' });
  }
  let origin: URL;
  let redirect: URL;
  try { origin = new URL(value.FRONTEND_ORIGIN); redirect = new URL(value.GOOGLE_REDIRECT_URI); }
  catch { return; } // URL field validators already report the invalid inputs.
  if (origin.origin !== value.FRONTEND_ORIGIN) {
    ctx.addIssue({ code: 'custom', message: 'FRONTEND_ORIGIN must be an origin without a path or trailing slash' });
  }
  const googleConfigured = Boolean(value.GOOGLE_CLIENT_ID && value.GOOGLE_CLIENT_SECRET);
  if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Configure both Google client values or leave both empty' });
  }
  if (googleConfigured && redirect.pathname !== '/api/auth/google/callback') {
    ctx.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: 'Google redirect must use /api/auth/google/callback' });
  }
  if (value.NODE_ENV === 'production' && (origin.protocol !== 'https:' || (googleConfigured && redirect.protocol !== 'https:'))) {
    ctx.addIssue({ code: 'custom', message: 'Production frontend and OAuth redirect URLs must use HTTPS' });
  }
  if (value.NODE_ENV === 'production') {
    for (const key of ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'API_PROXY_SECRET'] as const) {
      if (value[key].length < 32 || /replace|change.?me|placeholder|example|test[-_]?(access|refresh|secret)/i.test(value[key])) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Set a unique random production secret of at least 32 characters' });
      }
    }
    if (new Set([value.ACCESS_TOKEN_SECRET, value.REFRESH_TOKEN_SECRET, value.API_PROXY_SECRET]).size !== 3) {
      ctx.addIssue({ code: 'custom', message: 'Use three different token and proxy secrets' });
    }
    if (googleConfigured && value.GOOGLE_REDIRECT_URI !== `${value.FRONTEND_ORIGIN}/api/auth/google/callback`) {
      ctx.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: 'Use the Vercel frontend origin for the Google callback so OAuth cookies stay on the same host' });
    }
  }
  if (value.COOKIE_SAME_SITE === 'none' && value.NODE_ENV !== 'production') {
    ctx.addIssue({ code: 'custom', message: 'SameSite=None requires production HTTPS and secure cookies' });
  }
});

export const env = environmentSchema.parse(process.env);
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
