/**
 * @file types.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE TYPE VOCABULARY OF THE QUILT RUNTIME
 * =====================================================================
 *
 * This file is the single source of truth for what a "cell" is, what
 * kinds of cells exist, what values flow through them, and what
 * context travels with every call.
 *
 * If you are a zero-shot agent landing in this codebase, START HERE.
 * Read this file, then `engine.ts`, then `context.ts`. With those three
 * you have the mental model. The cell evaluators in `cells/*.ts` are
 * then just implementations of `evaluate*(cell, ctx, ...) -> CellValue`.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 * This file is consumed by EVERY other file in the runtime. It is
 * leaf-level: it imports nothing from this project. Every other file
 * imports from here.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  types.ts  ◄── this file                                     │
 *   │     ▲                                                       │
 *   │     │ imports                                               │
 *   │     │                                                       │
 *   │     ├── context.ts     (extends CallerContext)              │
 *   │     ├── engine.ts      (holds Map<CellId, Cell>)            │
 *   │     ├── cells/*.ts     (read Cell, CellDef, CellValue)     │
 *   │     ├── parser.ts      (produces CellDef from YAML)         │
 *   │     └── mcp/server.ts  (exposes cells as MCP tools)         │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * =====================================================================
 *  KEY DESIGN DECISIONS
 * =====================================================================
 *
 * 1. STABLE IDENTITY OVER COORDINATES
 *    A cell is addressed by its `id` (e.g. "compass.heading"), not
 *    by A1/B2-style coordinates. Coordinates are display-only. This
 *    means inserting/reordering cells never breaks references.
 *
 * 2. EIGHT CELL KINDS, NOT ONE
 *    A cell is a tagged union of eight kinds. Each kind has different
 *    evaluation semantics (pull vs push, sync vs async, pure vs
 *    effectful). The kind is the only thing that determines how the
 *    engine treats the cell.
 *
 * 3. CALLER CONTEXT IS FIRST-CLASS
 *    Every cell call carries a `CallerContext` (row, column, identity,
 *    trace). The engine fills in the trace automatically. This is
 *    what makes caller-aware routing possible.
 *
 * 4. VALUES CARRY THEIR OWN STATUS
 *    A `CellValue` has a `status` field. There's no separate "is it
 *    ready?" check. A consumer reads the status to know whether the
 *    value is fresh, computing, errored, or stale.
 *
 * 5. EFFECTS ARE DECLARED
 *    Pure cells have no effects. Effectful cells (api, program) declare
 *    what they did (network calls, model invocations, etc.) via the
 *    `effects` field. This is what makes cost/latency reasoning and
 *    decomposition tractable.
 *
 * =====================================================================
 *  THE METAPHOR
 * =====================================================================
 *
 * A `Cell` is a SOCKET, not a value. You can plug any implementation
 * into a socket. Changing the implementation changes every dependent
 * automatically — that is dependency injection at the spreadsheet level.
 *
 * A `CellDef` is the SPEC for a socket. The runtime instantiates a
 * `Cell` (the live thing) from a `CellDef` (the static description).
 *
 * A `CellValue` is the CURRENT STATE of a socket. It carries its own
 * status so consumers know what they're getting.
 *
 * A `CallerContext` is the wiring context. It tells the socket who's
 * asking and from where, so it can route.
 *
 * A `Subscription` is someone watching a socket for changes.
 *
 * An `Effect` is something a socket did that has consequences outside
 * itself. Network call, model invocation, file write.
 *
 * A `SheetDef` is the wiring diagram: all the sockets and how they
 * connect.
 *
 * =====================================================================
 */
/**
 * The stable identity of a cell. This is what other cells reference.
 * NOT a coordinate. Survives reordering, sheet splits, and refactors.
 *
 * Examples:
 *   "compass.heading"
 *   "fleet.boat1.rudder"
 *   "router.model"
 *
 * Convention: dot-separated namespace. No length limit. The parser
 * does not enforce any particular naming convention; the runtime
 * treats ids as opaque strings.
 */
export type CellId = string;
/**
 * A reference to another cell. Same shape as `CellId` for now, but
 * typed separately so we can later add expressions like
 * "fleet.boat*.rudder" (range) or "router.model?caller.row>10"
 * (conditional) without breaking existing code.
 */
