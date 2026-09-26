// quilt-learn/explorers.mjs — L2: THE EXPLORER GAMES.
//
// Four minds, one bandit, identical rations. This is the fleet's friendly
// competition as an experiment: the question is not "who wins" but "what is
// entropy WORTH when exploration is the whole game."
//
//   EPS     ε-greedy (ε=0.10)          — the classic reflex
//   UCB1    optimism in the face of    — the classic bound
//          uncertainty
//   BOLTZ   softmax annealed, picks    — pseudorandom entropy (fnv stream)
//   QUANTUM the SAME annealed softmax, — picks drawn from a MOTH-harvested
//           bit pool (true quantum measurement outcomes, receipted)
//
// BOLTZ vs QUANTUM isolates ONE variable: the entropy source. Same policy
// family, same temperature schedule, same rations. Everything lives in
// cells: beliefs (n, q), policy weights (w formulas with the annealed
// temperature), accumulated regret — the scoreboard sheet computes the
// winner with a formula, and a listener-free lazy engine keeps it fast.

import { fnv1a64 } from './receipts.mjs';
import { rng, mean, sd } from './util.mjs';
import { QuiltEngine } from '../engine/index.js';

export const EXPLORERS = ['eps', 'ucb', 'bz', 'qm', 'qm2', 'chord'];
const SOFTMAX_MINDS = ['bz', 'qm', 'qm2'];

// Deterministic environment: Bernoulli means per (seed, arm), and a fixed
// outcome bit per (seed, arm, pull) — a PAIRED design: all explorers face
// the exact same environment noise, so regret differences are pure policy.
export function makeBandit(seed, K = 10) {
  const means = Array.from({ length: K }, (_, k) => {
    const u = Number(BigInt(fnv1a64(`arm:${seed}:${k}`)) % 100000n) / 100000;
    return 0.15 + 0.7 * u;
  });
  const best = means.indexOf(Math.max(...means));
  return { means, best };
}

const outcome = (seed, k, t, meanK) =>
  Number(BigInt(fnv1a64(`env:${seed}:${k}:${t}`)) % 1000000n) / 1000000 < meanK ? 1 : 0;

// --- the seed sheet: environment + four belief systems + policy formulas
export function buildSeedSheet(seed, bandit, K) {
  const cells = [];
  for (let k = 0; k < K; k++) {
    cells.push({ id: `arm.mean.${k}`, kind: 'value', value: bandit.means[k], description: 'environment truth (visible to no policy)' });
  }
  for (const e of EXPLORERS) {
    for (let k = 0; k < K; k++) {
      cells.push({ id: `bel.${e}.n.${k}`, kind: 'value', value: 0 });
      cells.push({ id: `bel.${e}.q.${k}`, kind: 'value', value: 0 });
    }
    cells.push({ id: `bel.${e}.t`, kind: 'value', value: 0, description: 'pulls so far' });
    cells.push({ id: `reg.${e}`, kind: 'value', value: 0, description: 'cumulative regret' });
  }
  // UCB1 scores: the whole policy is one formula per arm — optimism as cells.
  // The CHORD mind gets the SAME optimism formulas — its difference is at the
  // decision border (quantum tie-break), not in the beliefs.
  for (const e of ['ucb', 'chord']) {
    for (let k = 0; k < K; k++) {
      cells.push({
        id: `score.${e}.${k}`, kind: 'formula',
        expr: `bel.${e}.q.${k} + Math.sqrt(2 * Math.log(bel.${e}.t + 1.01) / (bel.${e}.n.${k} + 0.01))`,
      });
    }
  }
  // BOLTZ/QUANTUM/QUANTUM-2 weights: annealed softmax IN the sheet.
  // Temperature is a formula of t: hot early (explore), cold late (exploit).
  for (const e of SOFTMAX_MINDS) {
    for (let k = 0; k < K; k++) {
      cells.push({
        id: `w.${e}.${k}`, kind: 'formula',
        expr: `Math.exp(bel.${e}.q.${k} / (0.15 + 1.2 / (bel.${e}.t + 1)))`,
      });
    }
  }
  // id hygiene: no id is a dotted path-prefix of another (engine rule —
  // see gradient_sheet.mjs note). arm.mean.*, bel.*, score.*, w.*, reg.*: siblings only.
  return cells;
}

const G = async (engine, id) => (await engine.get(id)).data;

