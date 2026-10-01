import { prisma } from '../lib/prisma.js';

export const publicUserSelect = { id: true, email: true, name: true, createdAt: true } as const;
export const userRepository = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
  findByGoogleId: (googleId: string) => prisma.user.findUnique({ where: { googleId } }),
  create: (data: { name: string; email: string; passwordHash?: string; googleId?: string }) => prisma.user.create({ data, select: publicUserSelect }),
  findPublic: (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: publicUserSelect }),
};
