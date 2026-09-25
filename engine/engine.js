/**
 * @file engine.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE QUILT ENGINE — the reactive runtime
 * =====================================================================
 *
 * This is the heart of Quilt. It holds the cell graph, tracks
 * dependencies, propagates changes, and exposes the universal API:
 * `get`, `set`, `call`, `push`, `subscribe`.
 *
 * Everything else (CLI, MCP, TUI, Web) is a view onto this engine.
 * If you understand this file, you understand the system.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts       ◄── Cell, CellDef, CellId, CellValue, CallerContext
 *     context.ts     ◄── extendContext, contextKey
 *     cells/*.ts     ◄── evaluateValue, evaluateFormula, evaluateApi,
 *                       evaluateProgram, evaluateRouter, fireListener,
 *                       makeSensorValue, makeIoValue
 *        ▲
 *        │ imports
 *        │
 *     engine.ts      ◄── THIS FILE: QuiltEngine (the runtime)
 *        ▲
 *        │ imports
 *        │
 *     parser.ts      (uses engine.loadSheet to install parsed cells)
 *     mcp/server.ts  (calls engine.get/call/subscribe for MCP tools)
 *     cli/index.ts   (calls engine.get/set/loadSheet for commands)
 *
 * The engine implements `ProgramRuntime` so that program cells can
 * call back into the runtime (read, write, call other cells). This
 * is the "user code can compose with the runtime" hook.
 *
 * =====================================================================
 *  THE LIFECYCLE OF A CELL
 * =====================================================================
 *
 *   1. loadSheet(sheet) — define cells, build dependency graph
 *      For each CellDef, create a Cell with empty value.
 *      For formulas, scan the expression and add dep edges.
 *      For others, use the declared `deps` field.
 *
 *   2. get(id, ctx) — pull a cell's value, computing if needed
 *      Pure cells (value, formula): recompute on demand.
 *      Effectful cells (api, program, router): de-duped, cached.
 *      Push-based cells (sensor, io, listener): return current.
 *
 *   3. set(id, value, ctx) — write a value, propagate changes
 *      Update the cell, mark dependents as stale,
 *      notify subscribers, fire listeners.
 *
 *   4. call(id, input, ctx) — invoke a cell as a capability
 *      Same as get for pure cells. For effectful, pass input.
 *
 *   5. push(id, data) — push a value into a sensor or IO cell
 *      External adapters call this. Triggers downstream.
 *
 * =====================================================================
 *  PROPAGATION ALGORITHM
 * =====================================================================
 *
 * When a cell's value changes (via set or push), the engine walks
 * the dependent graph depth-first:
 *
 *   1. Mark each formula/value dependent as 'stale' and clear its cache
 *   2. Recurse into their dependents
 *   3. For each listener dependent, check its condition and fire
 *   4. Notify external subscribers
 *
 * Pure cells are not auto-recomputed; they recompute lazily on the
 * next get(). Effectful cells are NEVER auto-recomputed by upstream
 * changes — they must be called explicitly.
 *
 * =====================================================================
 *  CACHING STRATEGY
 * =====================================================================
 *
 * Per-context memoization: same cell + same caller context (by
 * row/column/identity/tags) → same cached value.
 *
 *   - value cells: no cache needed (always O(1))
 *   - formula cells: cache the result by contextKey
 *   - api/program/router cells: cache the result by contextKey
 *   - sensor/io/listener cells: not cached (push-based)
 *
 * Cache is invalidated:
 *   - On set (to the same cell)
 *   - On propagation (to formula dependents)
 *   - Never on context change (we cache per context, not per cell)
 *
 * =====================================================================
 */
import { emptyContext, extendContext, contextKey, callKey } from './context.js';
import { evaluateValue } from './cells/value.js';
import { evaluateFormula } from './cells/formula.js';
import { evaluateApi } from './cells/api.js';
import { evaluateProgram } from './cells/program.js';
import { evaluateRouter } from './cells/router.js';
import { fireListener } from './cells/listener.js';
import { makeSensorValue } from './cells/sensor.js';
import { makeIoValue } from './cells/io.js';
import { evaluateAI } from './cells/ai.js';
const defaultOptions = {
    maxConcurrency: 16,
    tracing: false,
    eager: false,
};
/**
 * The Quilt reactive runtime. One instance per "session" or "agent"
 * or "deployment". Holds the cell graph and provides the universal
 * API.
 */
