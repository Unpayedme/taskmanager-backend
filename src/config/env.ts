import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/auth/google/callback'),
}).superRefine((value, ctx) => {
  if (value.ACCESS_TOKEN_SECRET === value.REFRESH_TOKEN_SECRET) {
    ctx.addIssue({ code: 'custom', message: 'Use different access and refresh secrets' });
  }
  const origin = new URL(value.FRONTEND_ORIGIN);
  if (origin.origin !== value.FRONTEND_ORIGIN) {
    ctx.addIssue({ code: 'custom', message: 'FRONTEND_ORIGIN must be an origin without a path or trailing slash' });
  }
  if (value.NODE_ENV === 'production' && (origin.protocol !== 'https:' || new URL(value.GOOGLE_REDIRECT_URI).protocol !== 'https:')) {
    ctx.addIssue({ code: 'custom', message: 'Production frontend and OAuth redirect URLs must use HTTPS' });
  }
  if (value.COOKIE_SAME_SITE === 'none' && value.NODE_ENV !== 'production') {
    ctx.addIssue({ code: 'custom', message: 'SameSite=None requires production HTTPS and secure cookies' });
  }
});

export const env = schema.parse(process.env);
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
