/**
 * @file cells/io.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE IO CELL — bidirectional port to the outside world
 * =====================================================================
 *
 * An IO cell is the I/O boundary of the system. It can:
 *   - Receive input from a form, webhook, MCP tool call, GPIO, etc.
 *   - Send output to the same or a different port.
 *
 * Inputs come in via the engine's `push` method (same as sensors).
 * Outputs are written when the cell's value is consumed (the
 * `direction` field controls whether it's push, pull, or both).
 *
 * In the spreadsheet metaphor: an IO cell is the cell that's bound
 * to a UI widget, a webhook, a hardware pin, or an MCP tool.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── types
 *        ▲
 *        │ imports
 *        │
 *     io.ts  ◄── THIS FILE: makeIoValue (a tiny factory)
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (calls makeIoValue when push() is invoked)
 *     adapters/* (external: forms, webhooks, GPIO, MCP — push/pull)
 *
 * Like sensors, IO cells are PUSH-BASED for inputs. Unlike sensors,
 * they can also produce output (when their value is consumed by
 * other cells or when an external system reads from them).
 *
 * =====================================================================
 */
import type { CellValue } from '../types.js';
/**
 * Result of an IO push. (Reserved for future use — e.g. for
 * delivery confirmations or backpressure stats.)
 */
export interface IoPushResult {
    delivered: boolean;
}
/**
 * Build a `CellValue` wrapping an IO event.
 *
 * Used by the engine's `push` method when an IO cell receives an
 * input from a form, webhook, or MCP tool call.
 *
 * @param data - the input payload
 * @returns a ready CellValue
 */
export declare function makeIoValue(data: unknown): CellValue;
//# sourceMappingURL=io.d.ts.map