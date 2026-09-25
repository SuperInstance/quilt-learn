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
import type { Cell, CellValue, CallerContext, CellId } from '../types.js';
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
export declare function evaluateFormula(cell: Cell, ctx: CallerContext, allCells: Map<CellId, Cell>): CellValue;
//# sourceMappingURL=formula.d.ts.map