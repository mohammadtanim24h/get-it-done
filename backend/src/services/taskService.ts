import { prisma } from '../lib/prisma';
import type { Prisma } from '../generated/prisma/client';
import { NotFoundError } from '../utils/appError';
import type { TaskDto } from '../types/task';
import type { CreateTaskInput, UpdateTaskInput } from '../validators/taskValidators';

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
async function getTaskForBoard(db: Prisma.TransactionClient, boardId: string, taskId: string) {
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
 */
export async function deleteTask(boardId: string, taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await getTaskForBoard(tx, boardId, taskId);
    await tx.task.delete({ where: { id: taskId } });
    await tx.task.updateMany({
      where: { columnId: task.columnId, position: { gt: task.position } },
      data: { position: { decrement: 1 } },
    });
  });
}
