/**
 * @file cells/sensor.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  THE SENSOR CELL — streaming input from the outside world
 * =====================================================================
 *
 * A sensor cell receives values pushed from an external source: an
 * MQTT broker, a Modbus device, a GPIO pin, a serial port, a
 * simulated stream. The runtime doesn't poll — adapters push values
 * in via `engine.push(id, data)`, and the runtime propagates.
 *
 * For the MVP, the engine's `push` method is the only entry point.
 * Real adapters (MQTT, Modbus, GPIO) are external packages that
 * call `engine.push` on their event loops.
 *
 * =====================================================================
 *  ROLE IN THE SYSTEM
 * =====================================================================
 *
 *     types.ts  ◄── types
 *        ▲
 *        │ imports
 *        │
 *     sensor.ts  ◄── THIS FILE: makeSensorValue (a tiny factory)
 *        ▲
 *        │ imports
 *        │
 *     engine.ts  (calls makeSensorValue when push() is invoked)
 *     adapters/* (external: MQTT, Modbus, GPIO — push to engine)
 *
 * Sensors are PUSH-BASED, not pull-based. You cannot call
 * `engine.get('sensor.cell')` and expect a fresh reading — you have
 * to wait for the adapter to push. This is by design: real sensors
 * have their own timing and the runtime shouldn't be in the loop.
 *
 * =====================================================================
 */
import type { CellValue } from '../types.js';
/**
 * Result of a push into a sensor cell. (Reserved for future use —
 * e.g. for backpressure or throttling stats.)
 */
export interface SensorPushResult {
    notified: number;
}
/**
 * Build a `CellValue` wrapping a sensor reading.
 *
 * Used by the engine's `push` method when a sensor cell receives
 * an external reading. Adapters that want to push to a sensor
 * should use `engine.push(id, data)` instead of calling this
 * directly.
 *
 * @param data - the raw reading from the sensor
 * @returns a ready CellValue
 */
export declare function makeSensorValue(data: unknown): CellValue;
//# sourceMappingURL=sensor.d.ts.map