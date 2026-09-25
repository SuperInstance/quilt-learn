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
function sub(a, b) {
    return a.map((x, i) => x - (b[i] ?? 0));
}
function norm(a) {
    return Math.sqrt(a.reduce((s, x) => s + x * x, 0));
}
function dot(a, b) {
    return a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
}
function unit(a) {
    const n = norm(a);
    return n > 1e-12 ? a.map((x) => x / n) : a.map(() => 0);
}
function cosine(a, b) {
    const na = norm(a);
    const nb = norm(b);
    return na < 1e-12 || nb < 1e-12 ? 0 : dot(a, b) / (na * nb);
}
/**
 * The path a value (or vector of values) traces through state space over
 * successive readings — read as a gesture, not a point.
 */
export class Gesture {
    /** The ordered readings, oldest first. Defensively copied. */
    points;
    /**
     * @param points ordered readings, oldest first. Scalars are accepted as
     *   1-D points via {@link Gesture.fromSeries}.
     */
    constructor(points = []) {
        this.points = points.map((p) => [...p]);
    }
    /** Build a gesture from a scalar series (e.g. one cell's value history). */
    static fromSeries(series) {
        return new Gesture(series.map((v) => [v]));
    }
    get length() {
        return this.points.length;
    }
    /** The consecutive step vectors — the discrete velocity. */
    steps() {
        const out = [];
        for (let i = 1; i < this.points.length; i++) {
            out.push(sub(this.points[i], this.points[i - 1]));
        }
        return out;
    }
    /** Total distance travelled through state space. 0 for < 2 readings. */
    arcLength() {
        return this.steps().reduce((s, d) => s + norm(d), 0);
    }
    /** Magnitude of the latest step — how fast the value is moving now. */
    speed() {
        const s = this.steps();
        return s.length ? norm(s[s.length - 1]) : 0;
    }
    /**
     * Unit direction of the latest step — the gesture's **`d_mu`** (where the
     * value is heading now). Zero vector for < 2 readings or a still value.
     */
    heading() {
        const s = this.steps();
        return s.length ? unit(s[s.length - 1]) : this.points[0]?.map(() => 0) ?? [];
    }
    /**
     * Curvature — total turning **within a plane**: summed `1 − cos` between
     * consecutive step directions. 0 for a straight drift at any speed; large
     * for a value that keeps lurching between states.
     */
    bendingEnergy() {
        const s = this.steps();
        let energy = 0;
        for (let i = 1; i < s.length; i++) {
            if (norm(s[i - 1]) > 1e-12 && norm(s[i]) > 1e-12) {
                energy += 1 - cosine(s[i - 1], s[i]);
            }
        }
        return energy;
    }
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
    twistEnergy() {
        const s = this.steps();
        let energy = 0;
        for (let i = 2; i < s.length; i++) {
            const s1 = s[i - 2];
            const s2 = s[i - 1];
            const s3 = s[i];
            const n1 = norm(s1);
            if (n1 < 1e-12)
                continue;
            const e1 = s1.map((x) => x / n1);
            const d21 = dot(s2, e1);
            const perp = s2.map((x, k) => x - d21 * e1[k]); // s2 ⟂ e1
            const np = norm(perp);
            if (np < 1e-12)
                continue; // s1 ∥ s2: no plane to leave
            const e2 = perp.map((x) => x / np);
            const n3 = norm(s3);
            if (n3 < 1e-12)
                continue;
            const d3 = s3.map((x) => x / n3);
            const c1 = dot(d3, e1);
            const c2 = dot(d3, e2);
            const out = d3.map((x, k) => x - c1 * e1[k] - c2 * e2[k]);
            energy += Math.min(norm(out), 1);
        }
        return energy;
    }
    /**
     * How flat the gesture stays, in `[0, 1]`: 1 for a path whose whole motion
     * lives in one plane (all bending, no twist), falling toward 0 as more of
     * its turning leaves the plane. 1 for a path too short to twist. The
     * scale-free inverse of {@link Gesture.twistEnergy}.
     */
    planarity() {
        const vertices = Math.max(0, this.steps().length - 1);
        if (vertices === 0)
            return 1;
        return Math.min(1, Math.max(0, 1 - this.twistEnergy() / vertices));
    }
    /**
     * Resample the gesture to `n` points spaced evenly **by arc length** along the
     * path (not by index). This is the reparameterization that makes two gestures
     * comparable regardless of how fast or how often each was sampled: a path
     * recorded in 6 lazy readings and the same path recorded in 60 frantic ones
     * resample to the same shape. Returns the original points for `n < 2` or a
     * path with no length; a still gesture resamples to repeats of its point.
     */
    resample(n) {
        if (n < 1)
            return [];
        if (this.points.length === 0)
            return [];
        if (this.points.length === 1 || n === 1) {
            return Array.from({ length: Math.max(1, n) }, () => [...this.points[0]]);
        }
        const steps = this.steps();
        const segLen = steps.map((d) => norm(d));
        const total = segLen.reduce((s, l) => s + l, 0);
        if (total < 1e-12) {
            // No travel: every resample point is the start.
            return Array.from({ length: n }, () => [...this.points[0]]);
        }
        // Cumulative arc length at each original point.
        const cum = [0];
        for (const l of segLen)
            cum.push(cum[cum.length - 1] + l);
        const out = [];
        let seg = 0;
        for (let i = 0; i < n; i++) {
            const target = (i / (n - 1)) * total;
            while (seg < segLen.length - 1 && cum[seg + 1] < target)
                seg++;
            const segStart = cum[seg];
            const t = segLen[seg] > 1e-12 ? (target - segStart) / segLen[seg] : 0;
            const p0 = this.points[seg];
            const p1 = this.points[seg + 1];
            out.push(p0.map((x, k) => x + t * (p1[k] - x)));
        }
        return out;
    }
}
/**
 * Do two gestures **trend** the same way? The cosine of their `d_mu`
 * headings, in `[-1, 1]` (1 = heading the same way, −1 = opposite). 0 if
 * either is still or their state spaces differ in dimension.
 */
export function headingAlignment(a, b) {
    const ha = a.heading();
    const hb = b.heading();
    if (ha.length !== hb.length)
        return 0;
    return cosine(ha, hb);
}
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
export function gestureDistance(a, b, samples = 32) {
    const n = Math.max(3, Math.floor(samples));
    const pa = a.resample(n);
    const pb = b.resample(n);
    if (pa.length < 2 || pb.length < 2) {
        return pa.length === pb.length ? 0 : 2;
    }
    const dirs = (pts) => {
        const out = [];
        for (let i = 1; i < pts.length; i++)
            out.push(sub(pts[i], pts[i - 1]));
        return out;
    };
    const da = dirs(pa);
    const db = dirs(pb);
    const m = Math.min(da.length, db.length);
    let sum = 0;
    for (let i = 0; i < m; i++) {
        if (norm(da[i]) < 1e-12 || norm(db[i]) < 1e-12)
            sum += 1;
        else
            sum += 1 - cosine(da[i], db[i]);
    }
    return m === 0 ? 0 : Math.min(2, Math.max(0, sum / m));
}
//# sourceMappingURL=gesture.js.map