/**
 * @file gesture.ts
 * @module @quilt/core
 *
 * =====================================================================
 *  GESTURE — the shape of motion through state space
 * =====================================================================
 *
 * A Quilt cell does not hold a value; it *moves*. Each re-evaluation
 * pushes a new reading, so a cell (or a set of numeric cells read
 * together) traces a **path** through state space over time. Usually we
 * look at where it is now — the latest value, a point. A tensor is a
 * function approximator, so a point is what it compares.
 *
 * This reads the motion itself. A sequence of readings is not a list of
 * points; it is a **gesture**, and a gesture has geometry a snapshot
 * cannot hold — read here **order by order**:
 *
 *   1st  `arcLength` / `heading`  — how far it has travelled, and the
 *        unit direction it is going *now* (a velocity: the fleet's `d_mu`).
 *   2nd  `bendingEnergy`          — curvature: how hard it turns *within*
 *        a plane (a still cell warming steadily has none; a cell that
 *        lurches between states has a lot).
 *   3rd  `twistEnergy`            — torsion: how much it turns *out of*
 *        that plane, into a fresh dimension of state space
 *        (`planarity` is the scale-free inverse).
 *
 * The third order is the fleet's oldest law made a number here at the
 * substrate: *the property is in the twist* (SuperInstance/twist-engine —
 * *layers + deliberate offset → interference → emergence; no new atoms, a
 * new angle*). New structure is not more turning within the current plane;
 * it is the turning that reaches out of it.
 *
 * This is the neutral primitive the fleet's other nodes each specialize:
 * musician-soul's `AbstractionSpline` (over notes), elephant's
 * `VibeTrajectory` (over a room's dials), and tensor-midi's `Clip` (over a
 * conversation). Here it is domain-free — any numeric path — because the
 * substrate is where those abstractions compose.
 *
 * Pure TypeScript, zero dependencies, and never throws on empty or
 * degenerate input.
 *
 * =====================================================================
 */
/** A point in state space (any fixed dimensionality). */
export type Point = number[];
/**
 * The path a value (or vector of values) traces through state space over
 * successive readings — read as a gesture, not a point.
 */
export declare class Gesture {
    /** The ordered readings, oldest first. Defensively copied. */
    readonly points: Point[];
    /**
     * @param points ordered readings, oldest first. Scalars are accepted as
     *   1-D points via {@link Gesture.fromSeries}.
     */
    constructor(points?: Point[]);
    /** Build a gesture from a scalar series (e.g. one cell's value history). */
    static fromSeries(series: number[]): Gesture;
    get length(): number;
    /** The consecutive step vectors — the discrete velocity. */
    steps(): Point[];
    /** Total distance travelled through state space. 0 for < 2 readings. */
    arcLength(): number;
    /** Magnitude of the latest step — how fast the value is moving now. */
    speed(): number;
    /**
     * Unit direction of the latest step — the gesture's **`d_mu`** (where the
     * value is heading now). Zero vector for < 2 readings or a still value.
     */
    heading(): Point;
    /**
     * Curvature — total turning **within a plane**: summed `1 − cos` between
     * consecutive step directions. 0 for a straight drift at any speed; large
     * for a value that keeps lurching between states.
     */
    bendingEnergy(): number;
    /**
     * Torsion — total **twist**: the turning that leaves the osculating plane.
     * Per interior vertex the contribution is `sin θ`, where θ is the angle by
     * which the next step leaves the plane of the previous two, so each vertex
     * is in `[0, 1]` and a straight or planar path contributes 0. Needs ≥4
     * readings.
     *
     * Zero however hard a path bends, as long as it bends in one plane; positive
     * only when the motion opens a genuinely new dimension of state space — *the
     * property is in the twist*.
     */
    twistEnergy(): number;
    /**
     * How flat the gesture stays, in `[0, 1]`: 1 for a path whose whole motion
     * lives in one plane (all bending, no twist), falling toward 0 as more of
     * its turning leaves the plane. 1 for a path too short to twist. The
     * scale-free inverse of {@link Gesture.twistEnergy}.
     */
    planarity(): number;
    /**
     * Resample the gesture to `n` points spaced evenly **by arc length** along the
     * path (not by index). This is the reparameterization that makes two gestures
     * comparable regardless of how fast or how often each was sampled: a path
     * recorded in 6 lazy readings and the same path recorded in 60 frantic ones
     * resample to the same shape. Returns the original points for `n < 2` or a
     * path with no length; a still gesture resamples to repeats of its point.
     */
    resample(n: number): Point[];
}
/**
 * Do two gestures **trend** the same way? The cosine of their `d_mu`
 * headings, in `[-1, 1]` (1 = heading the same way, −1 = opposite). 0 if
 * either is still or their state spaces differ in dimension.
 */
export declare function headingAlignment(a: Gesture, b: Gesture): number;
/**
 * How differently two gestures **move**, free of where they are, how big they
 * are, and how fast or often each was sampled.
 *
 * Both gestures are first resampled to a common count of points spaced evenly by
 * **arc length** ({@link Gesture.resample}), then reduced to unit step-directions
 * and scored by mean angular difference (`1 − cos`). The arc-length
 * reparameterization is what lets a path recorded in 6 readings be compared with
 * the same path recorded in 60 — so this is the comparison that genuinely travels
 * across nodes, whose absolute coordinates, scales, and sampling rates all
 * differ but whose *shape of going* is comparable.
 *
 * Range 0 (same motion) to 2 (opposed at every step); symmetric; 0 to itself.
 * `samples` is the shared resolution (default 32; clamped to ≥ 3).
 */
export declare function gestureDistance(a: Gesture, b: Gesture, samples?: number): number;
//# sourceMappingURL=gesture.d.ts.map