import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
const { googleAuthorization, googleCallback } = await import('../src/services/google.service.js');
const { env } = await import('../src/config/env.js');
const { userRepository } = await import('../src/repositories/user.repository.js');
const { sessionRepository } = await import('../src/repositories/session.repository.js');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });

test('Google authorization binds state, nonce and PKCE to a signed short-lived cookie', () => {
  const first = googleAuthorization();
  const second = googleAuthorization();
  const url = new URL(first.url);
  const flow = jwt.verify(first.cookie, env.REFRESH_TOKEN_SECRET, { algorithms: ['HS256'], audience: 'task-manager-oauth', issuer: 'task-manager' }) as jwt.JwtPayload;
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), flow.state);
  assert.equal(url.searchParams.get('nonce'), flow.nonce);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(flow.verifier).digest('base64url'));
  assert.equal(flow.exp! - flow.iat!, 600);
  assert.notEqual(new URL(second.url).searchParams.get('state'), flow.state);
  assert.equal(url.searchParams.has('client_secret'), false);
});

test('invalid, missing or mismatched Google state is rejected before token exchange', async () => {
  const flow = googleAuthorization();
  await assert.rejects(googleCallback('code', 'wrong-state', flow.cookie), { code: 'INVALID_OAUTH' });
  await assert.rejects(googleCallback('code', 'state', 'unsigned'), { code: 'INVALID_OAUTH' });
  await assert.rejects(googleCallback(undefined, undefined, undefined), { code: 'INVALID_OAUTH' });
});

test('a verified Google callback exchanges PKCE, creates a safe user and issues a session', async t => {
  const flow = googleAuthorization();
  const state = new URL(flow.url).searchParams.get('state')!;
  const claims = jwt.decode(flow.cookie) as jwt.JwtPayload;
  const user = { id: randomUUID(), name: 'Google Tester', email: 'google@example.com', createdAt: new Date() };
  const idToken = jwt.sign({ sub: 'google-subject', email: user.email, email_verified: true, name: user.name, nonce: claims.nonce }, keys.privateKey, {
    algorithm: 'RS256', keyid: 'audit-key', issuer: 'https://accounts.google.com', audience: env.GOOGLE_CLIENT_ID, expiresIn: 600,
  });
  const exchange = t.mock.method(OAuth2Client.prototype, 'getToken', async () => ({ tokens: { id_token: idToken } }));
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'audit-key': publicKey } }));
  t.mock.method(userRepository, 'findByGoogleId', async () => null);
  t.mock.method(userRepository, 'findByEmail', async () => null);
  const create = t.mock.method(userRepository, 'create', async () => user);
  t.mock.method(userRepository, 'findPublic', async () => user);
  const session = t.mock.method(sessionRepository, 'create', async () => ({}));
  const result = await googleCallback('authorization-code', state, flow.cookie);
  assert.deepEqual(exchange.mock.calls[0]!.arguments[0], { code: 'authorization-code', codeVerifier: claims.verifier });
  assert.deepEqual(create.mock.calls[0]!.arguments[0], { googleId: 'google-subject', email: user.email, name: user.name });
  assert.equal(result.user.id, user.id);
  assert.equal(result.user.passwordHash, undefined);
  assert.equal(session.mock.callCount(), 1);
  assert.equal((jwt.decode(result.accessToken) as jwt.JwtPayload).sub, user.id);
});

test('Google callbacks enforce signature, issuer, audience, expiry, nonce and verified email', async t => {
  const flow = googleAuthorization();
  const claims = jwt.decode(flow.cookie) as jwt.JwtPayload;
  let token = '';
  t.mock.method(OAuth2Client.prototype, 'getToken', async () => ({ tokens: { id_token: token } }));
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'audit-key': publicKey } }));
  const lookup = t.mock.method(userRepository, 'findByGoogleId', async () => null);
  const base = { sub: 'subject', email: 'google@example.com', email_verified: true, nonce: claims.nonce };
  const options = { algorithm: 'RS256' as const, keyid: 'audit-key', issuer: 'https://accounts.google.com', audience: env.GOOGLE_CLIENT_ID, expiresIn: 600 };
  const cases = [
    jwt.sign({ ...base, nonce: 'wrong' }, keys.privateKey, options),
    jwt.sign({ ...base, email_verified: false }, keys.privateKey, options),
    jwt.sign({ ...base, email_verified: 'false' }, keys.privateKey, options),
    jwt.sign({ ...base, sub: '' }, keys.privateKey, options),
    jwt.sign(base, keys.privateKey, { ...options, audience: 'another-client' }),
    jwt.sign(base, keys.privateKey, { ...options, issuer: 'https://attacker.example' }),
    jwt.sign(base, keys.privateKey, { ...options, expiresIn: -3600 }),
    jwt.sign(base, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, options),
    '',
  ];
  for (token of cases) await assert.rejects(googleCallback('code', claims.state, flow.cookie));
  assert.equal(lookup.mock.callCount(), 0);
});

test('Google cannot automatically take over an existing password account with the same email', async t => {
  const flow = googleAuthorization();
  const claims = jwt.decode(flow.cookie) as jwt.JwtPayload;
  const token = jwt.sign({ sub: 'new-subject', email: 'password@example.com', email_verified: true, nonce: claims.nonce }, keys.privateKey, {
    algorithm: 'RS256', keyid: 'audit-key', issuer: 'https://accounts.google.com', audience: env.GOOGLE_CLIENT_ID, expiresIn: 600,
  });
  t.mock.method(OAuth2Client.prototype, 'getToken', async () => ({ tokens: { id_token: token } }));
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { 'audit-key': publicKey } }));
  t.mock.method(userRepository, 'findByGoogleId', async () => null);
  t.mock.method(userRepository, 'findByEmail', async () => ({ id: randomUUID(), passwordHash: 'existing' }));
  const create = t.mock.method(userRepository, 'create', async () => ({}));
  await assert.rejects(googleCallback('code', claims.state, flow.cookie), { code: 'ACCOUNT_EXISTS' });
  assert.equal(create.mock.callCount(), 0);
});
