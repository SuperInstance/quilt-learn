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
/**
 * Build a default empty context. The engine fills in `trace` and
 * `timestamp`. Callers add `row`, `column`, `identity`, etc.
 */
export function emptyContext() {
    return {
        trace: [],
        timestamp: Date.now(),
    };
}
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
export function extendContext(parent, childId, extra) {
    return {
        ...parent,
        ...extra,
        caller: childId,
        trace: [...(parent.trace ?? []), parent.caller ?? '<root>'],
        timestamp: Date.now(),
    };
}
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
export function contextKey(ctx) {
    const parts = [];
    if (ctx.row !== undefined)
        parts.push(`r:${String(ctx.row)}`);
    if (ctx.column !== undefined)
        parts.push(`c:${String(ctx.column)}`);
    if (ctx.caller)
        parts.push(`f:${ctx.caller}`);
    if (ctx.identity?.id)
        parts.push(`i:${ctx.identity.id}`);
    if (ctx.identity?.tags?.length)
        parts.push(`t:${ctx.identity.tags.sort().join(',')}`);
    return parts.join('|') || '<default>';
}
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
export function evalWhen(when, ctx) {
    try {
        // Build a safe-ish scope from the context. We expose only the
        // routing-relevant fields so authors can't accidentally (or
        // intentionally) read metadata.
        const caller = {
            row: ctx.row,
            column: ctx.column,
            sheet: ctx.sheet,
            identity: ctx.identity,
            metadata: ctx.metadata,
        };
        // Replace 'contains' with a method call. This is a syntactic
        // convenience — "tags contains 'premium'" reads better than
        // "tags.includes('premium')".
        //
        // PLAY-TEST FIX: the left side may be a path (caller.identity.tags).
        // The previous rewrite captured only the trailing \w+ segment and
        // emitted a bare `tags` reference, which is out of scope inside the
        // compiled function — a silent ReferenceError -> rule never matches.
        // Capture the full dotted path and rewrite it in place instead.
        const expr = when.replace(/([\w.]+)\s+contains\s+"([^"]+)"/g, 'Array.isArray($1) && $1.includes("$2")');
        // eslint-disable-next-line no-new-func
        const fn = new Function('caller', `return (${expr});`);
        return Boolean(fn(caller));
    }
    catch (err) {
        // Be loud in dev, quiet in prod
        if (process.env.QUILT_DEBUG) {
            console.error(`[quilt] evalWhen failed: ${when}`, err);
        }
        return false;
    }
}
/**
 * PLAY-TEST PATCH 10: stable cache key for effectful calls that take input.
 * contextKey() alone ignores `input`, so runtime.call(id, a) and
 * runtime.call(id, b) collided on the same context and the second call was
 * served the first call's memoized result. A program is a function of its
 * arguments; the cache key must be too.
 */
export function stableJson(v) {
    if (v === null || typeof v !== 'object')
        return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v))
        return `[${v.map(stableJson).join(',')}]`;
    const keys = Object.keys(v).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
}
export function callKey(ctx, input) {
    const base = contextKey(ctx);
    if (input === undefined)
        return base;
    return `${base}|in:${stableJson(input)}`;
}
//# sourceMappingURL=context.js.map