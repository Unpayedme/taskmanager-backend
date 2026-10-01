import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export const taskRepository = {
  create: (data: Prisma.TaskUncheckedCreateInput) => prisma.task.create({ data }),
  find: (id: string, userId: string) => prisma.task.findFirst({ where: { id, userId } }),
  list: (where: Prisma.TaskWhereInput, orderBy: Prisma.TaskOrderByWithRelationInput[], skip: number, take: number) => prisma.$transaction([
    prisma.task.findMany({ where, orderBy, skip, take }), prisma.task.count({ where }),
  ]),
  update: (id: string, userId: string, data: Prisma.TaskUpdateManyMutationInput) => prisma.task.updateManyAndReturn({ where: { id, userId }, data }),
  delete: (id: string, userId: string) => prisma.task.deleteMany({ where: { id, userId } }),
  async stats(userId: string, today: Date) {
    return prisma.$transaction([
      prisma.task.count({ where: { userId } }),
      prisma.task.count({ where: { userId, status: 'PENDING' } }),
      prisma.task.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.task.count({ where: { userId, status: 'PENDING', dueDate: { lt: today } } }),
      prisma.task.count({ where: { userId, status: 'PENDING', dueDate: today } }),
    ]);
  },
};
