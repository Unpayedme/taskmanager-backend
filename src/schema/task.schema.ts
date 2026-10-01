import { z } from 'zod';

export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date');

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  status: z.enum(['PENDING', 'COMPLETED']).default('PENDING'),
  dueDate: dateOnly.nullable().optional(),
}).strict();
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(['PENDING', 'COMPLETED']).optional(),
  dueDate: dateOnly.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
export const taskIdSchema = z.string().uuid();
export const listTaskSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['PENDING', 'COMPLETED']).optional(),
  due: z.enum(['today', 'upcoming', 'overdue', 'none']).optional(),
  today: dateOnly.optional(),
  sort: z.enum(['created', 'due', 'title']).default('created'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTaskInput = z.infer<typeof listTaskSchema>;
