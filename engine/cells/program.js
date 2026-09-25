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
export async function evaluateProgram(cell, ctx, input, runtime) {
    if (!cell.def.code) {
        return { data: undefined, status: 'error', error: { message: 'program cell has no code' } };
    }
    try {
        // Build an AsyncFunction so `await` works in user code. The
        // constructor of AsyncFunction is `async function (...args) { body }`.
        // We grab it from an existing async function's prototype to avoid
        // a direct reference to the global (which some bundlers complain
        // about).
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        // eslint-disable-next-line no-new-func
        const fn = new AsyncFunction('input', 'caller', 'runtime', 'clamp', 'abs', 'min', 'max', cell.def.code);
        // Helpers exposed to user code. Clamp is the most useful for
        // control systems; abs/min/max are common math primitives.
        const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
        const result = await fn(input, ctx, runtime, clamp, Math.abs, Math.min, Math.max);
        return {
            data: result,
            status: 'ready',
            computedAt: Date.now(),
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (process.env.QUILT_DEBUG) {
            console.error(`[quilt] program cell ${cell.id} failed:`, err);
        }
        return { data: undefined, status: 'error', error: { message } };
    }
}
//# sourceMappingURL=program.js.map