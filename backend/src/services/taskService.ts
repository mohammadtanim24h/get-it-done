import { prisma } from '../lib/prisma';
import type { Prisma } from '../generated/prisma/client';
import { ConflictError, NotFoundError } from '../utils/appError';
import type { TaskDto } from '../types/task';
import type { CreateTaskInput, UpdateTaskInput } from '../validators/taskValidators';
import { shiftPositions } from './positionShift';

/**
 * Task business logic. Task access is derived from the parent column's
 * board: routes authorize through requireColumnBoardAccess /
 * requireTaskBoardAccess BEFORE reaching these functions. As defense in
 * depth, every taskId-scoped function re-verifies that the task's column
 * belongs to the board the user was authorized for, so task ids from
 * another board resolve to 404 — never to cross-board data.
 */

/**
 * Load a task and verify its column belongs to the given board. 404 for a
 * missing task OR one whose parent column lives on another board.
 */
export async function getTaskForBoard(db: Prisma.TransactionClient, boardId: string, taskId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { column: { select: { boardId: true } } },
  });
  if (!task || task.column.boardId !== boardId) {
    throw new NotFoundError('Task not found');
  }
  return task;
}

/** Append a task to the end of a column. Position is server-assigned. */
export async function createTask(columnId: string, input: CreateTaskInput): Promise<TaskDto> {
  return prisma.$transaction(async (tx) => {
    // Lock the parent column row (the same lock class taskMovementService
    // takes) so the count-then-create below serializes against concurrent
    // appends to this column and against moves that renumber it. Without
    // the lock, two racing creates could compute the same append position
    // and one request would fail on the (columnId, position) unique
    // constraint instead of appending at n+1.
    await tx.$queryRaw`SELECT id FROM "Column" WHERE id = ${columnId} FOR UPDATE`;
    // count == next position because positions are kept contiguous (0..n-1).
    const position = await tx.task.count({ where: { columnId } });
    return tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? '',
        position,
        columnId,
      },
    });
  });
}

/** List a column's tasks in column order. */
export async function listTasks(columnId: string): Promise<TaskDto[]> {
  return prisma.task.findMany({ where: { columnId }, orderBy: { position: 'asc' } });
}

/** Fetch a single task; boardId comes from the resolved authorization. */
export async function getTask(boardId: string, taskId: string): Promise<TaskDto> {
  return getTaskForBoard(prisma, boardId, taskId);
}

/**
 * Update title/description. Position is never part of the update payload,
 * so edits cannot accidentally reorder the column.
 */
export async function updateTask(boardId: string, taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
  await getTaskForBoard(prisma, boardId, taskId);
  return prisma.task.update({
    where: { id: taskId },
    data: { title: input.title, description: input.description },
  });
}

/**
 * Delete a task and close the ordering gap in its column so positions stay
 * contiguous. Gap closing runs in the same transaction as the delete.
 *
 * Uses the same locking discipline as task movement: the task's column row
 * is locked FOR UPDATE, then its location is re-read AFTER the lock. If a
 * competing move relocated the task between the pre-lock read and the lock,
 * the delete retries against its new column (bounded; exhaustion is a 409).
 * Siblings are shifted one row at a time in collision-free order — a bulk
 * updateMany cannot guarantee visitation order and can transiently violate
 * the (columnId, position) unique index.
 */
const MAX_DELETE_ATTEMPTS = 3;

export async function deleteTask(boardId: string, taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (let attempt = 0; ; attempt++) {
      const task = await getTaskForBoard(tx, boardId, taskId);
      await tx.$queryRaw`SELECT id FROM "Column" WHERE id = ${task.columnId} FOR UPDATE`;
      // Authoritative location, read after the lock is held.
      const current = await tx.task.findUnique({
        where: { id: taskId },
        select: { columnId: true, position: true },
      });
      if (!current) {
        throw new NotFoundError('Task not found');
      }
      if (current.columnId !== task.columnId) {
        if (attempt >= MAX_DELETE_ATTEMPTS - 1) {
          throw new ConflictError('Task is moving concurrently; retry the request');
        }
        continue;
      }

      await tx.task.delete({ where: { id: taskId } });
      const siblings = await tx.task.findMany({
        where: { columnId: current.columnId, position: { gt: current.position } },
        select: { id: true, position: true },
      });
      await shiftPositions(siblings, -1, (id, position) =>
        tx.task.update({ where: { id }, data: { position } }),
      );
      return;
    }
  });
}
