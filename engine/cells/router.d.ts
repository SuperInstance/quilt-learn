/**
 * @file cells/router.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE ROUTER CELL — caller-aware policy
 * =====================================================================
 *
 * A router cell doesn't compute anything itself. It delegates the
 * call to another cell based on rules evaluated in the caller's
 * context. This is the "if caller.row > 10 use Model A" primitive.
 *
 * The grid becomes a *policy mesh* because every router cell can
 * read the caller's position and route accordingly. Change one
 * router cell's rules — and every caller that routes through it
 * changes behavior.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts      ◄── RouterRule, CallerContext, CellValue
 *     context.ts    ◄── evalWhen (rule evaluation)
 *        ▲
 *        │ imports
 *        │
 *     router.ts     ◄── THIS FILE: evaluateRouter()
 *        ▲
 *        │ imports
 *        │
 *     engine.ts     (calls evaluateRouter for kind === 'router')
 *
 * =====================================================================
 *  RULE SEMANTICS
 * =====================================================================
 *
 * Rules are evaluated in order. The first one whose `when` evaluates
 * truthy wins. Each rule's `route` can be:
 *
 *   - string: a cell id — delegate to that cell
 *     e.g. { when: "...", route: "models.precise" }
 *
 *   - { cell, with }: delegate to a cell, then merge `with` into the result
 *     e.g. { when: "...", route: { cell: "models.precise", with: { tier: "gold" } } }
 *
 *   - { model }: swap the model for the next call (placeholder)
 *     e.g. { when: "...", route: { model: "gpt-4o" } }
 *
 *   - { value }: return a literal value (no delegation)
 *     e.g. { when: "...", route: { value: "premium" } }
 *
 * If no rule matches, the router returns `undefined` with status
 * 'ready'. The caller can decide what to do (default, error, etc.).
 *
 * =====================================================================
 */
import type { Cell, CellValue, CallerContext } from '../types.js';
import type { ProgramRuntime } from './program.js';
/**
 * Evaluate a router cell.
 *
 * Steps:
 *   1. Iterate rules in order
 *   2. For each rule, eval the `when` in the caller's context
 *   3. If truthy, dispatch on the route type
 *   4. Return the result of the delegation (or literal)
 *   5. If no rule matches, return undefined
 *
 * @param cell - the cell instance
 * @param ctx - the caller context (used to evaluate rules)
 * @param input - the input to pass to the delegated cell
 * @param runtime - the runtime handle (used to call delegated cells)
 * @returns the delegated CellValue, or undefined if no rule matched
 */
export declare function evaluateRouter(cell: Cell, ctx: CallerContext, input: unknown, runtime: ProgramRuntime): Promise<CellValue>;
//# sourceMappingURL=router.d.ts.map