export type CellRef = string;
/**
 * The kind of cell. Determines evaluation semantics.
 *
 *   ┌──────────┬────────────┬──────────┬───────────┬───────────────┐
 *   │ Kind     │ Trigger    │ Pure?    │ Async?    │ Has effects?  │
 *   ├──────────┼────────────┼──────────┼───────────┼───────────────┤
 *   │ value    │ never      │ yes      │ no        │ no            │
 *   │ formula  │ pull       │ yes      │ no        │ no            │
 *   │ api      │ call       │ no       │ yes       │ yes (network) │
 *   │ program  │ call       │ no       │ yes       │ yes (any)     │
 *   │ sensor   │ push       │ no       │ no        │ no            │
 *   │ listener │ dep change │ no       │ yes       │ yes (action)  │
 *   │ router   │ call       │ no       │ yes       │ no (delegate) │
 *   │ io       │ push       │ no       │ no        │ yes (bidir)   │
 *   └──────────┴────────────┴──────────┴───────────┴───────────────┘
 *
 * The split between PURE (value, formula) and EFFECTFUL (everything
 * else) is the most important distinction. Pure cells recompute
 * eagerly when dependencies change. Effectful cells recompute only
 * when explicitly called or pushed, and they can declare what they
 * did via the `effects` field on the resulting `CellValue`.
 */
export type CellKind = 'value' | 'formula' | 'api' | 'program' | 'sensor' | 'listener' | 'router' | 'io' | 'ai';
/**
 * The status of a cell's current value.
 *
 *   - idle:      has never been evaluated, or has no value yet
 *   - computing: evaluation in flight (async)
 *   - ready:     value is fresh and trustworthy
 *   - error:     last evaluation failed (see `error` field)
 *   - stale:     dependencies changed, needs recompute
 *
 * Consumers read this to know whether the value is usable. There's
 * never a separate "is this ready?" call — the status is the answer.
 */
export type CellStatus = 'idle' | 'computing' | 'ready' | 'error' | 'stale';
/**
 * The current value of a cell, with metadata. Cells always know their
 * own status.
 *
 * Example:
 * ```ts
 * const v: CellValue = {
 *   data: 42,
 *   status: 'ready',
 *   computedAt: 1700000000000,
 *   effects: [{ kind: 'network', url: '...', method: 'GET' }],
 * };
 * ```
 */
export interface CellValue {
    /** The actual payload. Any JSON-serializable value. */
    data: unknown;
    /** What the value's status is. */
    status: CellStatus;
    /** Epoch ms when this value was last computed. */
    computedAt?: number;
    /** Set if status is 'error'. */
    error?: {
        message: string;
        stack?: string;
    };
    /** What the cell did to produce this value. Empty for pure cells. */
    effects?: Effect[];
}
/**
 * Effects are what a cell *did* during evaluation. Pure cells have no
 * effects. Effectful cells declare their effects so the runtime can:
 *   - reason about cost (sum effects over a call chain)
 *   - debounce/retry (don't fire the same effect twice in N ms)
 *   - show them in the UI (audit log)
 *   - decompose them into cheaper cells over time
 *
 * The `kind` is a discriminator. Each variant has its own fields.
 */
export type Effect = {
    kind: 'network';
    url: string;
    method: string;
} | {
    kind: 'storage';
    op: 'read' | 'write';
    key: string;
} | {
    kind: 'io';
    port: string;
    direction: 'in' | 'out';
} | {
    kind: 'model';
    provider: string;
    tokensIn?: number;
    tokensOut?: number;
} | {
    kind: 'compute';
    ms: number;
};
/**
 * The context carried with every cell call. This is what makes
 * caller-aware routing possible.
 *
 * The engine fills in `trace` and `timestamp` automatically as a call
 * descends into the dependency graph. Callers can attach `identity`,
 * `metadata`, and the spatial axes (row/column) for routing.
 *
 *   ┌─────────────┐
 *   │ caller.row   │──── routes by tenant
 *   │ caller.col   │──── routes by capability
 *   │ caller.id    │──── routes by user
 *   │ caller.tags  │──── routes by tier
 *   │ caller.trace │──── provenance / debugging
 *   └─────────────┘
 */
export interface CallerContext {
    /** Spatial row — the "who" (tenant, device, instance) */
    row?: number | string;
    /** Spatial column — the "what" (capability, property, model) */
    column?: number | string;
    /** Which sheet this is (for cross-sheet refs in the future) */
    sheet?: string;
    /** The cell that initiated this call (the immediate caller) */
    caller?: CellId;
    /** The full ancestor chain (for provenance/tracing) */
    trace?: CellId[];
    /** Who is making the call */
    identity?: {
        id: string;
        type: 'human' | 'agent' | 'sensor' | 'system';
        tags?: string[];
    };
    /** Arbitrary metadata. Use this for application-specific context. */
    metadata?: Record<string, unknown>;
    /** Epoch ms when this call started */
    timestamp: number;
}
/**
 * A router rule. The `when` is a small expression evaluated in the
 * caller's context. The `route` can be:
 *   - a string cell id (delegate to that cell)
 *   - an object with `cell` (delegate) and `with` (merge extra context)
 *   - an object with `model` (swap the model for the next call)
 *   - an object with `value` (return a literal)
 *
 * The first rule that matches wins. If no rule matches, the router
 * returns undefined (the caller can decide what to do).
 *
 * Example:
 * ```yaml
 * rules:
 *   - when: 'caller.row > 10'
 *     route: { cell: 'models.precise' }
 *   - when: 'caller.identity.tags contains "premium"'
 *     route: { model: 'gpt-4o' }
 *   - when: 'true'
 *     route: { cell: 'models.fast' }
 * ```
 */
