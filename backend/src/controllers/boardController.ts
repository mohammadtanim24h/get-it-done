import type { Request, Response, NextFunction } from 'express';
import {
  createBoard,
  listBoards,
  getBoard,
  updateBoard,
  deleteBoard,
  addBoardMember,
  removeBoardMember,
} from '../services/boardService';
import {
  createBoardSchema,
  updateBoardSchema,
  addBoardMemberSchema,
} from '../validators/boardValidators';
import { parseOrThrow } from '../validators/authValidators';

// HTTP concerns only: validate at the boundary, delegate to the service,
// and map results to stable response shapes ({ data: ... } / status codes).
// Identity comes from requireAuth (req.user) and board access from
// authorizeBoard (req.boardAccess) — never from client input.

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(createBoardSchema, req.body);
    const board = await createBoard(req.user!.id, input);
    res.status(201).json({ data: { board } });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const boards = await listBoards(req.user!.id);
    res.status(200).json({ data: { boards } });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const board = await getBoard(req.params.boardId!, req.user!.id);
    res.status(200).json({ data: { board } });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(updateBoardSchema, req.body);
    const board = await updateBoard(req.params.boardId!, req.user!.id, input);
    res.status(200).json({ data: { board } });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteBoard(req.params.boardId!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(addBoardMemberSchema, req.body);
    const member = await addBoardMember(req.params.boardId!, input);
    res.status(201).json({ data: { member } });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await removeBoardMember(req.params.boardId!, req.params.userId!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
