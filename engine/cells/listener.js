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
import { evalWhen, emptyContext } from '../context.js';
/** Monotonic counter for unique event-context keys (play-test fix). */
let evtCounter = 0;
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
export async function fireListener(cell, changedCellId, newValue, prevValue, runtime) {
    if (!cell.def.watch?.length)
        return false;
    if (!cell.def.watch.includes(changedCellId))
        return false;
    const ctx = emptyContext();
    ctx.caller = cell.id;
    ctx.metadata = { changed: changedCellId, prev: prevValue.data, current: newValue.data };
    if (cell.def.condition && !evalWhen(cell.def.condition, ctx)) {
        return false;
    }
    // Fire the action. The action is treated as a program call (or
    // any callable cell). Future: also support webhooks and MCP tools
    // as actions.
    //
    // PLAY-TEST FIX: the action is invoked with a FRESH event context on
    // every fire. Previously runtime.call used a default empty context,
    // which meant (a) the per-context memoization cache served the FIRST
    // fire's result forever (listener-driven state machines ran exactly
    // once), and (b) the action could not see changed/prev/current via
    // caller.metadata. The event context carries a unique `row` key per
    // fire, which both busts the cache and exposes the event payload.
    if (cell.def.action) {
        evtCounter += 1;
        const evtCtx = emptyContext();
        evtCtx.caller = cell.id;
        evtCtx.row = `evt-${Date.now()}-${evtCounter}`;
        evtCtx.metadata = { changed: changedCellId, prev: prevValue.data, current: newValue.data };
        await runtime.call(cell.def.action, { changed: changedCellId, value: newValue.data }, evtCtx);
    }
    return true;
}
//# sourceMappingURL=listener.js.map