export interface RouterRule {
    when: string;
    route: string | {
        cell: CellRef;
        with?: Record<string, unknown>;
    } | {
        model: string;
    } | {
        value: unknown;
    };
}
/**
 * A cell definition. This is the spec — what comes out of the YAML
 * parser. The runtime instantiates a `Cell` (the live thing) from a
 * `CellDef` (the static description).
 *
 * Field usage by kind:
 *   - value:    `value`
 *   - formula:  `expr`
 *   - api:      `endpoint`, `method`, `headers`
 *   - program:  `code`, `language`
 *   - sensor:   `source`, `rate`
 *   - listener: `watch`, `condition`, `action`
 *   - router:   `rules`
 *   - io:       `port`, `direction`
 *
 * `deps` is for explicit dependencies. For formulas, the engine also
 * auto-detects by scanning the expression.
 */
export interface CellDef {
    id: CellId;
    kind: CellKind;
    value?: unknown;
    expr?: string;
    endpoint?: string;
    method?: string;
    headers?: Record<string, string>;
    code?: string;
    language?: 'javascript' | 'python' | 'wasm';
    memo?: boolean;
    source?: string;
    rate?: number;
    default?: unknown;
    watch?: CellRef[];
    condition?: string;
    action?: string;
    rules?: RouterRule[];
    port?: string;
    direction?: 'in' | 'out' | 'bidirectional';
    description?: string;
    unit?: string;
    inputType?: string;
    outputType?: string;
    deps?: CellRef[];
    permissions?: {
        read?: string[];
        write?: string[];
        call?: string[];
    };
}
/**
 * A live cell instance. The runtime's working representation.
 *
 * Built from a `CellDef` by `engine.loadSheet()` or `engine.register()`.
 * The engine holds these in a `Map<CellId, Cell>`.
 */
export interface Cell {
    id: CellId;
    def: CellDef;
    /** Current value (with status) */
    value: CellValue;
    /** Dependencies (filled in at load time) */
    dependencies: Set<CellId>;
    /** Cells that depend on this one (reverse index, filled in at load) */
    dependents: Set<CellId>;
    /** Last evaluation context (for diagnostics) */
    lastContext?: CallerContext;
    /**
     * Per-context cache. Same cell + different caller context =
     * different cached value. Key is `contextKey(ctx)`.
     */
    contextCache: Map<string, CellValue>;
}
/**
 * A subscription to a cell. Fires when the cell's value changes
 * (according to the optional `filter`).
 *
 * Used by:
 *   - The MCP server (notify clients of cell changes)
 *   - Listeners (chain effectful cells)
 *   - UI components (live updates)
 */
export interface Subscription {
    id: string;
    cellId: CellId;
    callback: (value: CellValue, prev: CellValue) => void | Promise<void>;
    filter?: (value: CellValue, prev: CellValue) => boolean;
}
/**
 * A complete sheet: title, axes (what rows and columns mean), and
 * the cells that compose it.
 *
 * Axes are semantic: `rows.name = "tenant"` means each row is a
 * tenant, not just a coordinate. The engine doesn't enforce this
 * — it's documentation for humans and routing rules.
 */
export interface SheetDef {
    id: string;
    title?: string;
    description?: string;
    version?: string;
    axes?: {
        rows?: {
            name: string;
            values?: unknown[];
        };
        cols?: {
            name: string;
            values?: unknown[];
        };
    };
    cells: CellDef[];
}
/**
 * The trace of a particular evaluation. Used for:
 *   - debugging ("why did this cell return X?")
 *   - time-travel ("what was the value at T?")
 *   - decomposition (which cells should be replaced?)
 *
 * Every cell evaluation can emit a trace. The engine keeps a ring
 * buffer of recent traces accessible via `engine.getTraces(limit)`.
 */
export interface EvaluationTrace {
    cellId: CellId;
    startedAt: number;
    completedAt?: number;
    durationMs?: number;
    context: CallerContext;
    effects?: Effect[];
    error?: {
        message: string;
        stack?: string;
    };
}
//# sourceMappingURL=types.d.ts.map