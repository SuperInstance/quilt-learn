/**
 * @file cells/value.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE VALUE CELL — the simplest kind
 * =====================================================================
 *
 * A value cell is a static piece of data. No dependencies, no
 * computation, no effects. Always returns the same value for any
 * caller. Used for constants, configuration, and the leaves of the
 * dependency graph.
 *
 * In the spreadsheet metaphor: a value cell is a typed number/string
 * in a cell. In the runtime metaphor: a leaf node with no incoming
 * edges. In the policy metaphor: a configuration knob.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── Cell, CallerContext, CellValue
 *        ▲
 *        │ imports
 *        │
 *     value.ts  ◄── THIS FILE: evaluateValue()
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (calls evaluateValue for kind === 'value')
 *
 * This is the simplest cell evaluator. It's the spec for what
 * "no work" looks like: synchronous, pure, context-independent.
 * Use it as a reference when writing other evaluators.
 *
 * =====================================================================
 */
/**
 * Evaluate a value cell. Trivially returns the configured value.
 *
 * Pure: same input → same output. No effects. Cached implicitly by
 * the engine's `Map<CellId, Cell>` (the cell instance itself is
 * the cache).
 *
 * @param cell - the cell instance (its `def.value` is the payload)
 * @param _ctx - the caller context (unused; values don't route)
 * @returns a ready CellValue wrapping the static value
 */
export function evaluateValue(cell, _ctx) {
    return {
        data: cell.def.value,
        status: 'ready',
        computedAt: Date.now(),
    };
}
//# sourceMappingURL=value.js.map