export class QuiltEngine {
    id;
    cells = new Map();
    subscriptions = new Map();
    inflight = new Map();
    traces = [];
    options;
    subscriptionCounter = 0;
    constructor(id = 'default', options = {}) {
        this.id = id;
        const { ai, ...rest } = options;
        this.options = { ...defaultOptions, ...rest, ai };
    }
    // ===========================================================================
    // SHEET LIFECYCLE
    // ===========================================================================
    /**
     * Load a sheet definition into the engine. Resets all cell state.
     *
     * Steps:
     *   1. Clear existing cells, in-flight evaluations, traces
     *   2. For each CellDef, create a Cell instance
     *   3. Build dependency edges (auto-detect for formulas, declared for others)
     *   4. Index dependents (reverse lookup)
     *
     * After loadSheet, the engine is ready to answer get/set/call.
     * No values are computed until something asks for them (pull-based).
     */
    loadSheet(sheet) {
        this.cells.clear();
        this.inflight.clear();
        this.traces = [];
        for (const def of sheet.cells) {
            this.defineCell(def);
        }
        // Build dependency edges. For formulas, auto-detect by scanning
        // the expression. For everything else, use the declared `deps`.
        for (const cell of this.cells.values()) {
            if (cell.def.kind === 'formula' || cell.def.kind === 'ai') {
                this.autoDetectDeps(cell);
            }
            // PLAY-TEST FIX: wire listener `watch` lists into the graph.
            // Without this edge, propagate() never reaches listener cells and
            // fireListener is dead code for sheets authored per the documented
            // schema (watch/condition/action with no deps).
            if (cell.def.kind === 'listener') {
                for (const w of cell.def.watch ?? []) {
                    this.addDep(cell.id, w);
                }
            }
            for (const dep of cell.def.deps ?? []) {
                this.addDep(cell.id, dep);
            }
        }
    }
    /**
     * Define a single cell. Adds it to the graph.
     *
     * Throws if a cell with the same id already exists. Use this for
     * static sheets (via loadSheet) or for one-off cells in tests.
     * For dynamic registration (e.g. agents defining cells at runtime),
     * use `register()`.
     */
    defineCell(def) {
        if (this.cells.has(def.id)) {
            throw new Error(`cell already defined: ${def.id}`);
        }
        // Seed the cell with its initial value. Value cells use
        // `def.value`; sensor cells use `def.default` (if any) so
        // demo sheets work without an adapter wired up.
        let initial = { data: undefined, status: 'idle' };
        if (def.value !== undefined) {
            initial = { data: def.value, status: 'ready', computedAt: Date.now() };
        }
        else if (def.kind === 'sensor' && def.default !== undefined) {
            initial = { data: def.default, status: 'ready', computedAt: Date.now() };
        }
        const cell = {
            id: def.id,
            def,
            value: initial,
            dependencies: new Set(),
            dependents: new Set(),
            contextCache: new Map(),
        };
        this.cells.set(def.id, cell);
        return cell;
    }
    /**
     * Register a new cell definition after load. Used for dynamic
     * registration (e.g. sensors connecting, agents defining new tools).
     *
     * Unlike defineCell, this also builds dependency edges from the
     * declared deps. (Formulas registered dynamically don't get
     * auto-detected deps — declare them explicitly.)
     */
    register(def) {
        const cell = this.defineCell(def);
        if (def.kind === 'listener') {
            for (const w of def.watch ?? []) {
                this.addDep(def.id, w);
            }
        }
        for (const dep of def.deps ?? []) {
            this.addDep(def.id, dep);
        }
        return cell;
    }
    // ===========================================================================
    // THE UNIVERSAL API: get, set, call
    // ===========================================================================
    /**
     * Get a cell's value. Evaluates if needed.
     *
     * Dispatch by cell kind:
     *   - value:   return the static value (no computation)
     *   - formula: refresh deps, then evaluate
     *   - api/program/router: de-dupe concurrent calls, evaluate
     *   - sensor/io/listener: return the current pushed value
     *
     * Per-context memoization: same cell + same context → cached.
     *
     * @param id - the cell id
     * @param ctx - the caller context (for routing and cache key)
     * @returns the cell's value, or an error CellValue
     */
    async get(id, ctx = emptyContext()) {
        const cell = this.cells.get(id);
        if (!cell) {
            return { data: undefined, status: 'error', error: { message: `no such cell: ${id}` } };
        }
        const fullCtx = extendContext(ctx, id);
        switch (cell.def.kind) {
            case 'value':
                // PLAY-TEST FIX: return the LIVE cell value (seeded from def.value at
                // load, updated by set()). Previously this called evaluateValue(),
                // which reads cell.def.value — so engine.set() on a value cell was
                // invisible to engine.get() (though downstream formulas DID see it,
                // since they read cell.value.data). Classic stale-read asymmetry.
                return cell.value.status === 'idle' ? evaluateValue(cell, fullCtx) : cell.value;
            case 'formula': {
                await this.refreshDeps(cell, fullCtx);
                return evaluateFormula(cell, fullCtx, this.cells);
            }
            case 'api':
            case 'program':
            case 'router':
            case 'ai': {
                // PLAY-TEST PATCH 12: effectful cells are honest functions of the
                // SHEET STATE, which contextKey cannot see. Serving them from the
                // caller-aware cache froze a stateful sheet (the hold'em arbiter
                // returned a stale verdict forever while match.seq read a stale 0
                // from the read-cache). Default is now FRESH evaluation; declare
                // `memo: true` on a pure cell to opt back into caching.
                if (!cell.def.memo) {
                    const value = await this.evaluateEffectful(cell, fullCtx, undefined);
                    return value;
                }
                const key = contextKey(fullCtx);
                const cached = cell.contextCache.get(key);
                if (cached && cached.status === 'ready') {
                    return cached;
                }
                const value2 = await this.evaluateEffectful(cell, fullCtx, undefined);
                cell.contextCache.set(key, value2);
                return value2;
            }
            case 'sensor':
            case 'io':
            case 'listener':
                return cell.value;
            default:
                return { data: undefined, status: 'error', error: { message: `unknown kind: ${cell.def.kind}` } };
        }
    }
    /**
     * Set a cell's value. Triggers downstream recomputation.
     *
     * Steps:
     *   1. Update the cell's value and invalidate its caller-aware cache
     *   2. Notify external subscribers
     *   3. Propagate to dependents (mark stale, fire listeners)
     *
     * Note: set only changes ONE cell. To update a transaction, you
     * make multiple set calls. They're not atomic, but they are
     * ordered — set is synchronous from the caller's perspective.
     */
    async set(id, value, ctx = emptyContext()) {
        const cell = this.cells.get(id);
        if (!cell) {
            throw new Error(`no such cell: ${id}`);
        }
        const fullCtx = extendContext(ctx, id);
        const prev = cell.value;
        const newValue = {
            data: value,
            status: 'ready',
            computedAt: Date.now(),
        };
        cell.value = newValue;
        cell.contextCache.clear();
        await this.notify(id, newValue, prev);
        await this.propagate(id, fullCtx, undefined, prev);
    }
    /**
     * Call a cell as a capability. Same as get for pure cells, but
     * allows passing an `input` argument for effectful cells.
     *
     * USAGE:
     *   const v = await engine.call('model.router', userInput, { row: 'boat-1' });
     *   // The router receives userInput and routes based on the caller context.
     */
    async call(id, input, ctx = emptyContext()) {
        const cell = this.cells.get(id);
        if (!cell) {
            return { data: undefined, status: 'error', error: { message: `no such cell: ${id}` } };
        }
        const fullCtx = extendContext(ctx, id);
        if (cell.def.kind === 'value' || cell.def.kind === 'formula') {
            return this.get(id, ctx);
        }
        if (cell.def.kind === 'sensor' || cell.def.kind === 'io' || cell.def.kind === 'listener') {
            return cell.value;
        }
        // PLAY-TEST PATCH 10: include the call's input in the memo key.
        // PLAY-TEST PATCH 12: ...and only memoize when the cell declares `memo: true`
        // (a program is a function of its arguments AND of the sheet state).
        const key = callKey(fullCtx, input);
        if (cell.def.memo) {
            const cached = cell.contextCache.get(key);
            if (cached && cached.status === 'ready') {
                return cached;
            }
        }
        const inflightKey = `${id}|${key}`;
        if (this.inflight.has(inflightKey)) {
            return this.inflight.get(inflightKey);
        }
        const promise = this.evaluateEffectful(cell, fullCtx, input);
        this.inflight.set(inflightKey, promise);
        try {
            const value = await promise;
            if (cell.def.memo)
                cell.contextCache.set(key, value);
            return value;
        }
        finally {
            this.inflight.delete(inflightKey);
        }
    }
    /**
     * Push a value into a sensor or IO cell. Triggers downstream.
     *
     * Called by external adapters (MQTT, Modbus, GPIO, MCP tools) when
     * they have a new reading/event for the cell.
     *
     * Throws if the cell isn't a sensor or IO. Use set for value/formula.
     */
    async push(id, data, ctx = emptyContext()) {
        const cell = this.cells.get(id);
        if (!cell)
            throw new Error(`no such cell: ${id}`);
        if (cell.def.kind !== 'sensor' && cell.def.kind !== 'io') {
            throw new Error(`cannot push to ${cell.def.kind} cell: ${id}`);
        }
        const newValue = cell.def.kind === 'sensor' ? makeSensorValue(data) : makeIoValue(data);
        const prev = cell.value;
        cell.value = newValue;
        await this.notify(id, newValue, prev);
        await this.propagate(id, extendContext(ctx, id), undefined, prev);
    }
    // ===========================================================================
    // SUBSCRIPTIONS
    // ===========================================================================
    /**
     * Subscribe to a cell's value changes. The callback fires every
     * time the cell's value changes (and the optional filter returns
     * true, if provided).
     *
     * Returns a subscription id. Pass it to `unsubscribe` to stop.
     */
    subscribe(cellId, callback, filter) {
        const id = `sub-${++this.subscriptionCounter}`;
        this.subscriptions.set(id, { id, cellId, callback, filter });
        return id;
    }
    /**
     * Stop a subscription. The callback will no longer fire.
     */
    unsubscribe(subscriptionId) {
        this.subscriptions.delete(subscriptionId);
    }
    // ===========================================================================
    // INTROSPECTION
    // ===========================================================================
    /**
     * Get a cell instance by id. Returns undefined if no such cell.
     * Use this to inspect a cell's dependencies, dependents, current value.
     */
    getCell(id) {
        return this.cells.get(id);
    }
    /**
     * List all cells, optionally filtered by kind.
     */
    listCells(kind) {
        const all = Array.from(this.cells.values());
        return kind ? all.filter(c => c.def.kind === kind) : all;
    }
    /**
     * Get recent evaluation traces (for debugging, time-travel).
     */
    getTraces(limit = 100) {
        return this.traces.slice(-limit);
    }
    /**
     * Export all cell definitions as an array of CellDef. Used by
     * `save` to serialize a runtime state back to YAML.
     */
    exportDefs() {
        return Array.from(this.cells.values()).map(c => c.def);
    }
    // ===========================================================================
    // INTERNAL: evaluation, propagation, dependencies
    // ===========================================================================
    /**
     * Evaluate an effectful cell (api, program, router). Caches the
     * result by context, notifies subscribers, and traces if enabled.
     */
    async evaluateEffectful(cell, ctx, input) {
        const startedAt = Date.now();
        let result;
        if (cell.def.kind === 'api') {
            result = await evaluateApi(cell, ctx, input);
        }
        else if (cell.def.kind === 'program') {
            // PLAY-TEST PATCH 11: programs receive a context-bound runtime.
            // Previously they got the raw engine, whose get/set/call default to
            // emptyContext() — so a nested runtime.call from inside a program
            // silently DROPPED the caller identity (tenant tier, tags, metadata).
            // Same bug family as the router-delegation fix: per-tenant memoization
            // collapsed to a single shared answer. Explicit contexts still win.
            const boundRuntime = {
                get: (id) => this.get(id, ctx),
                set: (id, value) => this.set(id, value, ctx),
                call: (id, i, c) => this.call(id, i, c ?? ctx),
            };
            result = await evaluateProgram(cell, ctx, input, boundRuntime);
        }
        else if (cell.def.kind === 'router') {
            result = await evaluateRouter(cell, ctx, input, this);
        }
        else if (cell.def.kind === 'ai') {
            if (!this.options.ai) {
                result = { data: null, status: 'error', error: { message: 'AI cell evaluated but no AI engine configured. Pass an `ai` engine to the QuiltEngine constructor.' } };
            }
            else {
                // Recursively resolve upstream cell values for {{id}} substitution
                const resolved = new Set();
                const resolver = (id) => {
                    if (resolved.has(id))
                        return null;
                    resolved.add(id);
                    const c = this.cells.get(id);
                    if (!c)
                        return null;
                    if (c.value.status === 'ready')
                        return c.value.data;
                    if (c.value.status === 'computing') {
                        // Upstream not yet evaluated — for value cells, evaluate sync
                        if (c.def.kind === 'value') {
                            c.value = evaluateValue(c, ctx);
                            return c.value.data;
                        }
                        return null;
                    }
                    if (c.value.status === 'error')
                        return null;
                    return c.value.data;
                };
                const aiResult = await evaluateAI(cell.def, ctx, this.options.ai, resolver);
                result = {
                    data: aiResult.value,
                    status: aiResult.error ? 'error' : 'ready',
                    error: aiResult.error ? { message: aiResult.error } : undefined,
                    effects: [{ kind: 'model', provider: cell.def.provider || 'unknown' }],
                    computedAt: Date.now(),
                };
            }
        }
        else {
            result = { data: undefined, status: 'error', error: { message: `not effectful: ${cell.def.kind}` } };
        }
        if (this.options.tracing) {
            this.traces.push({
                cellId: cell.id,
                startedAt,
                completedAt: Date.now(),
                durationMs: Date.now() - startedAt,
                context: ctx,
                effects: result.effects,
                error: result.error,
            });
        }
        const prev = cell.value;
        cell.value = result;
        await this.notify(cell.id, result, prev);
        return result;
    }
    /**
     * Recursively refresh formula/value dependencies before computing
     * a formula. This is the "pull" model: we walk down the dep graph
     * and ensure all values are computed.
     */
    async refreshDeps(cell, ctx) {
        for (const depId of cell.dependencies) {
            const dep = this.cells.get(depId);
            if (!dep)
                continue;
            if (dep.def.kind === 'value' && dep.value.status !== 'ready') {
                dep.value = evaluateValue(dep, ctx);
            }
            else if (dep.def.kind === 'formula' && dep.value.status !== 'ready') {
                await this.refreshDeps(dep, ctx);
                const v = evaluateFormula(dep, ctx, this.cells);
                dep.value = v;
                dep.contextCache.set(contextKey(ctx), v);
            }
        }
    }
    /**
     * Propagate a change to all dependents. Mark formula/value
     * dependents as stale and invalidate their cache. Fire listener
     * dependents whose conditions are met.
     *
     * PLAY-TEST ITERATION (SuperInstance play-test, Sep 2026):
     *  - cycle guard: `visited` prevents infinite recursion on cyclic graphs
     *    (previously a set/push on a cyclic sheet recursed forever).
     *  - eager mode (options.eager): stale formula cells are recomputed
     *    DURING propagation, so listeners and subscribers observe fresh
     *    transitions instead of stale data. Prev/new are real, which makes
     *    edge-triggered listener conditions (prev !== current) work.
     */
    async propagate(changedId, ctx, visited, changedPrev) {
        const cell = this.cells.get(changedId);
        if (!cell)
            return;
        const seen = visited ?? new Set();
        if (seen.has(changedId))
            return; // cycle guard
        seen.add(changedId);
        let current = cell.value;
        let prev = changedPrev ?? current;
        // EAGER: recompute a stale formula now so downstream sees fresh values.
        if (this.options.eager && cell.def.kind === 'formula' &&
            (cell.value.status === 'stale' || cell.value.status === 'idle')) {
            prev = cell.value; // the stale value still carries the OLD data
            await this.refreshDeps(cell, ctx);
            current = evaluateFormula(cell, ctx, this.cells);
            cell.value = current;
            await this.notify(cell.id, current, prev);
        }
        for (const depId of cell.dependents) {
            const dep = this.cells.get(depId);
            if (!dep || seen.has(depId))
                continue;
            // PLAY-TEST FIX: also invalidate program/router caches. Previously
            // only formula/value/ai were cleared, so a program cell that declared
            // deps on an upstream cell kept serving its FIRST result forever
            // (e.g. an LLM workflow that never saw new input).
            if (dep.def.kind === 'formula' || dep.def.kind === 'value' || dep.def.kind === 'ai' ||
                dep.def.kind === 'program' || dep.def.kind === 'router') {
                dep.value = { ...dep.value, status: 'stale' };
                dep.contextCache.clear();
            }
            await this.propagate(depId, ctx, seen);
        }
        for (const depId of cell.dependents) {
            const dep = this.cells.get(depId);
            if (!dep || dep.def.kind !== 'listener')
                continue;
            await fireListener(dep, changedId, current, prev, this);
        }
    }
    /**
     * Notify all subscribers of a cell change. Subscriptions can have
     * an optional filter that decides whether to fire.
     */
    async notify(id, value, prev) {
        for (const sub of this.subscriptions.values()) {
            if (sub.cellId !== id)
                continue;
            if (sub.filter && !sub.filter(value, prev))
                continue;
            try {
                await sub.callback(value, prev);
            }
            catch (err) {
                if (process.env.QUILT_DEBUG) {
                    console.error(`[quilt] subscription error for ${id}:`, err);
                }
            }
        }
    }
    /**
     * Add a dependency edge: `from` depends on `to`. Updates both
     * the forward index (from.dependencies) and the reverse index
     * (to.dependents).
     */
    addDep(from, to) {
        const fromCell = this.cells.get(from);
        const toCell = this.cells.get(to);
        if (!fromCell || !toCell)
            return;
        fromCell.dependencies.add(to);
        toCell.dependents.add(from);
    }
    /**
     * Naive auto-detection of formula dependencies: scan the
     * expression for any token that matches a known cell id.
     *
     * Good enough for MVP. A real implementation would parse the
     * expression into an AST and walk it.
     *
     * For AI cells, we scan the prompt, input, and image fields for
     * {{cell.id}} references.
     */
    autoDetectDeps(cell) {
        const fields = [];
        if (cell.def.expr)
            fields.push(cell.def.expr);
        if (cell.def.kind === 'ai') {
            const ai = cell.def;
            if (ai.prompt)
                fields.push(ai.prompt);
            if (ai.input)
                fields.push(ai.input);
            if (ai.image)
                fields.push(ai.image);
        }
        if (fields.length === 0)
            return;
        const text = fields.join(' ');
        const knownIds = new Set(this.cells.keys());
        for (const id of knownIds) {
            if (id === cell.id)
                continue;
            // Match either {{id}} (template) or \bid\b (raw token)
            const reTemplate = new RegExp(`\\{\\{\\s*${escapeRegex(id)}\\s*\\}\\}`);
            const reToken = new RegExp(`\\b${escapeRegex(id)}\\b`);
            if (reTemplate.test(text) || reToken.test(text)) {
                this.addDep(cell.id, id);
            }
        }
    }
}
/**
 * Escape a string for safe use inside a RegExp.
 * Used by `autoDetectDeps` when building patterns to match cell ids.
 */
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=engine.js.map