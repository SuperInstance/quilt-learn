/**
 * @file context.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  CALLER CONTEXT PROPAGATION
 * =====================================================================
 *
 * This file is the heart of "caller-aware" — the primitive that no
 * other tool has. Every cell call carries a `CallerContext` (row,
 * column, identity, trace). As the call descends into the dependency
 * graph, the context extends: the trace accumulates, the caller
 * pointer shifts.
 *
 * A cell can read the context and route on it. `if caller.row > 10
 * then use Model A` is the canonical example. This is what makes
 * the grid a *policy mesh* — position is metadata.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── CallerContext, CellId (just types)
 *        ▲
 *        │ imports
 *        │
 *     context.ts  ◄── THIS FILE: build, extend, hash, eval-on-context
 *        ▲
 *        │ imports
 *        │
 *     engine.ts        (extends context on every call, caches by key)
 *     cells/router.ts  (uses evalWhen to pick rules)
 *     cells/program.ts (passes context as a parameter)
 *     cells/api.ts     (uses context for URL substitution)
 *
 * =====================================================================
 *  KEY DESIGN DECISIONS
 * =====================================================================
 *
 * 1. CONTEXT IS IMMUTABLE PER CALL
 *    The engine extends the context as it descends, but never mutates
 *    an existing context. Each cell receives a fresh, complete
 *    snapshot of who called and from where.
 *
 * 2. CACHE KEY = HASH OF RELEVANT FIELDS
 *    Same cell + same context → same cached value. The key is built
 *    from row, column, caller, identity, and tags. The engine uses
 *    this for per-context memoization.
 *
 * 3. evalWhen IS A TINY DSL, NOT A FULL LANGUAGE
 *    The `when` expression in router rules and listener conditions
 *    is evaluated with `new Function('caller', expr)`. This gives
 *    us a familiar JS-like syntax without pulling in a parser. The
 *    security model is "trust the author of the sheet" — for
 *    untrusted sheets, use a proper expression language.
 *
 * =====================================================================
 */
import type { CallerContext, CellId } from './types.js';
/**
 * Build a default empty context. The engine fills in `trace` and
 * `timestamp`. Callers add `row`, `column`, `identity`, etc.
 */
export declare function emptyContext(): CallerContext;
/**
 * Extend a context as we descend into a dependency. The trace is
 * preserved (ancestors), the caller becomes the previous cell, and
 * we can attach row/column if the dep is in a specific position.
 *
 * USAGE:
 *   When the engine evaluates cell B which depends on A, it calls
 *   `extendContext(parentCtx, 'A', { row: B.row, column: B.col })`.
 *   A then sees B as its caller, and B's row/column as its position.
 *
 * @param parent - the context from the calling cell
 * @param childId - the id of the cell being entered
 * @param extra - optional overrides (row, column, identity, etc.)
 * @returns a fresh CallerContext for the child cell
 */
export declare function extendContext(parent: CallerContext, childId: CellId, extra?: Partial<CallerContext>): CallerContext;
/**
 * A stable cache key for caller-aware memoization. Same cell, same
 * context (by relevant fields) → same cached value.
 *
 * Fields included: row, column, caller, identity.id, identity.tags.
 * Fields excluded: metadata (too volatile), timestamp (always new).
 *
 * The `<default>` sentinel is used when no relevant fields are set,
 * so that "no context" calls still cache.
 */
export declare function contextKey(ctx: CallerContext): string;
/**
 * Evaluate a small router expression in a context. Supports a tiny DSL:
 *
 *   caller.row > 10
 *   caller.column == "J"
 *   caller.identity.tags contains "premium"
 *   caller.row > 10 && caller.column != "A"
 *
 * How it works:
 *   1. The `caller` object is built from the relevant CallerContext fields.
 *   2. The expression is compiled with `new Function('caller', ...)`.
 *   3. Special syntax `X contains "Y"` is rewritten to `Array.isArray(X) && X.includes("Y")`.
 *
 * SECURITY: This executes arbitrary JS in the current process. In a
 * production deployment with untrusted sheets, replace this with a
 * proper expression parser (jsep, expr-eval, etc.) that restricts
 * the language.
 *
 * @param when - the expression to evaluate
 * @param ctx - the caller context
 * @returns true if the expression evaluates truthy, false otherwise
 */
export declare function evalWhen(when: string, ctx: CallerContext): boolean;
/**
 * PLAY-TEST PATCH 10: stable cache key for effectful calls that take input.
 * contextKey() alone ignores `input`, so runtime.call(id, a) and
 * runtime.call(id, b) collided on the same context and the second call was
 * served the first call's memoized result. A program is a function of its
 * arguments; the cache key must be too.
 */
export declare function stableJson(v: unknown): string;
export declare function callKey(ctx: CallerContext, input: unknown): string;
//# sourceMappingURL=context.d.ts.map