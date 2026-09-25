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
// =====================================================================
//  ENGINE — the runtime
// =====================================================================
export { QuiltEngine } from './engine.js';
// =====================================================================
//  CONTEXT — propagation and evaluation
// =====================================================================
export { emptyContext, extendContext, contextKey, evalWhen, } from './context.js';
// =====================================================================
//  PARSER — YAML loading and saving
// =====================================================================
export { parseSheet, validateSheet, serializeSheet } from './parser.js';
// =====================================================================
//  CELL EVALUATORS — for advanced use and testing
// =====================================================================
export { evaluateValue } from './cells/value.js';
export { evaluateFormula } from './cells/formula.js';
export { evaluateApi } from './cells/api.js';
export { evaluateProgram } from './cells/program.js';
export { evaluateRouter } from './cells/router.js';
export { fireListener } from './cells/listener.js';
export { makeSensorValue } from './cells/sensor.js';
export { makeIoValue } from './cells/io.js';
export { evaluateAI } from './cells/ai.js';
// =====================================================================
//  GESTURE — the shape of a value's motion through state space
// =====================================================================
export { Gesture, headingAlignment, gestureDistance } from './gesture.js';
//# sourceMappingURL=index.js.map