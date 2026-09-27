// Undo/redo over snapshots (tag picker mode). record() after every change:
// a snapshot equal to the current one is ignored, a new one drops what
// could be redone, and merge replaces the current entry (one slider drag is
// one step). The oldest entries go beyond `limit`.
export interface UndoHistory<T> {
  reset(snapshot: T): void;
  record(snapshot: T, options?: { merge?: boolean }): boolean;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  // The snapshots an undo / a redo would leave and reach, or null.
  peekUndo(): { from: T; to: T } | null;
  peekRedo(): { from: T; to: T } | null;
}

export function createUndoHistory<T>(limit: number, key: (snapshot: T) => string): UndoHistory<T> {
  if (!Number.isInteger(limit) || limit < 2) throw new RangeError(`createUndoHistory: limit must be an integer >= 2, got ${limit}`);
  let entries: T[] = [];
  let index = -1;

  return {
    reset(snapshot) {
      entries = [snapshot];
      index = 0;
    },
    record(snapshot, { merge = false } = {}) {
      if (index < 0) throw new Error("createUndoHistory: record() before reset()");
      if (key(snapshot) === key(entries[index])) return false;
      entries = entries.slice(0, index + 1);
      if (merge && index > 0) entries[index] = snapshot;
      else entries.push(snapshot);
      if (entries.length > limit) entries = entries.slice(entries.length - limit);
      index = entries.length - 1;
      return true;
    },
    undo() {
      if (index <= 0) return null;
      index -= 1;
      return entries[index];
    },
    redo() {
      if (index >= entries.length - 1) return null;
      index += 1;
      return entries[index];
    },
    canUndo: () => index > 0,
    canRedo: () => index >= 0 && index < entries.length - 1,
    peekUndo: () => (index > 0 ? { from: entries[index], to: entries[index - 1] } : null),
    peekRedo: () => (index >= 0 && index < entries.length - 1 ? { from: entries[index], to: entries[index + 1] } : null),
  };
}
