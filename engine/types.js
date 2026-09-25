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
export {};
//# sourceMappingURL=types.js.map