/**
 * @file cells/listener.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE LISTENER CELL — delta-triggered execution
 * =====================================================================
 *
 * A listener cell watches other cells. When a watched cell's value
 * changes AND the optional `condition` is true, the listener fires
 * its `action` (typically a program cell that does something — send
 * an alert, write to a database, call an API, etc.).
 *
 * Listeners are how reactive systems take action on change. They're
 * the "if X happens, do Y" primitive.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts    ◄── types
 *     context.ts  ◄── evalWhen, emptyContext
 *        ▲
 *        │ imports
 *        │
 *     listener.ts  ◄── THIS FILE: fireListener()
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (calls fireListener from propagate())
 *
 * The listener doesn't have an "evaluate" function like other cells.
 * It's triggered by the engine's reactive propagation — when a
 * dependency changes, the engine calls `fireListener` for each
 * dependent listener cell.
 *
 * =====================================================================
 *  HOW THE TRIGGER WORKS
 * =====================================================================
 *
 *   [value cell: temperature]
 *          │
 *          │ changes from 20 to 25
 *          ▼
 *   engine.propagate('temperature')
 *          │
 *          │ for each dependent:
 *          ▼
 *   if (cell.kind === 'listener') engine.fireListener(cell, 'temperature', new, old)
 *          │
 *          │ eval condition in context { changed, prev, current }
 *          ▼
 *   if (condition met) runtime.call(action, { changed, value })
 *
 * The `action` is typically a program cell id, but it could be any
 * callable cell. Listeners are how the grid can act on change.
 *
 * =====================================================================
 */
import type { Cell, CellValue, CellId } from '../types.js';
import type { ProgramRuntime } from './program.js';
/**
 * Fire a listener cell if its condition is met.
 *
 * Steps:
 *   1. Check that the changed cell is in the listener's `watch` list
 *   2. Build a context with `{ changed, prev, current }` metadata
 *   3. Evaluate the optional `condition` in that context
 *   4. If the condition is met, call the `action` cell with the new value
 *
 * @param cell - the listener cell to fire
 * @param changedCellId - the cell that changed
 * @param newValue - the cell's new value
 * @param prevValue - the cell's previous value
 * @param runtime - the runtime handle (used to call the action)
 * @returns true if the listener fired, false otherwise
 */
export declare function fireListener(cell: Cell, changedCellId: CellId, newValue: CellValue, prevValue: CellValue, runtime: ProgramRuntime): Promise<boolean>;
//# sourceMappingURL=listener.d.ts.map