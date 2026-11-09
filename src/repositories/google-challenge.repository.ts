import { prisma } from '../lib/prisma.js';

export const googleChallengeRepository = {
  create: (data: { nonceHash: string; expiresAt: Date }) => prisma.nativeGoogleChallenge.create({ data }),
  find: (id: string) => prisma.nativeGoogleChallenge.findUnique({ where: { id } }),
  consume: (id: string, nonceHash: string) => prisma.nativeGoogleChallenge.deleteMany({ where: { id, nonceHash, expiresAt: { gt: new Date() } } }),
  prune: () => prisma.nativeGoogleChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
};
