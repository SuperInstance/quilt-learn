/**
 * @file index.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  PUBLIC API OF @quilt/core
 * =====================================================================
 *
 * This file is the single entry point for the Quilt runtime. It
 * re-exports everything consumers need: types, the engine, the
 * parser, and the individual cell evaluators.
 *
 * Consumers typically import:
 *   - `QuiltEngine` to instantiate the runtime
 *   - `parseSheet` to load YAML
 *   - The types for type annotations
 *
 * The cell evaluators are exported for advanced use (custom cell
 * types, testing) but most consumers won't need them.
 *
 * =====================================================================
 */
export type { CellId, CellRef, CellKind, CellStatus, CellValue, Effect, CallerContext, CellDef, Cell, SheetDef, RouterRule, Subscription, EvaluationTrace, } from './types.js';
export { QuiltEngine } from './engine.js';
export type { EngineOptions } from './engine.js';
export { emptyContext, extendContext, contextKey, evalWhen, } from './context.js';
export { parseSheet, validateSheet, serializeSheet } from './parser.js';
export { evaluateValue } from './cells/value.js';
export { evaluateFormula } from './cells/formula.js';
export { evaluateApi } from './cells/api.js';
export { evaluateProgram, type ProgramRuntime } from './cells/program.js';
export { evaluateRouter } from './cells/router.js';
export { fireListener } from './cells/listener.js';
export { makeSensorValue } from './cells/sensor.js';
export { makeIoValue } from './cells/io.js';
export { evaluateAI, type AIKind, type AICellConfig, type AIEngineLike } from './cells/ai.js';
export { Gesture, headingAlignment, gestureDistance, type Point } from './gesture.js';
//# sourceMappingURL=index.d.ts.map