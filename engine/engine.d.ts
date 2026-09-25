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
import type { Cell, CellDef, CellId, CellKind, CallerContext, CellValue, SheetDef, EvaluationTrace } from './types.js';
import { type AIEngineLike } from './cells/ai.js';
import type { ProgramRuntime } from './cells/program.js';
/**
 * Engine options.
 *
 *   - maxConcurrency: max simultaneous effectful evaluations
 *     (not yet enforced in MVP — kept for future scheduler)
 *   - tracing: whether to record evaluation traces
 */
export interface EngineOptions {
    maxConcurrency?: number;
    tracing?: boolean;
    /** Optional AI engine for `kind: 'ai'` cells. If null, AI cells will error. */
    ai?: AIEngineLike;
    /**
     * PLAY-TEST ITERATION: eager reactive mode. When true, set/push
     * recomputes stale formula cells during propagation (instead of
     * lazily on the next get). Listeners and subscribers then observe
     * real prev->current transitions of derived cells. Default false
     * (preserves the original pull-based semantics).
     */
    eager?: boolean;
}
/**
 * The Quilt reactive runtime. One instance per "session" or "agent"
 * or "deployment". Holds the cell graph and provides the universal
 * API.
 */
export declare class QuiltEngine implements ProgramRuntime {
    readonly id: string;
    private cells;
    private subscriptions;
    private inflight;
    private traces;
    private options;
    private subscriptionCounter;
    constructor(id?: string, options?: EngineOptions);
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
    loadSheet(sheet: SheetDef): void;
    /**
     * Define a single cell. Adds it to the graph.
     *
     * Throws if a cell with the same id already exists. Use this for
     * static sheets (via loadSheet) or for one-off cells in tests.
     * For dynamic registration (e.g. agents defining cells at runtime),
     * use `register()`.
     */
    defineCell(def: CellDef): Cell;
    /**
     * Register a new cell definition after load. Used for dynamic
     * registration (e.g. sensors connecting, agents defining new tools).
     *
     * Unlike defineCell, this also builds dependency edges from the
     * declared deps. (Formulas registered dynamically don't get
     * auto-detected deps — declare them explicitly.)
     */
    register(def: CellDef): Cell;
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
    get(id: CellId, ctx?: CallerContext): Promise<CellValue>;
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
    set(id: CellId, value: unknown, ctx?: CallerContext): Promise<void>;
    /**
     * Call a cell as a capability. Same as get for pure cells, but
     * allows passing an `input` argument for effectful cells.
     *
     * USAGE:
     *   const v = await engine.call('model.router', userInput, { row: 'boat-1' });
     *   // The router receives userInput and routes based on the caller context.
     */
    call(id: CellId, input?: unknown, ctx?: CallerContext): Promise<CellValue>;
    /**
     * Push a value into a sensor or IO cell. Triggers downstream.
     *
     * Called by external adapters (MQTT, Modbus, GPIO, MCP tools) when
     * they have a new reading/event for the cell.
     *
     * Throws if the cell isn't a sensor or IO. Use set for value/formula.
     */
    push(id: CellId, data: unknown, ctx?: CallerContext): Promise<void>;
    /**
     * Subscribe to a cell's value changes. The callback fires every
     * time the cell's value changes (and the optional filter returns
     * true, if provided).
     *
     * Returns a subscription id. Pass it to `unsubscribe` to stop.
     */
    subscribe(cellId: CellId, callback: (value: CellValue, prev: CellValue) => void | Promise<void>, filter?: (value: CellValue, prev: CellValue) => boolean): string;
    /**
     * Stop a subscription. The callback will no longer fire.
     */
    unsubscribe(subscriptionId: string): void;
    /**
     * Get a cell instance by id. Returns undefined if no such cell.
     * Use this to inspect a cell's dependencies, dependents, current value.
     */
    getCell(id: CellId): Cell | undefined;
    /**
     * List all cells, optionally filtered by kind.
     */
    listCells(kind?: CellKind): Cell[];
    /**
     * Get recent evaluation traces (for debugging, time-travel).
     */
    getTraces(limit?: number): EvaluationTrace[];
    /**
     * Export all cell definitions as an array of CellDef. Used by
     * `save` to serialize a runtime state back to YAML.
     */
    exportDefs(): CellDef[];
    /**
     * Evaluate an effectful cell (api, program, router). Caches the
     * result by context, notifies subscribers, and traces if enabled.
     */
    private evaluateEffectful;
    /**
     * Recursively refresh formula/value dependencies before computing
     * a formula. This is the "pull" model: we walk down the dep graph
     * and ensure all values are computed.
     */
    private refreshDeps;
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
    private propagate;
    /**
     * Notify all subscribers of a cell change. Subscriptions can have
     * an optional filter that decides whether to fire.
     */
    private notify;
    /**
     * Add a dependency edge: `from` depends on `to`. Updates both
     * the forward index (from.dependencies) and the reverse index
     * (to.dependents).
     */
    private addDep;
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
    private autoDetectDeps;
}
//# sourceMappingURL=engine.d.ts.map