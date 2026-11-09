import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';

process.env.API_PROXY_SECRET = 'unit-proxy-authentication-key-at-least-32-characters';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
const { default: app } = await import('../src/app.js');
const { env, environmentSchema } = await import('../src/config/env.js');
const { databaseHealth } = await import('../src/lib/prisma.js');
const { requireApiProxy, clientRateLimitKey } = await import('../src/middlewares/proxy.js');
const { errorHandler } = await import('../src/middlewares/errors.js');

test('production requires HTTPS and distinct non-placeholder token/proxy secrets', () => {
  const valid = { ...env, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://tasks.example.com', ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'), REFRESH_TOKEN_SECRET: randomBytes(48).toString('hex'), API_PROXY_SECRET: randomBytes(48).toString('hex') };
  assert.equal(environmentSchema.safeParse(valid).success, true, 'Disabled Google sign-in must not require an HTTPS Google callback');
  for (const change of [{ API_PROXY_SECRET: '' }, { ACCESS_TOKEN_SECRET: 'replace-with-a-random-secret-at-least-32-characters' }, { FRONTEND_ORIGIN: 'http://tasks.example.com' }, { FRONTEND_ORIGIN: 'not-a-url' }, { DATABASE_URL: 'not-a-url' }, { DATABASE_URL: 'https://database.example.com' }, { API_PROXY_SECRET: valid.ACCESS_TOKEN_SECRET }, { GOOGLE_CLIENT_ID: 'client-without-secret' }]) {
    assert.equal(environmentSchema.safeParse({ ...valid, ...change }).success, false);
  }
  const google = { ...valid, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'https://tasks.example.com/api/auth/google/callback' };
  assert.equal(environmentSchema.safeParse(google).success, true);
  assert.equal(environmentSchema.safeParse({ ...google, GOOGLE_REDIRECT_URI: 'https://api.example.com/api/auth/google/callback' }).success, false);
});

test('Railway endpoints reject forged proxy headers while health checks stay public', async () => {
  await request(app).get('/api/health').expect(200);
  await request(app).get('/api/auth/config').set('x-taskmanager-client-ip', '203.0.113.1').expect(403);
  await request(app).get('/api/auth/config').set('x-taskmanager-proxy-secret', 'forged').set('x-taskmanager-client-ip', '203.0.113.1').expect(403);
  await request(app).get('/api/auth/config').set('x-taskmanager-proxy-secret', env.API_PROXY_SECRET).set('x-taskmanager-client-ip', 'invalid').expect(400);
  await request(app).get('/api/auth/config').set('x-taskmanager-proxy-secret', env.API_PROXY_SECRET).set('x-taskmanager-client-ip', '203.0.113.1').expect(200);
});

test('verified visitor addresses keep proxy users in separate rate-limit buckets', async () => {
  const limited = express();
  limited.use(requireApiProxy, rateLimit({ windowMs: 60000, limit: 2, keyGenerator: clientRateLimitKey }));
  limited.get('/', (_req, res) => res.sendStatus(200));
  limited.use(errorHandler);
  const hit = (ip: string) => request(limited).get('/').set('x-taskmanager-proxy-secret', env.API_PROXY_SECRET).set('x-taskmanager-client-ip', ip);
  await hit('203.0.113.1').expect(200);
  await hit('203.0.113.1').expect(200);
  await hit('203.0.113.1').expect(429);
  await hit('203.0.113.2').expect(200);
});

test('readiness detects database failure without exposing connection details', async t => {
  const query = t.mock.method(databaseHealth, 'check', async () => [{ value: 1 }]);
  const ready = await request(app).get('/api/ready').expect(200);
  assert.equal(ready.body.status, 'ready');
  query.mock.mockImplementation(async () => { throw new Error('private database credentials'); });
  const down = await request(app).get('/api/ready').expect(503);
  assert.deepEqual(down.body, { status: 'unavailable' });
});
