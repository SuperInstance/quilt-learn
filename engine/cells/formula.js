/**
 * @file cells/formula.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE FORMULA CELL — pure reactive computation
 * =====================================================================
 *
 * A formula cell evaluates a small expression that references other
 * cells by their stable ids. The runtime auto-tracks dependencies
 * (by scanning the expression for known cell ids) and recomputes
 * when any of them change.
 *
 * Pure: no effects, same input → same output (modulo caller context).
 *
 * The expression language is a tiny safe DSL — just enough to write
 * useful formulas without being Turing-complete. It supports:
 *
 *   - Cell references by id:   =a + b, =compass.heading
 *   - Math:                     =max(a, b), =clamp(x, 0, 100)
 *   - Caller context:           =caller.row > 10
 *   - String operations:        =name + ' — ' + status
 *   - Ternary:                  =x > 0 ? "positive" : "negative"
 *
 * Implementation note: we use `new Function(...)` to compile the
 * expression, then a `with (cells)` block so cell ids are directly
 * in scope. This is a tiny sandbox, NOT a security boundary.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── types
 *     context.ts ◄── contextKey (for per-context caching)
 *        ▲
 *        │ imports
 *        │
 *     formula.ts  ◄── THIS FILE: evaluateFormula()
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (calls evaluateFormula for kind === 'formula')
 *
 * =====================================================================
 *  WHY THE EXPRESSION TRANSFORMATION MATTERS
 * =====================================================================
 *
 * Cell ids can contain dots (e.g. "compass.heading"). JavaScript's
 * `with (cells) { ... }` cannot resolve `compass.heading` as a
 * single lookup — it tries `cells.compass` (undefined), then falls
 * back to global scope (ReferenceError).
 *
 * So we PRE-PROCESS the expression: replace each known cell id with
 * `cells["the.id"]` (bracket access). This way any id works,
 * including ids with dots, dashes, or special characters.
 *
 * Replacement rules:
 *   - Sort ids longest-first to avoid partial matches
 *   - Use lookbehind/lookahead to ensure we match whole tokens
 *     (not parts of longer identifiers)
 *
 * Example:
 *   Input:  =compass.heading - desired.heading
 *   Output: =cells["compass.heading"] - cells["desired.heading"]
 *
 * =====================================================================
 */
import { contextKey } from '../context.js';
/**
 * Compile a formula expression to a JavaScript function. The returned
 * function takes positional args: cells, abs, min, max, clamp, caller.
 *
 * KNOWN IDS are passed in so we can rewrite them to bracket access.
 * The function body uses `with (cells)` to make cell ids visible
 * inside the expression (after rewriting).
 *
 * Why not "use strict"? Because `with` is not allowed in strict mode.
 * The function is a tiny sandbox, not a security boundary — for
 * untrusted expressions, use a proper expression parser.
 */
function compile(expr, knownIds) {
    let body = expr.startsWith('=') ? expr.slice(1) : expr;
    // Replace known cell ids with bracket access. Sort longest-first
    // so that 'compass.heading' replaces before 'compass'.
    const sortedIds = Array.from(knownIds).sort((a, b) => b.length - a.length);
    for (const id of sortedIds) {
        const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match `id` as a whole token — not part of a longer identifier.
        // \b doesn't work for ids with dots, so we use lookbehind/lookahead.
        const re = new RegExp(`(?<![A-Za-z0-9_])${safe}(?![A-Za-z0-9_])`, 'g');
        body = body.replace(re, `cells[${JSON.stringify(id)}]`);
    }
    // eslint-disable-next-line no-new-func
    return new Function('cells', 'abs', 'min', 'max', 'clamp', 'caller', `with (cells) { return (${body}); }`);
}
// Helper functions exposed to formula bodies. Defined as constants so
// the compiler can reference them in the function call.
const helperAbs = (n) => Math.abs(n);
const helperMin = (...n) => Math.min(...n);
const helperMax = (...n) => Math.max(...n);
const helperClamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
/**
 * Evaluate a formula cell.
 *
 * Steps:
 *   1. Check per-context cache (same context → return cached value)
 *   2. Build a cells proxy from all known cells
 *   3. Compile the expression (with id rewriting)
 *   4. Call the compiled function with the proxy + helpers
 *   5. Cache the result and return
 *
 * Per-context caching means: if the same cell is called with the
 * same row/column/identity, the cached value is returned without
 * recomputation. This is the "caller-aware memoization" that makes
 * routing cheap.
 *
 * @param cell - the cell instance
 * @param ctx - the caller context (used for cache key)
 * @param allCells - the full cell map (for expression evaluation)
 * @returns the computed value, or an error CellValue if the formula threw
 */
export function evaluateFormula(cell, ctx, allCells) {
    if (!cell.def.expr) {
        return { data: undefined, status: 'error', error: { message: 'formula cell has no expr' } };
    }
    // Per-context cache check
    const key = contextKey(ctx);
    const cached = cell.contextCache.get(key);
    if (cached && cached.status === 'ready' && !cell.value.error) {
        return cached;
    }
    try {
        // Build a Record of all cell values for the formula to access.
        // We use a Proxy so any property access returns the value if it
        // exists, otherwise undefined (no thrown errors for missing cells).
        const cellValues = {};
        for (const [id, other] of allCells) {
            cellValues[id] = other.value.data;
        }
        const cellProxy = new Proxy(cellValues, {
            get(target, prop) {
                if (typeof prop === 'string' && prop in target) {
                    return target[prop];
                }
                return undefined;
            },
            has(target, prop) {
                if (typeof prop === 'string')
                    return prop in target;
                return false;
            },
        });
        const fn = compile(cell.def.expr, allCells.keys());
        const result = fn(cellProxy, helperAbs, helperMin, helperMax, helperClamp, ctx);
        const value = {
            data: result,
            status: 'ready',
            computedAt: Date.now(),
        };
        cell.contextCache.set(key, value);
        // PLAY-TEST PATCH 9: persist the computed value on the cell itself.
        // Previously only the per-context cache held the result, so a pull
        // left cell.value idle — and the eager-propagation path (which reads
        // cell.value to derive the listener's `prev`) saw no previous value on
        // the first set after a pull. Listeners missed the first real crossing
        // of any threshold. With this, a pull seeds the graph: prev is the last
        // value the cell actually produced.
        cell.value = value;
        return value;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (process.env.QUILT_DEBUG) {
            console.error(`[quilt] formula ${cell.id} failed:`, err);
        }
        return { data: undefined, status: 'error', error: { message } };
    }
}
//# sourceMappingURL=formula.js.map