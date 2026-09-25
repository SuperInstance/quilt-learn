/**
 * @file parser.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE YAML SHEET PARSER
 * =====================================================================
 *
 * Loads a sheet definition from YAML. Validates against the SheetDef
 * schema. Throws clear errors on bad input — bad YAML should never
 * crash the runtime.
 *
 * The parser is intentionally light on validation: it checks shape
 * but not semantic correctness. A formula with an unknown cell
 * reference will only fail at evaluation time. This is a deliberate
 * trade-off — early validation would require resolving all symbols,
 * which couples the parser to the engine.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts    ◄── SheetDef, CellDef, CellKind
 *        ▲
 *        │ imports
 *        │
 *     parser.ts   ◄── THIS FILE: parseSheet(), validateSheet(), serializeSheet()
 *        ▲
 *        │ imports
 *        │
 *     cli/index.ts (loads sheets from the filesystem)
 *     mcp/server.ts (could load sheets on startup)
 *
 * =====================================================================
 *  WHAT THE PARSER DOES (AND DOESN'T)
 * =====================================================================
 *
 * Does:
 *   - Parse YAML via the `yaml` package
 *   - Verify the top-level shape (id, cells)
 *   - Verify each cell has a valid kind
 *   - Detect duplicate cell ids
 *
 * Doesn't (yet):
 *   - Validate formula expressions
 *   - Check that referenced cells exist
 *   - Enforce type signatures
 *   - Resolve cross-sheet references
 *
 * These can be added as additional validation passes. The current
 * goal is to catch structural errors with clear messages, then let
 * the runtime catch semantic errors.
 *
 * =====================================================================
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
const VALID_KINDS = [
    'value', 'formula', 'api', 'program', 'sensor', 'listener', 'router', 'io', 'ai',
];
/**
 * Parse a sheet from a YAML string. Returns a validated SheetDef.
 *
 * Throws on:
 *   - invalid YAML
 *   - top-level not an object
 *   - missing or non-string `id`
 *   - missing or non-array `cells`
 *   - cell with missing id or invalid kind
 *   - duplicate cell ids
 *
 * @param source - the YAML source string
 * @returns a validated SheetDef
 */
export function parseSheet(source) {
    const raw = parseYaml(source);
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('sheet must be a YAML mapping');
    }
    return validateSheet(raw);
}
/**
 * Validate a raw object as a SheetDef. Used by parseSheet and also
 * exported so callers that have already parsed YAML (e.g. from JSON)
 * can validate without re-parsing.
 */
export function validateSheet(raw) {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('sheet must be an object');
    }
    const r = raw;
    if (typeof r.id !== 'string') {
        throw new Error('sheet.id must be a string');
    }
    if (!Array.isArray(r.cells)) {
        throw new Error('sheet.cells must be an array');
    }
    const cells = r.cells.map((c, i) => validateCell(c, i));
    // Check for duplicate ids — a common mistake when copy-pasting
    const seen = new Set();
    for (const c of cells) {
        if (seen.has(c.id)) {
            throw new Error(`duplicate cell id: ${c.id}`);
        }
        seen.add(c.id);
    }
    return {
        id: r.id,
        title: typeof r.title === 'string' ? r.title : undefined,
        description: typeof r.description === 'string' ? r.description : undefined,
        version: typeof r.version === 'string' ? r.version : undefined,
        axes: r.axes && typeof r.axes === 'object' ? r.axes : undefined,
        cells,
    };
}
/**
 * Validate a raw object as a CellDef. Called per-cell by validateSheet.
 */
function validateCell(raw, index) {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`cell at index ${index} must be an object`);
    }
    const c = raw;
    if (typeof c.id !== 'string') {
        throw new Error(`cell at index ${index} must have an id`);
    }
    if (typeof c.kind !== 'string' || !VALID_KINDS.includes(c.kind)) {
        throw new Error(`cell ${c.id} has invalid kind: ${String(c.kind)}`);
    }
    return c;
}
/**
 * Serialize a SheetDef back to YAML. The inverse of parseSheet.
 *
 * Used by:
 *   - The CLI's save command
 *   - The web UI's export feature
 *   - Tests that round-trip through YAML
 */
export function serializeSheet(sheet) {
    return stringifyYaml(sheet, { lineWidth: 120 });
}
//# sourceMappingURL=parser.js.map