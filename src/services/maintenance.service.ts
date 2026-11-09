import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { googleChallengeRepository } from '../repositories/google-challenge.repository.js';

// Keep revoked-token tombstones until expiration so replay detection remains effective.
export const pruneExpiredSessions = (now = new Date()) => prisma.refreshSession.deleteMany({ where: { expiresAt: { lt: now } } });

export function startSessionMaintenance() {
  let running = false;
  const cleanup = async () => {
    if (running) return;
    running = true;
    try { await pruneExpiredSessions(); await googleChallengeRepository.prune(); }
    catch { console.error('Expired-session cleanup failed.'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void cleanup(); }, env.SESSION_CLEANUP_MINUTES * 60000);
  timer.unref();
  void cleanup();
  return () => clearInterval(timer);
}
