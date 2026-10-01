import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'production';
process.env.FRONTEND_ORIGIN = 'https://tasks.example.com';
process.env.GOOGLE_REDIRECT_URI = 'https://api.example.com/api/auth/google/callback';
process.env.COOKIE_SAME_SITE = 'none';
const { setRefreshCookie, clearRefreshCookie } = await import('../src/utils/cookies.js');
const app = express();
app.get('/set', (_req, res) => { setRefreshCookie(res, 'test-refresh-token'); res.end(); });
app.get('/clear', (_req, res) => { clearRefreshCookie(res); res.end(); });

test('production refresh cookies are Secure and HttpOnly with the configured SameSite policy', async () => {
  const response = await request(app).get('/set').expect(200);
  const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=None', 'Path=/api/auth', 'Max-Age=604800']) assert(cookie.includes(flag));
  const cleared = await request(app).get('/clear').expect(200);
  const removedCookie = (cleared.headers['set-cookie'] as unknown as string[])[0]!;
  assert.match(removedCookie, /Secure/);
  assert.match(removedCookie, /HttpOnly/);
  assert.match(removedCookie, /SameSite=None/);
  assert.match(removedCookie, /Expires=Thu, 01 Jan 1970/);
});
