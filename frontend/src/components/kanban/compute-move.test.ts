import { describe, expect, it } from 'vitest';
import { computeMoveIntent } from './compute-move';
import type { ColumnWithTasks, Task } from '@/types/models';

function task(id: string, columnId: string, position: number): Task {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    position,
    columnId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function column(id: string, tasks: Task[]): ColumnWithTasks {
  return {
    id,
    title: `Column ${id}`,
    position: 0,
    boardId: 'b1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tasks,
  };
}

// a(0) b(1) c(2) | x(0) y(1)
const board = [
  column('c1', [task('a', 'c1', 0), task('b', 'c1', 1), task('c', 'c1', 2)]),
  column('c2', [task('x', 'c2', 0), task('y', 'c2', 1)]),
];

describe('computeMoveIntent', () => {
  it('same column: first -> last via the last card', () => {
    expect(computeMoveIntent(board, 'a', 'c')).toEqual({
      taskId: 'a',
      targetColumnId: 'c1',
      targetPosition: 2,
    });
  });

  it('same column: last -> first via the first card', () => {
    expect(computeMoveIntent(board, 'c', 'a')).toEqual({
      taskId: 'c',
      targetColumnId: 'c1',
      targetPosition: 0,
    });
  });

  it('same column: dropping over a later card uses that card index as final index', () => {
    expect(computeMoveIntent(board, 'a', 'b')).toEqual({
      taskId: 'a',
      targetColumnId: 'c1',
      targetPosition: 1,
    });
  });

  it('cross column: insert at hovered card index', () => {
    expect(computeMoveIntent(board, 'a', 'y')).toEqual({
      taskId: 'a',
      targetColumnId: 'c2',
      targetPosition: 1,
    });
  });

  it('cross column: onto a column body appends at the end', () => {
    expect(computeMoveIntent(board, 'a', 'c2')).toEqual({
      taskId: 'a',
      targetColumnId: 'c2',
      targetPosition: 2,
    });
  });

  it('empty column: dropping onto it appends at position 0', () => {
    const withEmpty = [...board, column('c3', [])];
    expect(computeMoveIntent(withEmpty, 'a', 'c3')).toEqual({
      taskId: 'a',
      targetColumnId: 'c3',
      targetPosition: 0,
    });
  });

  it('own column body: moves to end within 0..n-1', () => {
    expect(computeMoveIntent(board, 'a', 'c1')).toEqual({
      taskId: 'a',
      targetColumnId: 'c1',
      targetPosition: 2,
    });
  });

  it('returns null when the drop is a no-op', () => {
    // onto itself
    expect(computeMoveIntent(board, 'b', 'b')).toBeNull();
    // already in place (last card over own column body)
    expect(computeMoveIntent(board, 'c', 'c1')).toBeNull();
    // unknown drop target
    expect(computeMoveIntent(board, 'a', 'nope')).toBeNull();
    // unknown drag source
    expect(computeMoveIntent(board, 'nope', 'a')).toBeNull();
  });
});
