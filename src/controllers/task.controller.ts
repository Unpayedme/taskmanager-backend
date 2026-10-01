import type { RequestHandler } from 'express';
import { createTaskSchema, updateTaskSchema, listTaskSchema, taskIdSchema, dateOnly } from '../schema/task.schema.js';
import * as tasks from '../services/task.service.js';

export const list: RequestHandler = async (req, res) => { res.json(await tasks.listTasks(req.auth!.userId, listTaskSchema.parse(req.query))); };
export const stats: RequestHandler = async (req, res) => { res.json(await tasks.taskStats(req.auth!.userId, dateOnly.optional().parse(req.query.today))); };
export const get: RequestHandler = async (req, res) => { res.json({ task: await tasks.getTask(req.auth!.userId, taskIdSchema.parse(req.params.id)) }); };
export const create: RequestHandler = async (req, res) => { res.status(201).json({ task: await tasks.createTask(req.auth!.userId, createTaskSchema.parse(req.body)) }); };
export const update: RequestHandler = async (req, res) => { res.json({ task: await tasks.updateTask(req.auth!.userId, taskIdSchema.parse(req.params.id), updateTaskSchema.parse(req.body)) }); };
export const remove: RequestHandler = async (req, res) => { await tasks.deleteTask(req.auth!.userId, taskIdSchema.parse(req.params.id)); res.status(204).end(); };
