/**
 * @file cells/ai.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE AI CELL — language model, embedding, vision, code
 * =====================================================================
 *
 * An AI cell is a reactive cell that calls an LLM provider when its
 * inputs change. It supports 8 sub-kinds via the `ai_kind` field:
 *
 *   - ai.llm       — chat completion
 *   - ai.embed     — text → vector
 *   - ai.image     — text → image
 *   - ai.translate — text → translated text
 *   - ai.sentiment — text → {label, score}
 *   - ai.summarize — long text → short text
 *   - ai.code      — description → code
 *   - ai.vision    — image + text → text
 *
 * The cell is async. The runtime queues it for evaluation when
 * upstream cells change. Caching is by input hash.
 *
 * Providers: zai, kimi, deepseek, cloudflare (or any custom provider
 * registered with the AIEngine).
 *
 * =====================================================================
 *  USAGE IN A SHEET
 * =====================================================================
 *
 *   - id: ai.answer
 *     kind: ai
 *     ai_kind: ai.llm
 *     provider: zai
 *     model: glm-4.5
 *     prompt: "What is Quilt?"
 *     temperature: 0.7
 *     max_tokens: 500
 *
 * The cell's value is the model's response. If the call fails, the
 * cell's error field is set and the value is null.
 *
 * =====================================================================
 *  INTEGRATION WITH @quilt/ai
 * =====================================================================
 *
 * The AI cell is a thin wrapper around @quilt/ai's AIEngine. To use it:
 *
 *   import { Quilt } from '@quilt/core';
 *   import { AIEngine } from '@quilt/ai';
 *
 *   const ai = new AIEngine({ zaiKey: process.env.ZAI_TOKEN, ... });
 *   const q = new Quilt({ ai });
 *
 *   q.load({ cells: [{ id: 'a', kind: 'ai', provider: 'zai', ... }] });
 *   await q.tick();
 *   console.log(q.get('a')); // the model's response
 *
 * =====================================================================
 */
/** Evaluate an AI cell. */
export async function evaluateAI(cell, _context, engine, resolveCellValue) {
    // Helper: substitute {{cell.id}} in a string
    const substitute = (s) => {
        if (!resolveCellValue)
            return s;
        return s.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, id) => {
            const v = resolveCellValue(id);
            if (v === null || v === undefined)
                return '';
            if (typeof v === 'string')
                return v;
            return JSON.stringify(v);
        });
    };
    // Build the AI config from the cell
    const config = {
        id: cell.id,
        kind: 'ai',
        ai_kind: cell.ai_kind,
        provider: cell.provider,
        model: cell.model,
    };
    if (cell.prompt !== undefined)
        config.prompt = substitute(cell.prompt);
    if (cell.input !== undefined) {
        // If it's a template like {{cell.id}}, substitute; otherwise use as-is
        config.input = cell.input.startsWith('{{') ? substitute(cell.input) : cell.input;
    }
    if (cell.image !== undefined)
        config.image = substitute(cell.image);
    if (cell.target !== undefined)
        config.target = cell.target;
    if (cell.language !== undefined)
        config.language = cell.language;
    if (cell.max_words !== undefined)
        config.max_words = cell.max_words;
    if (cell.temperature !== undefined)
        config.temperature = cell.temperature;
    if (cell.max_tokens !== undefined)
        config.max_tokens = cell.max_tokens;
    if (cell.system !== undefined)
        config.system = substitute(cell.system);
    // PLAYTEST PATCH 8: forward schema-carrying fields the whitelist drops.
    // Typed-decision cells (sysone.choice / sysone.score / sysone.noul) declare
    // their fence in the sheet — options, min, max, rubric — and the provider
    // adapter must receive them or the fence silently degenerates to defaults.
    // Rule: pass through any own field not already handled, when it is a
    // primitive or an array of primitives (never functions / cell graphs).
    const HANDLED = new Set(['id', 'kind', 'ai_kind', 'provider', 'model', 'prompt', 'input',
        'image', 'target', 'language', 'max_words', 'temperature', 'max_tokens', 'system',
        'deps', 'watch', 'condition', 'action', 'code', 'value', 'default', 'description']);
    for (const [k, v] of Object.entries(cell)) {
        if (HANDLED.has(k) || k in config)
            continue;
        const passthrough = v === null ||
            typeof v === 'number' || typeof v === 'boolean' ||
            (typeof v === 'string' && k !== 'expr') ||
            (Array.isArray(v) && v.every(x => typeof x !== 'object' || x === null));
        if (passthrough)
            config[k] = v;
    }
    try {
        const result = await engine.call(config, { useCache: true });
        return { value: result, error: null };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { value: null, error: message };
    }
}
//# sourceMappingURL=ai.js.map