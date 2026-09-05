import { prisma } from '../lib/prisma';
import type { Prisma } from '../generated/prisma/client';
import { NotFoundError } from '../utils/appError';
import type { ColumnDto } from '../types/column';
import type { CreateColumnInput, UpdateColumnInput } from '../validators/columnValidators';
import { shiftPositions } from './positionShift';

/**
 * Column business logic. Authorization is enforced before these functions
 * run (requireAuth + authorizeBoard('content'/'read') for board-scoped
 * routes). Every function re-verifies that the column actually belongs to
 * the requested board so a column id from another board is a 404, never a
 * cross-board data leak.
 *
 * Deletion behavior (documented choice): deleting a column CASCADES its
 * tasks, matching the schema's onDelete: Cascade. Callers do not need a
 * "non-empty column" guard; the cascade is intentional and atomic.
 */

const columnSelect = { id: true, title: true, position: true, boardId: true, createdAt: true, updatedAt: true } as const;

/**
 * Load a column and verify it belongs to the given board. Throws 404 for a
 * missing column OR one belonging to a different board (no distinction, so
 * existence is not leaked across boards).
 */
async function getColumnForBoard(db: Prisma.TransactionClient, boardId: string, columnId: string) {
  const column = await db.column.findUnique({ where: { id: columnId }, select: columnSelect });
  if (!column || column.boardId !== boardId) {
    throw new NotFoundError('Column not found');
  }
  return column;
}

/** Append a column to the end of the board. Position is server-assigned. */
export async function createColumn(boardId: string, input: CreateColumnInput): Promise<ColumnDto> {
  return prisma.$transaction(async (tx) => {
    // Lock the board row so the count-then-create below serializes against
    // concurrent column appends to this board. Without the lock, two racing
    // creates could compute the same append position and one request would
    // fail on the (boardId, position) unique constraint instead of
    // appending at n+1.
    await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId} FOR UPDATE`;
    // count == next position because positions are kept contiguous (0..n-1).
    const position = await tx.column.count({ where: { boardId } });
    return tx.column.create({
      data: { title: input.title, position, boardId },
      select: columnSelect,
    });
  });
}

/** List a board's columns in board order. */
export async function listColumns(boardId: string): Promise<ColumnDto[]> {
  return prisma.column.findMany({ where: { boardId }, select: columnSelect, orderBy: { position: 'asc' } });
}

/** Rename a column. Position is never touched here (no move endpoint yet). */
export async function updateColumn(boardId: string, columnId: string, input: UpdateColumnInput): Promise<ColumnDto> {
  await getColumnForBoard(prisma, boardId, columnId);
  return prisma.column.update({ where: { id: columnId }, data: { title: input.title } });
}

/**
 * Delete a column and its tasks (cascade), then close the position gap so
 * the board's columns stay contiguous. Gap closing runs in the same
 * transaction as the delete. The board row is locked FOR UPDATE (the same
 * lock class column creation takes) so concurrent column appends/deletes
 * serialize before positions are read, and siblings are shifted one row at
 * a time in collision-free order (a bulk updateMany cannot guarantee
 * visitation order under the (boardId, position) unique index).
 */
export async function deleteColumn(boardId: string, columnId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId} FOR UPDATE`;
    const column = await getColumnForBoard(tx, boardId, columnId);
    await tx.column.delete({ where: { id: columnId } });
    const siblings = await tx.column.findMany({
      where: { boardId, position: { gt: column.position } },
      select: { id: true, position: true },
    });
    await shiftPositions(siblings, -1, (id, position) =>
      tx.column.update({ where: { id }, data: { position } }),
    );
  });
}
