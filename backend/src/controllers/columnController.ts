import type { Request, Response, NextFunction } from 'express';
import { createColumn, listColumns, updateColumn, deleteColumn } from '../services/columnService';
import { createColumnSchema, updateColumnSchema } from '../validators/columnValidators';
import { parseOrThrow } from '../validators/authValidators';

// HTTP concerns only: validate at the boundary, delegate to the service,
// and map results to stable response shapes. Access was resolved by
// authorizeBoard; the service still verifies column/board consistency.

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(createColumnSchema, req.body);
    const column = await createColumn(req.params.boardId!, input);
    res.status(201).json({ data: { column } });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const columns = await listColumns(req.params.boardId!);
    res.status(200).json({ data: { columns } });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(updateColumnSchema, req.body);
    const column = await updateColumn(req.params.boardId!, req.params.columnId!, input);
    res.status(200).json({ data: { column } });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteColumn(req.params.boardId!, req.params.columnId!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
