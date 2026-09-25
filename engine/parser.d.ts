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
import type { SheetDef } from './types.js';
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
export declare function parseSheet(source: string): SheetDef;
/**
 * Validate a raw object as a SheetDef. Used by parseSheet and also
 * exported so callers that have already parsed YAML (e.g. from JSON)
 * can validate without re-parsing.
 */
export declare function validateSheet(raw: unknown): SheetDef;
/**
 * Serialize a SheetDef back to YAML. The inverse of parseSheet.
 *
 * Used by:
 *   - The CLI's save command
 *   - The web UI's export feature
 *   - Tests that round-trip through YAML
 */
export declare function serializeSheet(sheet: SheetDef): string;
//# sourceMappingURL=parser.d.ts.map