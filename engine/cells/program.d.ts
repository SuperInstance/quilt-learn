/**
 * @file cells/program.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE PROGRAM CELL — stateful, side-effectful logic
 * =====================================================================
 *
 * A program cell runs a user-provided function. The function receives
 * the cell's input (resolved dependency values) and the caller
 * context, and returns a value. It can also read/write other cells
 * via the runtime handle.
 *
 * This is the cell type that makes Quilt Turing-complete in the
 * "anything you can do in code" sense. Use sparingly — prefer
 * formula for pure computations.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── types
 *        ▲
 *        │ imports
 *        │
 *     program.ts  ◄── THIS FILE: evaluateProgram() + ProgramRuntime
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (implements ProgramRuntime, calls evaluateProgram)
 *
 * The engine itself implements the `ProgramRuntime` interface, so
 * user code can call `runtime.get('other-cell')` from inside a
 * program cell. This is the escape hatch that makes the runtime
 * composable from user code.
 *
 * =====================================================================
 *  SECURITY WARNING
 * =====================================================================
 *
 * Program cells execute arbitrary code in the current process. In
 * production, the runtime should sandbox this (e.g. `isolated-vm`,
 * `worker_threads`, or WASM). For MVP, we trust the author of the
 * sheet. This is documented in the security model and will be
 * addressed in v0.2.
 *
 * The compiler is the host process's `AsyncFunction` constructor.
 * Code runs in the global scope of the host. Don't pass user input
 * to program cells in a multi-tenant system without sandboxing.
 *
 * =====================================================================
 */
import type { Cell, CellValue, CallerContext, CellId } from '../types.js';
/**
 * The runtime handle exposed to user code in program cells. This is
 * how a program cell can read, write, or call other cells.
 *
 * The engine implements this interface (see engine.ts) and passes
 * itself in when calling evaluateProgram.
 *
 * All methods are async because cell calls may themselves be async
 * (api cells, program cells, etc.).
 */
export interface ProgramRuntime {
    /** Get a cell's current value. */
    get: (id: CellId) => Promise<CellValue>;
    /** Set a cell's value. Triggers downstream recomputation. */
    set: (id: CellId, value: unknown) => Promise<void>;
    /**
     * Call a cell as a capability, with optional input. An optional
     * CallerContext can be supplied (play-test fix: listener actions pass
     * a fresh event context so actions can read caller.metadata and are
     * not swallowed by the per-context memoization cache).
     */
    call: (id: CellId, input?: unknown, ctx?: import('../types.js').CallerContext) => Promise<CellValue>;
}
/**
 * Evaluate a program cell. Compiles the user code as an AsyncFunction
 * and invokes it with the input, context, and runtime handle.
 *
 * The user function can:
 *   - return any value (becomes the cell's data)
 *   - throw to produce an error CellValue
 *   - call `await runtime.get(id)` / `set(id, v)` / `call(id, input)`
 *   - use the helpers: clamp, abs, min, max
 *
 * @param cell - the cell instance
 * @param ctx - the caller context
 * @param input - the cell's input (resolved by the engine)
 * @param runtime - the runtime handle for reading/writing other cells
 * @returns the computed value, or error
 */
export declare function evaluateProgram(cell: Cell, ctx: CallerContext, input: unknown, runtime: ProgramRuntime): Promise<CellValue>;
//# sourceMappingURL=program.d.ts.map