import type { Prisma, Task } from '../generated/prisma/client.js';
import type { CreateTaskInput, UpdateTaskInput, ListTaskInput } from '../schema/task.schema.js';
import { taskRepository } from '../repositories/task.repository.js';
import { AppError } from '../utils/errors.js';

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const todayDate = (today?: string) => asDate(today ?? new Date().toISOString().slice(0, 10));
const serialize = (task: Task) => ({ ...task, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null });

export async function listTasks(userId: string, query: ListTaskInput) {
  const where: Prisma.TaskWhereInput = { userId };
  if (query.status) where.status = query.status;
  if (query.search) where.OR = [
    { title: { contains: query.search, mode: 'insensitive' } },
    { description: { contains: query.search, mode: 'insensitive' } },
  ];
  const today = todayDate(query.today);
  if (query.due === 'today') where.dueDate = today;
  if (query.due === 'upcoming') where.dueDate = { gte: today };
  if (query.due === 'overdue') { where.dueDate = { lt: today }; where.status = 'PENDING'; }
  if (query.due === 'none') where.dueDate = null;
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = query.sort === 'due'
    ? [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }]
    : query.sort === 'title' ? [{ title: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }];
  const [tasks, total] = await taskRepository.list(where, orderBy, (query.page - 1) * query.limit, query.limit);
  return { tasks: tasks.map(serialize), total, page: query.page, limit: query.limit, pages: Math.ceil(total / query.limit) };
}

export async function taskStats(userId: string, today?: string) {
  const [total, pending, completed, overdue, dueToday] = await taskRepository.stats(userId, todayDate(today));
  return { total, pending, completed, overdue, dueToday };
}

export async function getTask(userId: string, id: string) {
  const task = await taskRepository.find(id, userId);
  if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found.');
  return serialize(task);
}

export async function createTask(userId: string, input: CreateTaskInput) {
  return serialize(await taskRepository.create({ ...input, userId, dueDate: input.dueDate ? asDate(input.dueDate) : null }));
}

export async function updateTask(userId: string, id: string, input: UpdateTaskInput) {
  const data = { ...input, ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? asDate(input.dueDate) : null } : {}) };
  const [task] = await taskRepository.update(id, userId, data);
  if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found.');
  return serialize(task);
}

export async function deleteTask(userId: string, id: string) {
  if ((await taskRepository.delete(id, userId)).count !== 1) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found.');
}
