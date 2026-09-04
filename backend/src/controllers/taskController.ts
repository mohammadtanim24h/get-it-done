import type { Request, Response, NextFunction } from 'express';
import { createTask, listTasks, getTask, updateTask, deleteTask } from '../services/taskService';
import { createTaskSchema, updateTaskSchema } from '../validators/taskValidators';
import { parseOrThrow } from '../validators/authValidators';

// HTTP concerns only. Authorization was resolved by authorizeColumn /
// authorizeTask, which attach the parent board context to req.boardAccess;
// the service re-verifies task/board consistency for taskId routes.

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(createTaskSchema, req.body);
    const task = await createTask(req.params.columnId!, input);
    res.status(201).json({ data: { task } });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tasks = await listTasks(req.params.columnId!);
    res.status(200).json({ data: { tasks } });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await getTask(req.boardAccess!.boardId, req.params.taskId!);
    res.status(200).json({ data: { task } });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(updateTaskSchema, req.body);
    const task = await updateTask(req.boardAccess!.boardId, req.params.taskId!, input);
    res.status(200).json({ data: { task } });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteTask(req.boardAccess!.boardId, req.params.taskId!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
