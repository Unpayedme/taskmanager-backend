import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { signAccess, signRefresh, verifyToken, tokenHash } from '../src/utils/jwt.js';
import { registerSchema } from '../src/schema/auth.schema.js';
import { createTaskSchema, updateTaskSchema, dateOnly, listTaskSchema } from '../src/schema/task.schema.js';

test('passwords are salted and wrong passwords fail verification', async () => {
  const first = await hashPassword('A very good test password');
  const second = await hashPassword('A very good test password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('A very good test password', first), true);
  assert.equal(await verifyPassword('A different password', first), false);
  assert.equal(await verifyPassword('anything', 'malformed'), false);
});

test('access and refresh tokens cannot be substituted for each other', () => {
  const userId = randomUUID();
  const family = randomUUID();
  const access = signAccess(userId, family);
  const refresh = signRefresh(userId, family, randomUUID());
  assert.equal(verifyToken(access, 'access').sub, userId);
  assert.equal(verifyToken(refresh, 'refresh').familyId, family);
  assert.throws(() => verifyToken(access, 'refresh'));
  assert.throws(() => verifyToken(refresh, 'access'));
  assert.notEqual(tokenHash(refresh), refresh);
  assert.equal(tokenHash(refresh).length, 64);
});

test('JWT signature, algorithm, issuer, audience and expiry are enforced', () => {
  const payload = { sub: randomUUID(), kind: 'access', familyId: randomUUID() };
  const options = { algorithm: 'HS256' as const, issuer: 'task-manager', audience: 'task-manager-api', expiresIn: 60 };
  assert.throws(() => verifyToken(jwt.sign(payload, 'incorrect-signing-key', options), 'access'));
  assert.throws(() => verifyToken(jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { ...options, algorithm: 'HS384' }), 'access'));
  assert.throws(() => verifyToken(jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { ...options, issuer: 'somebody-else' }), 'access'));
  assert.throws(() => verifyToken(jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { ...options, audience: 'another-app' }), 'access'));
  assert.throws(() => verifyToken(jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { ...options, expiresIn: -1 }), 'access'), { code: 'TOKEN_EXPIRED' });
});

test('registration normalizes email and rejects weak passwords and unknown fields', () => {
  const valid = { name: ' Alex ', email: ' ALEX@example.com ', password: 'long-password-123' };
  assert.deepEqual(registerSchema.parse(valid), { ...valid, name: 'Alex', email: 'alex@example.com' });
  assert.equal(registerSchema.safeParse({ ...valid, password: 'short' }).success, false);
  assert.equal(registerSchema.safeParse({ ...valid, role: 'admin' }).success, false);
});

test('real calendar dates are required, including leap years', () => {
  for (const value of ['2024-02-29', '2026-10-01']) assert.equal(dateOnly.safeParse(value).success, true);
  for (const value of ['2025-02-29', '2026-02-30', '2026-13-01', '10/01/2026', '']) assert.equal(dateOnly.safeParse(value).success, false);
});

test('partial task updates preserve omitted fields and cannot change ownership', () => {
  assert.deepEqual(updateTaskSchema.parse({ title: ' Rename ' }), { title: 'Rename' });
  assert.deepEqual(updateTaskSchema.parse({ status: 'COMPLETED' }), { status: 'COMPLETED' });
  assert.equal(updateTaskSchema.safeParse({}).success, false);
  assert.equal(updateTaskSchema.safeParse({ userId: randomUUID() }).success, false);
  assert.equal(createTaskSchema.safeParse({ title: '  ' }).success, false);
  assert.equal(createTaskSchema.safeParse({ title: 'Valid', dueDate: 'invalid' }).success, false);
});

test('list queries bound pagination and accept only documented filter values', () => {
  assert.equal(listTaskSchema.parse({}).limit, 50);
  assert.equal(listTaskSchema.safeParse({ limit: '101' }).success, false);
  assert.equal(listTaskSchema.safeParse({ page: '0' }).success, false);
  assert.equal(listTaskSchema.safeParse({ status: 'PRIVATE' }).success, false);
  assert.equal(listTaskSchema.safeParse({ userId: randomUUID() }).success, false);
});

test('authentication writes reject untrusted and missing origins before using cookies', async () => {
  for (const path of ['register', 'login', 'refresh', 'logout']) {
    await request(app).post(`/api/auth/${path}`).set('Origin', 'https://attacker.example').send({}).expect(403);
    await request(app).post(`/api/auth/${path}`).send({}).expect(403);
  }
});

test('protected endpoints require a valid bearer token', async () => {
  await request(app).get('/api/tasks').expect(401);
  await request(app).get('/api/tasks').set('Authorization', 'Bearer forged-token').expect(401);
  await request(app).get('/api/auth/me').expect(401);
});

test('health, error responses and CORS expose only the trusted origin', async () => {
  const result = await request(app).get('/api/health').set('Origin', env.FRONTEND_ORIGIN).expect(200);
  assert.equal(result.headers['access-control-allow-origin'], env.FRONTEND_ORIGIN);
  assert.equal(result.headers['access-control-allow-credentials'], 'true');
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-powered-by'], undefined);
  const badOrigin = await request(app).get('/api/health').set('Origin', 'https://attacker.example').expect(200);
  assert.notEqual(badOrigin.headers['access-control-allow-origin'], 'https://attacker.example');
  const missing = await request(app).get('/api/does-not-exist').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});
