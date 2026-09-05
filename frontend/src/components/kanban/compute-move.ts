import type { ColumnWithTasks } from '@/types/models';

export interface MoveIntent {
  taskId: string;
  targetColumnId: string;
  /** Zero-based final index in the target column (docs/API.md). */
  targetPosition: number;
}

/**
 * Translates a dnd-kit drag end into a move API request, or null when the
 * drop is a no-op (dropped on nothing, on itself, or back into place).
 *
 * `overId` is either a task id (dropped onto a card) or a column id
 * (dropped onto the column body — the only possibility for an empty
 * column). Backend range rules: same-column moves accept `0..n-1`,
 * cross-column moves accept `0..m` (append).
 */
export function computeMoveIntent(
  columns: ColumnWithTasks[],
  activeId: string,
  overId: string,
): MoveIntent | null {
  const source = columns.find((c) => c.tasks.some((task) => task.id === activeId));
  if (!source) return null;
  const sourceIndex = source.tasks.findIndex((task) => task.id === activeId);

  // Dropped onto a column body.
  const overColumn = columns.find((c) => c.id === overId);
  if (overColumn) {
    if (overColumn.id === source.id) {
      // Own column body = drop at the end; index must stay within 0..n-1.
      const targetPosition = source.tasks.length - 1;
      return targetPosition === sourceIndex
        ? null
        : { taskId: activeId, targetColumnId: source.id, targetPosition };
    }
    return {
      taskId: activeId,
      targetColumnId: overColumn.id,
      targetPosition: overColumn.tasks.length,
    };
  }

  // Dropped onto a task card.
  const destination = columns.find((c) => c.tasks.some((task) => task.id === overId));
  if (!destination) return null;
  const overIndex = destination.tasks.findIndex((task) => task.id === overId);

  if (destination.id === source.id) {
    // Same column: hovering task k means "take k's slot" (arrayMove
    // semantics), which is the dragged task's final index.
    return overIndex === sourceIndex
      ? null
      : { taskId: activeId, targetColumnId: source.id, targetPosition: overIndex };
  }
  // Cross column: insert at the hovered task's index (dragged task not in
  // the destination list yet, so 0..m is respected).
  return { taskId: activeId, targetColumnId: destination.id, targetPosition: overIndex };
}
