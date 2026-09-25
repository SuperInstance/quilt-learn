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
const defaultExecutor = {
    fetch: (input, init) => globalThis.fetch(input, init),
};
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
export async function evaluateApi(cell, ctx, input, executor = defaultExecutor) {
    const startedAt = Date.now();
    if (!cell.def.endpoint) {
        return { data: undefined, status: 'error', error: { message: 'api cell has no endpoint' } };
    }
    try {
        // Model calls — handled by the model provider registry
        if (cell.def.endpoint.startsWith('model:')) {
            return await callModel(cell, ctx, input, executor, startedAt);
        }
        // MCP tool references
        if (cell.def.endpoint.startsWith('mcp://')) {
            return await callMcpTool(cell, ctx, input, startedAt);
        }
        // HTTP — substitute {{caller.row}} etc. in URL
        const url = substitute(cell.def.endpoint, ctx);
        const method = cell.def.method ?? 'GET';
        const headers = cell.def.headers ?? { 'Content-Type': 'application/json' };
        const init = { method, headers };
        if (method !== 'GET' && method !== 'HEAD' && input !== undefined) {
            init.body = typeof input === 'string' ? input : JSON.stringify(input);
        }
        const response = await executor.fetch(url, init);
        const duration = Date.now() - startedAt;
        if (!response.ok) {
            return {
                data: undefined,
                status: 'error',
                error: { message: `HTTP ${response.status} ${response.statusText}` },
            };
        }
        const contentType = response.headers.get('content-type') ?? '';
        const data = contentType.includes('application/json') ? await response.json() : await response.text();
        return {
            data,
            status: 'ready',
            computedAt: Date.now(),
            effects: [{ kind: 'network', url, method }, { kind: 'compute', ms: duration }],
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { data: undefined, status: 'error', error: { message } };
    }
}
/**
 * Call a model provider. Placeholder for now — the real implementation
 * will look up the provider, swap models based on caller context, and
 * call the appropriate LLM API (OpenAI, Anthropic, Ollama, etc.).
 */
async function callModel(cell, _ctx, _input, _executor, startedAt) {
    return {
        data: { model: cell.def.endpoint, note: 'model calls not yet implemented' },
        status: 'ready',
        computedAt: Date.now(),
        effects: [{ kind: 'model', provider: cell.def.endpoint ?? '' }, { kind: 'compute', ms: Date.now() - startedAt }],
    };
}
/**
 * Call an MCP tool. Placeholder for now — the real implementation
 * will route the call through the registered MCP client.
 */
async function callMcpTool(cell, _ctx, _input, startedAt) {
    return {
        data: { tool: cell.def.endpoint, note: 'MCP tool calls not yet implemented' },
        status: 'ready',
        computedAt: Date.now(),
        effects: [{ kind: 'network', url: cell.def.endpoint ?? '', method: 'MCP' }, { kind: 'compute', ms: Date.now() - startedAt }],
    };
}
/**
 * Substitute `{{path.to.field}}` patterns in a template string with
 * values from the caller context. Dotted paths traverse the context
 * object. Missing paths become empty strings.
 *
 * Example:
 *   substitute("https://api.example.com/{{caller.row}}", { row: "boat-1", ... })
 *   → "https://api.example.com/boat-1"
 *
 * This is intentionally simple. For complex templates, use a proper
 * template engine.
 */
function substitute(template, ctx) {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const parts = path.trim().split('.');
        let value = ctx;
        for (const p of parts) {
            if (value && typeof value === 'object' && p in value) {
                value = value[p];
            }
            else {
                return '';
            }
        }
        return String(value ?? '');
    });
}
//# sourceMappingURL=api.js.map