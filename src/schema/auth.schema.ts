import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, 'Use at least 10 characters').max(128);
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80), email, password,
}).strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
