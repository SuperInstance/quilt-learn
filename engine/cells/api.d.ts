/**
 * @file cells/api.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE API CELL — external endpoint or model call
 * =====================================================================
 *
 * An API cell makes a network request. It can be:
 *   - A plain HTTP endpoint (with optional template substitution)
 *   - A "model:" pseudo-endpoint (routes to a configured LLM provider)
 *   - An "mcp://" tool reference (routes to an MCP server)
 *
 * Async. May have effects (network, model). May be expensive.
 * Caller context can route which endpoint/model to use.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── types
 *     context.ts ◄── CallerContext (used for {{}} substitution)
 *        ▲
 *        │ imports
 *        │
 *     api.ts  ◄── THIS FILE: evaluateApi()
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (calls evaluateApi for kind === 'api')
 *
 * =====================================================================
 *  ENDPOINT SHAPES
 * =====================================================================
 *
 *   - HTTP:         https://api.example.com/v1/chat?row={{caller.row}}
 *   - Model:        model:openai/gpt-4o
 *   - MCP tool:     mcp://server-name/tool-name
 *
 * HTTP endpoints support `{{...}}` substitution in the URL with
 * fields from the caller context. Example:
 *   https://api.example.com/tenants/{{caller.row}}/status
 *   → https://api.example.com/tenants/boat-1/status
 *
 * Model and MCP endpoints are placeholders for now. The full
 * implementation will look up registered providers/connectors.
 *
 * =====================================================================
 */
import type { Cell, CellValue, CallerContext } from '../types.js';
/**
 * Injected fetch function. Allows tests to mock HTTP without
 * monkey-patching globalThis.fetch (which is brittle).
 *
 * The default implementation reads globalThis.fetch at call time
 * (not at module load) so it picks up test overrides correctly.
 */
export interface ApiExecutor {
    fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}
/**
 * Evaluate an API cell.
 *
 * Steps:
 *   1. Dispatch by endpoint kind (model / mcp / http)
 *   2. For HTTP, substitute caller context into the URL
 *   3. Make the request
 *   4. Return parsed response, or error
 *
 * @param cell - the cell instance
 * @param ctx - the caller context (for URL substitution)
 * @param input - optional input to pass as body
 * @param executor - injected fetch (for tests)
 * @returns a CellValue with the response data, or error
 */
export declare function evaluateApi(cell: Cell, ctx: CallerContext, input: unknown, executor?: ApiExecutor): Promise<CellValue>;
//# sourceMappingURL=api.d.ts.map