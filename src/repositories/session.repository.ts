import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export const sessionRepository = {
  create: (data: Prisma.RefreshSessionUncheckedCreateInput) => prisma.refreshSession.create({ data }),
  find: (id: string) => prisma.refreshSession.findUnique({ where: { id } }),
  revokeFamily: (familyId: string, userId: string) => prisma.refreshSession.updateMany({
    where: { familyId, userId, revokedAt: null }, data: { revokedAt: new Date() },
  }),
  async rotate(id: string, hash: string, data: Prisma.RefreshSessionUncheckedCreateInput) {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshSession.updateMany({
        where: { id, tokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) return false;
      await tx.refreshSession.create({ data });
      return true;
    });
  },
};
