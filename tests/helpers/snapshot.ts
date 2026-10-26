/** Snapshot arrays have no SQL ordering contract. Preserve every row/field while
 * comparing by persistent ID, so planner order cannot look like a data change. */
export function rowsById<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}
