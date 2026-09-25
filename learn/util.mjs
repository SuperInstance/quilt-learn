// quilt-learn/util.mjs — deterministic randomness + gesture metrics.
//
// Two families of helpers the whole lab shares:
//
//   1. rng(seed) — a fnv1a64 counter-mode stream. Everything in the lab is
//      reproducible from an integer seed: bandit arms, initial weights,
//      mutation draws. No Math.random anywhere on a scored path.
//
//   2. gesture(trajectory) — quilt-native fitness features computed over a
//      loss curve, the same way gesture.ts reads a polyline: arc length and
//      bending energy. A good optimizer is a SHORT, CALM curve: it descends
//      directly (low arc) without thrashing (low bending energy).

import { fnv1a64 } from './receipts.mjs';

// Deterministic uniform [0,1) stream from an integer seed.
export function rng(seed) {
  let i = 0;
  return () => {
    const h = fnv1a64(`rng:${seed}:${i++}`);
    return Number(BigInt(h) & 0xffffffffn) / 4294967296;
  };
}

// Box-Muller normal, from the deterministic stream.
export function rngNormal(stream, mu = 0, sigma = 1) {
  const u1 = Math.max(stream(), 1e-12);
  const u2 = stream();
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Gesture metrics over a 1-D trajectory treated as a polyline in time.
//   arcLength     — total vertical travel; a descending curve pays for every
//                   wobble twice (down and the re-climb).
//   bendingEnergy — sum of squared turn angles normalized by path length;
//                   oscillating optimizers light this up.
// Both are scale-free: the trajectory is min-max normalized first.
export function gesture(trajectory) {
  const n = trajectory.length;
  if (n < 3) return { arcLength: 0, bendingEnergy: 0 };
  const lo = Math.min(...trajectory), hi = Math.max(...trajectory);
  const span = hi - lo || 1;
  const ys = trajectory.map((v) => (v - lo) / span);
  let arc = 0;
  for (let i = 1; i < n; i++) arc += Math.abs(ys[i] - ys[i - 1]);
  let bending = 0;
  for (let i = 1; i < n - 1; i++) {
    const a1 = ys[i] - ys[i - 1], a2 = ys[i + 1] - ys[i];
    const turn = Math.atan2(a2, 1 / n) - Math.atan2(a1, 1 / n);
    bending += turn * turn;
  }
  return { arcLength: arc, bendingEnergy: bending / Math.max(1, n - 2) };
}

// Mean + sample sd.
export function mean(xs) { return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); }
export function sd(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, xs.length - 1));
}

// Behavioral distance between two loss trajectories (loom doctrine: pick
// elites that are both good AND different). L1 on normalized curves,
// resampled to a common length.
export function behaviorDistance(a, b) {
  const n = 64;
  const resample = (t) => {
    if (t.length === 0) return new Array(n).fill(1);
    const lo = Math.min(...t), hi = Math.max(...t), span = hi - lo || 1;
    return Array.from({ length: n }, (_, i) => {
      const x = (i / (n - 1)) * (t.length - 1);
      const j = Math.min(t.length - 2, Math.floor(x));
      const f = x - j;
      return ((t[j] * (1 - f) + t[j + 1] * f) - lo) / span;
    });
  };
  const ra = resample(a), rb = resample(b);
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.abs(ra[i] - rb[i]);
  return d / n;
}