// --- run one seed for all six explorers
// pickers = { epsStream(), bzPick(w), qmPick(w), qm2Pick(w), chordPick(scores) }
// v2 protocol: qm keeps the v1 shared realization (so the v1 result stays
// comparable); qm2 draws from a PER-SEED re-seeded stream (independent
// randomness per seed — the statistical fix); chord spends quantum entropy
// ONLY at decision borders (cortex doctrine: entropy for ties).
export async function runSeed(seed, { K = 10, T = 200, pickers } = {}) {
  const bandit = makeBandit(seed, K);
  const engine = new QuiltEngine(`explorers.seed.${seed}`, { eager: false });
  engine.loadSheet({ id: `explorers.${seed}`, title: `explorer games seed ${seed}`, cells: buildSeedSheet(seed, bandit, K) });
  const streams = { eps: pickers.epsStream };
  const picks = Object.fromEntries(EXPLORERS.map((e) => [e, []]));
  let chordTieBreaks = 0;

  for (let t = 1; t <= T; t++) {
    // phase 1 — read every policy input BEFORE any write (one graph sweep)
    const q = {}, n = {}, sc = {}, scc = {}, w = {}, tt = {};
    for (const e of EXPLORERS) {
      tt[e] = await G(engine, `bel.${e}.t`);
      q[e] = []; n[e] = [];
      for (let k = 0; k < K; k++) { q[e].push(await G(engine, `bel.${e}.q.${k}`)); n[e].push(await G(engine, `bel.${e}.n.${k}`)); }
    }
    for (let k = 0; k < K; k++) sc[k] = await G(engine, `score.ucb.${k}`);
    for (let k = 0; k < K; k++) scc[k] = await G(engine, `score.chord.${k}`);
    for (const e of SOFTMAX_MINDS) { w[e] = []; for (let k = 0; k < K; k++) w[e].push(await G(engine, `w.${e}.${k}`)); }

    // phase 2 — pick arms
    const pick = {};
    // EPS: ε-greedy on q
    {
      const e = 'eps';
      if (streams[e]() < 0.10) pick[e] = Math.floor(streams[e]() * K) % K;
      else { let bi = 0; for (let k = 1; k < K; k++) if (q[e][k] > q[e][bi]) bi = k; pick[e] = bi; }
    }
    // UCB1: argmax of the sheet's score cells
    {
      let bi = 0; for (let k = 1; k < K; k++) if (sc[k] > sc[bi]) bi = k;
      pick.ucb = bi;
    }
    // BOLTZ / QUANTUM / QUANTUM-2: inverse-CDF over the sheet's annealed
    // weights — identical policy, entropy source is the only variable
    for (const e of SOFTMAX_MINDS) pick[e] = pickers[e + 'Pick'](w[e]);
    // CHORD: UCB structure; quantum entropy spent ONLY at the border
    {
      let bi = 0; for (let k = 1; k < K; k++) if (scc[k] > scc[bi]) bi = k;
      let si = -1; for (let k = 0; k < K; k++) if (k !== bi && (si < 0 || scc[k] > scc[si])) si = k;
      const gap = (scc[si] - scc[bi]) / Math.max(1e-9, Math.abs(scc[bi]));
      if (gap < 0.08) {
        const tau = 0.05 * (Math.abs(scc[bi]) + Math.abs(scc[si]) + 1e-9);
        const w1 = Math.exp(scc[bi] / tau), w2 = Math.exp(scc[si] / tau);
        const u = pickers.chordStream();
        pick.chord = (u * (w1 + w2) < w1) ? bi : si;
        chordTieBreaks++;
      } else pick.chord = bi;
    }

    // phase 3 — the environment answers (paired noise), the sheet updates
    for (const e of EXPLORERS) {
      const k = pick[e];
      const r = outcome(seed, k, t, bandit.means[k]);
      const nn = n[e][k] + 1;
      const qq = q[e][k] + (r - q[e][k]) / nn;
      const reg = (await G(engine, `reg.${e}`)) + bandit.means[bandit.best] - bandit.means[k];
      await engine.set(`bel.${e}.n.${k}`, nn);
      await engine.set(`bel.${e}.q.${k}`, qq);
      await engine.set(`bel.${e}.t`, tt[e] + 1);
      await engine.set(`reg.${e}`, reg);
      picks[e].push(k);
    }
  }

  const result = { seed, best: bandit.best, means: bandit.means.map((m) => Math.round(m * 1000) / 1000), chordTieBreaks };
  for (const e of EXPLORERS) {
    const finalQ = []; for (let k = 0; k < K; k++) finalQ.push(await G(engine, `bel.${e}.q.${k}`));
    const identified = finalQ.indexOf(Math.max(...finalQ)) === bandit.best;
    result[e] = {
      regret: await G(engine, `reg.${e}`),
      identified,
      pullsBest: await G(engine, `bel.${e}.n.${bandit.best}`),
    };
  }
  return result;
}

// --- the full competition: one harvest, every seed, paired environments
// qm  = shared quantum realization (v1 protocol, kept for comparability)
// qm2 = per-seed re-seeded quantum streams (v2 protocol fix)
// chord = UCB structure + quantum tie-breaks at decision borders
export async function competition({ seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], T = 200, K = 10, vault } = {}) {
  const harvest = await vault.harvest(256);
  const shared = vault.stream(harvest);
  const chordStream = vault.streamFor(harvest, 'chord');
  const pseudo = rng(424242);
  const results = [];
  for (const seed of seeds) {
    const perSeed = vault.streamFor(harvest, `seed:${seed}`);
    const pickers = {
      epsStream: pseudo,
      bzPick: (w) => weightedPickLocal(w, pseudo()),
      qmPick: (w) => weightedPickLocal(w, shared()),
      qm2Pick: (w) => weightedPickLocal(w, perSeed()),
      chordStream,
    };
    results.push(await runSeed(seed, { K, T, pickers }));
  }
  return { harvest, results };
}

function weightedPickLocal(weights, u) {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(total > 0)) return Math.floor(u * weights.length) % weights.length;
  let x = u * total;
  for (let i = 0; i < weights.length; i++) { x -= Math.max(0, weights[i]); if (x <= 0) return i; }
  return weights.length - 1;
}

// --- direct CLI demo: node learn/explorers.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { MothVault } = await import('./moth.mjs');
  const vault = new MothVault({ label: 'explorers-cli', maxLiveJobs: 1 });
  const t0 = Date.now();
  const { harvest, results } = await competition({ seeds: [1, 2, 3], T: 150, vault });
  console.log(`harvest: mock=${harvest.mock} bits=${harvest.bits.length} digest=${harvest.poolDigest.slice(0, 10)} (${Date.now() - t0}ms)`);
  for (const r of results) {
    const line = EXPLORERS.map((e) => `${e}=${r[e].regret.toFixed(1)}${r[e].identified ? '✓' : '✗'}`).join('  ');
    console.log(`seed ${r.seed} (best arm ${r.best}): ${line}`);
  }
}
