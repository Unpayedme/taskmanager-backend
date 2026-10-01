import '../setup.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { env } from '../../src/config/env.js';
import { tokenHash } from '../../src/utils/jwt.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const userIds: string[] = [];
const password = 'A secure integration password';
const origin = env.FRONTEND_ORIGIN;
const cookie = (response: request.Response): string => {
  const value = response.headers['set-cookie'] as unknown as string[];
  return value.find(item => item.startsWith('tm_refresh='))!.split(';')[0]!;
};
async function register(name = 'Alex') {
  const email = `${randomUUID()}@example.com`;
  const result = await request(app).post('/api/auth/register').set('Origin', origin).send({ name, email, password }).expect(201);
  userIds.push(result.body.user.id);
  return { token: result.body.accessToken as string, cookie: cookie(result), user: result.body.user, email };
}
const tasksRequest = (token: string) => request(app).get('/api/tasks').set('Authorization', `Bearer ${token}`);

describe('PostgreSQL API integration', { skip: !enabled, concurrency: false }, () => {
  before(async () => {
    const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
    assert.match(databaseName, /_test$/, 'Integration tests must use a dedicated database ending in _test');
    await prisma.$connect();
  });
  after(async () => {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  test('registration and login return safe users and HttpOnly refresh cookies', async () => {
    const account = await register();
    assert.equal(account.user.passwordHash, undefined);
    assert.equal(account.user.googleId, undefined);
    const login = await request(app).post('/api/auth/login').set('Origin', origin).send({ email: account.email.toUpperCase(), password }).expect(200);
    const rawCookie = (login.headers['set-cookie'] as unknown as string[]).find(item => item.startsWith('tm_refresh='))!;
    assert.match(rawCookie, /HttpOnly/);
    assert.match(rawCookie, /Path=\/api\/auth/);
    assert.match(rawCookie, /SameSite=Lax/);
    assert.equal(login.body.refreshToken, undefined);
    await request(app).post('/api/auth/login').set('Origin', origin).send({ email: account.email, password: 'incorrect-password' }).expect(401);
    await request(app).post('/api/auth/register').set('Origin', origin).send({ name: 'Alex', email: account.email, password }).expect(409);
    const sessions = await prisma.refreshSession.findMany({ where: { userId: account.user.id } });
    assert.equal(sessions.length, 2);
    assert(sessions.every(session => /^[a-f0-9]{64}$/.test(session.tokenHash)));
  });

  test('task CRUD, filtering and statistics stay within the current account', async () => {
    const alice = await register('Alice');
    const bob = await register('Bob');
    const created = await request(app).post('/api/tasks').set('Authorization', `Bearer ${alice.token}`).send({ title: 'Write the report', description: 'Research notes', dueDate: '2026-10-01' }).expect(201);
    const taskId = created.body.task.id;
    assert.equal(created.body.task.dueDate, '2026-10-01');
    await request(app).post('/api/tasks').set('Authorization', `Bearer ${bob.token}`).send({ title: 'Bob private task' }).expect(201);
    const listing = await tasksRequest(alice.token).query({ search: 'REPORT', today: '2026-10-01', due: 'today', limit: 1 }).expect(200);
    assert.equal(listing.body.total, 1);
    assert.equal(listing.body.tasks[0].id, taskId);
    for (const operation of ['get', 'patch', 'delete'] as const) {
      const query = request(app)[operation](`/api/tasks/${taskId}`).set('Authorization', `Bearer ${bob.token}`);
      await (operation === 'patch' ? query.send({ title: 'Stolen' }) : query).expect(404);
    }
    const updated = await request(app).patch(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${alice.token}`).send({ status: 'COMPLETED' }).expect(200);
    assert.equal(updated.body.task.title, 'Write the report');
    assert.equal(updated.body.task.description, 'Research notes');
    assert.equal(updated.body.task.dueDate, '2026-10-01');
    const stats = await request(app).get('/api/tasks/stats').set('Authorization', `Bearer ${alice.token}`).query({ today: '2026-10-01' }).expect(200);
    assert.equal(stats.body.total, 1);
    assert.equal(stats.body.completed, 1);
    assert.equal((await tasksRequest(bob.token).expect(200)).body.tasks[0].title, 'Bob private task');
    await request(app).delete(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${alice.token}`).expect(204);
    assert.equal((await tasksRequest(alice.token).expect(200)).body.total, 0);
  });

  test('validation rejects ownership injection, invalid dates and empty patches', async () => {
    const account = await register();
    for (const input of [{ title: 'Valid', userId: randomUUID() }, { title: 'Valid', dueDate: '2026-02-30' }, { title: '' }]) {
      await request(app).post('/api/tasks').set('Authorization', `Bearer ${account.token}`).send(input).expect(400);
    }
    await request(app).patch(`/api/tasks/${randomUUID()}`).set('Authorization', `Bearer ${account.token}`).send({}).expect(400);
  });

  test('refresh rotation replaces the cookie and replay revokes the whole session family', async () => {
    const account = await register();
    const refreshed = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', account.cookie).expect(200);
    const newCookie = cookie(refreshed);
    assert.notEqual(newCookie, account.cookie);
    const rawToken = decodeURIComponent(account.cookie.split('=')[1]!);
    const original = await prisma.refreshSession.findUnique({ where: { tokenHash: tokenHash(rawToken) } });
    assert(original?.revokedAt);
    await tasksRequest(refreshed.body.accessToken).expect(200);
    const replay = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', account.cookie).expect(401);
    assert.equal(replay.body.error.code, 'TOKEN_REUSED');
    await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', newCookie).expect(401);
    await tasksRequest(refreshed.body.accessToken).expect(401);
  });

  test('only one of two simultaneous refresh requests consumes a token', async () => {
    const account = await register();
    const results = await Promise.all([
      request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', account.cookie),
      request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', account.cookie),
    ]);
    assert.deepEqual(results.map(item => item.status).sort(), [200, 401]);
    const winner = results.find(item => item.status === 200)!;
    await tasksRequest(winner.body.accessToken).expect(401);
  });

  test('logout revokes access and refresh tokens and clears the cookie', async () => {
    const account = await register();
    const result = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', account.cookie).expect(204);
    assert.match((result.headers['set-cookie'] as unknown as string[])[0]!, /Expires=Thu, 01 Jan 1970/);
    await tasksRequest(account.token).expect(401);
    await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', account.cookie).expect(401);
  });

  test('a signed but expired access token is rejected even with an active session', async () => {
    const account = await register();
    const decoded = jwt.decode(account.token) as jwt.JwtPayload;
    const expired = jwt.sign({ kind: 'access', familyId: decoded.familyId }, env.ACCESS_TOKEN_SECRET, { algorithm: 'HS256', subject: account.user.id, issuer: 'task-manager', audience: 'task-manager-api', expiresIn: -1 });
    const result = await tasksRequest(expired).expect(401);
    assert.equal(result.body.error.code, 'TOKEN_EXPIRED');
    await tasksRequest(account.token).expect(200);
  });
});
