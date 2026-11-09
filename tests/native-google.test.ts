import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
process.env.GOOGLE_CLIENT_ID = 'native-test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'native-google-test-secret';
const { nativeGoogleChallenge, nativeGoogleLogin } = await import('../src/services/google.service.js');
const { googleChallengeRepository: challenges } = await import('../src/repositories/google-challenge.repository.js');
const { userRepository: users } = await import('../src/repositories/user.repository.js');
const { sessionRepository: sessions } = await import('../src/repositories/session.repository.js');
const { env } = await import('../src/config/env.js');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const nonce = 'random-server-issued-one-use-nonce';
const challenge = { id: randomUUID(), nonceHash: createHash('sha256').update(nonce).digest('hex'), expiresAt: new Date(Date.now() + 300000) };
const claims = { sub: 'existing-google-identity', email: 'native@example.com', email_verified: true, nonce };
const options = { algorithm: 'RS256' as const, keyid: 'native-key', audience: env.GOOGLE_CLIENT_ID, issuer: 'https://accounts.google.com', expiresIn: 300 };

test('native challenges expire in five minutes and only a nonce hash is stored', async t => {
  t.mock.method(challenges, 'prune', async () => ({ count: 0 }));
  const created = t.mock.method(challenges, 'create', async () => challenge);
  const result = await nativeGoogleChallenge();
  assert.equal(result.challengeId, challenge.id);
  const stored = created.mock.calls[0]!.arguments[0]!;
  assert.equal(stored.nonceHash, createHash('sha256').update(result.nonce).digest('hex'));
  assert(Math.abs(stored.expiresAt.getTime() - Date.now() - 300000) < 2000);
  assert.equal('nonce' in stored, false);
});

test('native Google sign-in recognizes the existing Google user and issues the existing session type', async t => {
  const user = { id: randomUUID(), name: 'Native Tester', email: claims.email, createdAt: new Date() };
  t.mock.method(challenges, 'find', async () => challenge);
  t.mock.method(challenges, 'consume', async () => ({ count: 1 }));
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'native-key': keys.publicKey.export({ type: 'spki', format: 'pem' }) } }));
  t.mock.method(users, 'findByGoogleId', async () => user);
  t.mock.method(users, 'findPublic', async () => user);
  const createUser = t.mock.method(users, 'create', async () => user);
  const session = t.mock.method(sessions, 'create', async () => ({}));
  const result = await nativeGoogleLogin(challenge.id, jwt.sign(claims, keys.privateKey, options));
  assert.equal(result.user.id, user.id);
  assert.equal(createUser.mock.callCount(), 0);
  assert.equal(session.mock.callCount(), 1);
  assert.equal((jwt.decode(result.accessToken) as jwt.JwtPayload).sub, user.id);
});

test('native identity verification rejects forged, expired, wrong-audience, wrong-issuer, unverified and wrong-nonce tokens', async t => {
  t.mock.method(challenges, 'find', async () => challenge);
  const consumed = t.mock.method(challenges, 'consume', async () => ({ count: 1 }));
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'native-key': keys.publicKey.export({ type: 'spki', format: 'pem' }) } }));
  for (const token of [
    jwt.sign({ ...claims, nonce: 'other' }, keys.privateKey, options),
    jwt.sign({ ...claims, email_verified: false }, keys.privateKey, options),
    jwt.sign(claims, keys.privateKey, { ...options, audience: 'attacker' }),
    jwt.sign(claims, keys.privateKey, { ...options, issuer: 'https://attacker.example.com' }),
    jwt.sign(claims, keys.privateKey, { ...options, expiresIn: -3600 }),
    jwt.sign(claims, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, options),
    'not-a-jwt',
  ]) await assert.rejects(nativeGoogleLogin(challenge.id, token), { code: 'INVALID_OAUTH' });
  assert.equal(consumed.mock.callCount(), 0);
});

test('native sign-in rejects missing, expired and already-consumed challenges', async t => {
  const find = t.mock.method(challenges, 'find', async () => null);
  const token = jwt.sign(claims, keys.privateKey, options);
  await assert.rejects(nativeGoogleLogin(challenge.id, token), { code: 'INVALID_OAUTH' });
  find.mock.mockImplementation(async () => ({ ...challenge, expiresAt: new Date(0) }));
  await assert.rejects(nativeGoogleLogin(challenge.id, token), { code: 'INVALID_OAUTH' });
  find.mock.mockImplementation(async () => challenge);
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'native-key': keys.publicKey.export({ type: 'spki', format: 'pem' }) } }));
  t.mock.method(challenges, 'consume', async () => ({ count: 0 }));
  await assert.rejects(nativeGoogleLogin(challenge.id, token), { code: 'INVALID_OAUTH' });
});

test('native Google cannot claim a password account with the same email', async t => {
  t.mock.method(challenges, 'find', async () => challenge);
  t.mock.method(challenges, 'consume', async () => ({ count: 1 }));
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'native-key': keys.publicKey.export({ type: 'spki', format: 'pem' }) } }));
  t.mock.method(users, 'findByGoogleId', async () => null);
  t.mock.method(users, 'findByEmail', async () => ({ id: randomUUID(), passwordHash: 'existing' }));
  await assert.rejects(nativeGoogleLogin(challenge.id, jwt.sign(claims, keys.privateKey, options)), { code: 'ACCOUNT_EXISTS' });
});
