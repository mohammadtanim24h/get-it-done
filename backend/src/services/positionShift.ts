/**
 * Shift ordered rows (columns within a board, tasks within a column) by
 * exactly one position each, ONE ROW AT A TIME, in a deterministic
 * collision-free order: descending original position when incrementing,
 * ascending when decrementing.
 *
 * A single bulk updateMany cannot guarantee row visitation order on
 * PostgreSQL, and the wrong order transiently collides with a
 * not-yet-moved row under the non-deferrable (parentId, position) unique
 * index — aborting the statement with a spurious constraint violation.
 * Updating row by row in the sorted order keeps every intermediate state
 * constraint-valid, the same discipline task movement uses.
 */
export async function shiftPositions(
  rows: { id: string; position: number }[],
  delta: 1 | -1,
  updateRow: (id: string, nextPosition: number) => Promise<unknown>,
): Promise<void> {
  const ordered = [...rows].sort((a, b) => (delta === 1 ? b.position - a.position : a.position - b.position));
  for (const row of ordered) {
    await updateRow(row.id, row.position + delta);
  }
}
