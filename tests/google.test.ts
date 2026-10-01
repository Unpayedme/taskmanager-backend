import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
const { googleAuthorization, googleCallback } = await import('../src/services/google.service.js');
const { env } = await import('../src/config/env.js');

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
