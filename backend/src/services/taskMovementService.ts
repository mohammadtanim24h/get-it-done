import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../utils/appError';
import { getTaskForBoard } from './taskService';
import type { TaskDto } from '../types/task';
import type { MoveTaskInput } from '../validators/taskValidators';
import { shiftPositions } from './positionShift';

/**
 * Task movement business logic.
 *
 * The whole move runs in ONE interactive transaction:
 *
 * 1. Resolve the target column and re-verify it belongs to the board the
 *    user was authorized for (404 otherwise).
 * 2. Resolve the source task and lock the affected Column rows with
 *    SELECT ... FOR UPDATE, acquired in a deterministic order (sorted by
 *    id) so concurrent moves always lock columns in the same global
 *    order — no deadlocks, and racing moves on shared columns serialize.
 *    The task's location is re-derived from a read taken AFTER the locks
 *    are held; if a competing move relocated the task between the
 *    pre-lock read and the lock, the move retries against the task's
 *    fresh column, up to a bounded number of attempts.
 * 3. Read authoritative task positions AFTER the lock is held.
 * 4. Park the moved task at PARKING_POSITION (-1) — impossible for real
 *    data (positions are >= 0) and impossible to collide with (both
 *    column rows are locked) — then shift sibling rows with ordered
 *    single-row updates (descending original position when incrementing,
 *    ascending when decrementing, because bulk updates cannot guarantee
 *    constraint-safe visitation order on PostgreSQL) and finally write
 *    the task's real position. Every intermediate state satisfies the
 *    (columnId, position) unique constraint, so no deferrable
 *    constraints are needed.
 *
 * Out-of-range targetPosition is REJECTED (400), not clamped:
 * same-column moves accept 0..n-1, cross-column moves accept 0..m.
 */

// Maximum lock-then-verify rounds before giving up. Each round uses the
// task's freshest column; a relocation between read and lock triggers a
// retry. Exhausting the budget means extreme contention: 409.
const MAX_MOVE_ATTEMPTS = 3;

// Sentinel position used while sibling rows shift. See header comment.
const PARKING_POSITION = -1;

export interface ColumnTaskOrderDto {
  id: string;
  position: number;
}

export interface ColumnOrderDto {
  id: string;
  tasks: ColumnTaskOrderDto[];
}

export interface MoveTaskResult {
  task: TaskDto;
  sourceColumn: ColumnOrderDto;
  destinationColumn: ColumnOrderDto;
}

/**
 * Lock the given columns FOR UPDATE in deterministic (sorted by id) order.
 * Raw SQL is confined to this transaction-scoped lock query; everything
 * else uses the standard Prisma API.
 */
async function lockColumns(db: Prisma.TransactionClient, columnIds: string[]): Promise<void> {
  const ids = [...new Set(columnIds)].sort();
  await db.$queryRaw`SELECT id FROM "Column" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

/**
 * Shift affected sibling tasks by exactly one position each, one row at a
 * time in a collision-free order (see positionShift.ts for why a bulk
 * updateMany is unsafe under the (columnId, position) unique constraint).
 */
async function shiftTasks(
  tx: Prisma.TransactionClient,
  tasks: { id: string; position: number }[],
  delta: 1 | -1,
): Promise<void> {
  await shiftPositions(tasks, delta, (id, position) => tx.task.update({ where: { id }, data: { position } }));
}

const orderDto = (columnId: string, tasks: { id: string; position: number }[]): ColumnOrderDto => ({
  id: columnId,
  tasks: tasks.map((t) => ({ id: t.id, position: t.position })),
});

export async function moveTask(boardId: string, taskId: string, input: MoveTaskInput): Promise<MoveTaskResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Resolve + re-verify the target column's parentage (defense in
    //    depth against cross-board ids). 404 for a foreign column. The
    //    target column id comes from the request, not racy state, so this
    //    check can run before any locking.
    const targetColumn = await tx.column.findUnique({
      where: { id: input.targetColumnId },
      select: { boardId: true },
    });
    if (!targetColumn || targetColumn.boardId !== boardId) {
      throw new NotFoundError('Column not found');
    }

    for (let attempt = 0; ; attempt++) {
      const task = await getTaskForBoard(tx, boardId, taskId);
      const sourceColumnId = task.columnId;

      // 2. Serialize against other moves touching these columns.
      await lockColumns(tx, [sourceColumnId, input.targetColumnId]);

      // 3. Authoritative positions, read AFTER the lock is held. The task
      //    must still be in the column we just locked — if a competing move
      //    relocated it between our read and the lock, retry with its new
      //    location.
      const sourceTasks = await tx.task.findMany({
        where: { columnId: sourceColumnId },
        orderBy: { position: 'asc' },
      });
      const current = sourceTasks.find((t) => t.id === taskId);
      if (!current) {
        if (attempt >= MAX_MOVE_ATTEMPTS - 1) {
          throw new ConflictError('Task is moving concurrently; retry the request');
        }
        continue;
      }
      const from = current.position;

      if (sourceColumnId === input.targetColumnId) {
        // Same column: final positions must be 0..n-1.
        if (input.targetPosition >= sourceTasks.length) {
          throw new ValidationError(
            `targetPosition must be between 0 and ${sourceTasks.length - 1} for this column`,
          );
        }
        const to = input.targetPosition;
        if (from !== to) {
          await tx.task.update({ where: { id: taskId }, data: { position: PARKING_POSITION } });
          if (from < to) {
            // Close the gap left by the task, open one at the target.
            await shiftTasks(
              tx,
              sourceTasks.filter((t) => t.position > from && t.position <= to),
              -1,
            );
          } else {
            // Open a slot at the target, absorb the task's old slot.
            await shiftTasks(
              tx,
              sourceTasks.filter((t) => t.position >= to && t.position < from),
              1,
            );
          }
          await tx.task.update({ where: { id: taskId }, data: { position: to } });
        }
      } else {
        // Cross column: valid insert positions are 0..m in the destination.
        const destinationTasks = await tx.task.findMany({
          where: { columnId: input.targetColumnId },
          orderBy: { position: 'asc' },
        });
        if (input.targetPosition > destinationTasks.length) {
          throw new ValidationError(
            `targetPosition must be between 0 and ${destinationTasks.length} for this column`,
          );
        }
        // Park the task in the destination column, off the real position grid.
        await tx.task.update({
          where: { id: taskId },
          data: { columnId: input.targetColumnId, position: PARKING_POSITION },
        });
        // Compact the source column.
        await shiftTasks(
          tx,
          sourceTasks.filter((t) => t.position > from),
          -1,
        );
        // Open a slot at the target position.
        await shiftTasks(
          tx,
          destinationTasks.filter((t) => t.position >= input.targetPosition),
          1,
        );
        await tx.task.update({ where: { id: taskId }, data: { position: input.targetPosition } });
      }

      // 4. Response: moved task + final ordering of both affected columns.
      const moved = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      const finalSource = await tx.task.findMany({
        where: { columnId: sourceColumnId },
        orderBy: { position: 'asc' },
      });
      const finalDestination = await tx.task.findMany({
        where: { columnId: input.targetColumnId },
        orderBy: { position: 'asc' },
      });

      return {
        task: moved,
        sourceColumn: orderDto(sourceColumnId, finalSource),
        destinationColumn: orderDto(input.targetColumnId, finalDestination),
      };
    }
  });
}
