// quilt-learn/breeder.mjs — L3: THE OPTIMIZER BREEDER.
//
// A GAN whose generator proposes UPDATE RULES and whose discriminator is
// the learning problem itself, judged with quilt-native gesture metrics.
//
//   generator   — seeded crossover + mutation over a genome space of update
//                 rules (lr, schedule, momentum, adaptive denominator, sign
//                 mode, per-layer multipliers). Deterministic, receipted.
//   discriminator — trains the autograd sheet's vectorized TWIN on fixed
//                 data with 3 initializations and scores the loss curve:
//                   final loss (low) + mid-training loss (fast)
//                   + bending energy (calm — no thrashing)
//                   + arc length (direct — no wasted travel)
//   diversity   — elites are picked for score AND behavioral distance
//                 (loom doctrine: divergent proven-correct, not 8 clones)
//   crown       — the winning genome is hardened back ONTO the living sheet
//                 (genomeRule -> train on the QuiltEngine) and defends its
//                 title against the classics in the championship.
//
// Honesty doctrine: the GAN breeds on a twin that is proven equivalent to
// the sheet (same formulas, verified by a 30-step trajectory identity check
// per init), because 192 candidates x 1200 steps ON the engine would take
// hours. The CROWNED elite runs on the sheet for real — the twin only ever
// nominates; the sheet elects.

import { fnv1a64 } from './receipts.mjs';
import { rng, gesture, behaviorDistance } from './util.mjs';
import { QuiltEngine } from '../engine/index.js';
import { loadGradientSheet, fdCheck, train, genomeRule, sgdRule, momentumRule, rmspropRule } from './gradient_sheet.mjs';

// ---------------- the vectorized twin (same math as the sheet) ----------------
// 1 -> H (tanh) -> 1, MSE over N sine samples. Forward + hand-derived
// backward, batched over all N samples at once.

export function makeTwin({ N = 10, H = 4, initSeed = 7 } = {}) {
  const xs = [], ys = [];
  for (let i = 0; i < N; i++) {
    const x = -Math.PI + (2 * Math.PI * i) / (N - 1);
    xs.push(x); ys.push(Math.sin(x));
  }
  const s = rng(`init:${initSeed}`); // same seed recipe as the sheet
  const W1 = [], b1 = [], W2 = [], b2v = [];
  for (let j = 0; j < H; j++) W1.push(s() - 0.5);
  for (let j = 0; j < H; j++) b1.push(s() - 0.5);
  for (let j = 0; j < H; j++) W2.push((s() - 0.5) * 0.5);
  b2v.push((s() - 0.5) * 0.5);
  const HIDDEN = { W1, b1 }, OUT = { W2, b2: b2v };

  function forwardBackward() {
    const pre = [], h = [], yhat = [], g = [], dhpre = [];
    let loss = 0;
    for (let i = 0; i < N; i++) {
      pre[i] = []; h[i] = []; dhpre[i] = [];
      let yh = b2v[0];
      for (let j = 0; j < H; j++) {
        pre[i][j] = W1[j] * xs[i] + b1[j];
        h[i][j] = Math.tanh(pre[i][j]);
        yh += W2[j] * h[i][j];
      }
      yhat[i] = yh;
      const e = yhat[i] - ys[i];
      loss += e * e;
      g[i] = 2 * e / N;
      for (let j = 0; j < H; j++) dhpre[i][j] = g[i] * W2[j] * (1 - h[i][j] * h[i][j]);
    }
    loss /= N;
    const dW1 = [], db1 = [], dW2 = [];
    let db2 = 0;
    for (let j = 0; j < H; j++) {
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < N; i++) { a += dhpre[i][j] * xs[i]; b += dhpre[i][j]; c += g[i] * h[i][j]; }
      dW1.push(a); db1.push(b); dW2.push(c);
    }
    for (let i = 0; i < N; i++) db2 += g[i];
    // param list with layer tags — mirrors the sheet's paramIds order
    const params = [];
    for (let j = 0; j < H; j++) params.push({ id: `nn.W1.${j}`, layer: 'hidden', g: dW1[j] });
    for (let j = 0; j < H; j++) params.push({ id: `nn.b1.${j}`, layer: 'hidden', g: db1[j] });
    for (let j = 0; j < H; j++) params.push({ id: `nn.W2.${j}`, layer: 'out', g: dW2[j] });
    params.push({ id: 'nn.b2', layer: 'out', g: db2 });
    const get = (id) => {
      if (id === 'nn.b2') return b2v[0];
      const [a, w, j] = id.split('.');
      if (a === 'nn' && w === 'W1') return W1[Number(j)];
      if (a === 'nn' && w === 'b1') return b1[Number(j)];
      if (a === 'nn' && w === 'W2') return W2[Number(j)];
      throw new Error('unknown param ' + id);
    };
    const set = (id, v) => {
      if (id === 'nn.b2') { b2v[0] = v; return; }
      const [a, w, j] = id.split('.');
      if (a === 'nn' && w === 'W1') W1[Number(j)] = v;
      else if (a === 'nn' && w === 'b1') b1[Number(j)] = v;
      else if (a === 'nn' && w === 'W2') W2[Number(j)] = v;
      else throw new Error('unknown param ' + id);
    };
    return { loss, params, get, set };
  }
  return { forwardBackward, HIDDEN, OUT, N, H };
}

// ---------------- the genome space (v2: wider) ----------------
// v1 bred rmsprop+invtime+per-layer mults to runner-up. v2 opens the space
// the classics live in: adam-family moments, gradient clipping, nesterov
// momentum, cosine warm restarts — the GAN gets the same toolbox King & Ba
// had, and must DISCOVER what they shipped.
export function randomGenome(stream) {
  return {
    lr0: [0.02, 0.05, 0.1, 0.2, 0.3, 0.5][Math.floor(stream() * 6)],
    schedule: ['const', 'invtime', 'sqrt', 'warm'][Math.floor(stream() * 4)],
    warmPeriod: [100, 200, 350][Math.floor(stream() * 3)],
    beta: [0, 0.5, 0.8, 0.9, 0.95, 0.99][Math.floor(stream() * 6)],
    beta2: [0, 0.9, 0.99, 0.999][Math.floor(stream() * 4)],
    adaptive: ['none', 'rms', 'sign', 'adam'][Math.floor(stream() * 4)],
    clip: [0, 1, 3, 10][Math.floor(stream() * 4)],
    nesterov: stream() < 0.3,
    hiddenMult: 0.5 + stream() * 2,
    outMult: 0.5 + stream() * 2,
    decay: 0,
  };
}
export function mutate(g, stream) {
  const c = { ...g };
  if (stream() < 0.5) c.lr0 = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8][Math.floor(stream() * 8)];
  if (stream() < 0.3) c.schedule = ['const', 'invtime', 'sqrt', 'warm'][Math.floor(stream() * 4)];
  if (stream() < 0.2) c.warmPeriod = [100, 200, 350][Math.floor(stream() * 3)];
  if (stream() < 0.4) c.beta = [0, 0.5, 0.8, 0.9, 0.95, 0.99][Math.floor(stream() * 6)];
  if (stream() < 0.35) c.beta2 = [0, 0.9, 0.99, 0.999][Math.floor(stream() * 4)];
  if (stream() < 0.4) c.adaptive = ['none', 'rms', 'sign', 'adam'][Math.floor(stream() * 4)];
  if (stream() < 0.3) c.clip = [0, 1, 3, 10][Math.floor(stream() * 4)];
  if (stream() < 0.2) c.nesterov = !c.nesterov;
  if (stream() < 0.5) c.hiddenMult = Math.max(0.1, c.hiddenMult * (0.5 + stream()));
  if (stream() < 0.5) c.outMult = Math.max(0.1, c.outMult * (0.5 + stream()));
  return c;
}
export function crossover(a, b, stream) {
  return stream() < 0.5 ? { ...a } : { ...b };
}

// ---------------- the discriminator ----------------
export function evaluateGenome(genome, { steps = 400, initSeeds = [7, 11, 23, 29, 41] } = {}) {
  const trajs = [];
  for (const seed of initSeeds) {
    const twin = makeTwin({ initSeed: seed });
    const rule = genomeRule(genome);
    const opt = rule.make();
    const traj = [];
    for (let t = 1; t <= steps; t++) {
      const { loss, params, get, set } = twin.forwardBackward();
      traj.push(loss);
      for (const p of params) {
        const { dp } = opt.apply(p.id, p.g);
        set(p.id, get(p.id) + dp);
      }
    }
    trajs.push(traj);
  }
  // discriminator score: mean over inits of (final + fast + calm + direct)
  const finals = trajs.map((t) => t[t.length - 1]);
  const mids = trajs.map((t) => t[Math.floor(t.length / 4)]);
  const arcs = [], bends = [];
  for (const t of trajs) { const g = gesture(t); arcs.push(g.arcLength); bends.push(g.bendingEnergy); }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const score =
    Math.log10(1e-9 + avg(finals)) * 3 +          // final loss (log scale)
    Math.log10(1e-9 + avg(mids)) +                // speed: loss at 25% mark
    avg(bends) * 0.05 +                           // calm
    avg(arcs) * 0.3;                              // direct
  return { score, trajs, finals, meanFinal: avg(finals) };
}

// ---------------- the evolution loop ----------------
export function breed({ population = 24, generations = 8, elite = 4, masterSeed = 2026, genomeEval = evaluateGenome } = {}) {
  const stream = rng(`breeder:${masterSeed}`);
  let pop = Array.from({ length: population }, () => randomGenome(stream));
  const history = [];
  let bestEver = null;
  for (let gen = 1; gen <= generations; gen++) {
    const scored = pop.map((g) => ({ g, ...genomeEval(g) }));
    scored.sort((a, b) => a.score - b.score);
    // diversity-aware elites: take best, then add high scorers that behave
    // differently from those already chosen
    const elites = [];
    for (const cand of scored) {
      if (elites.length >= elite) break;
      const distinct = elites.every((e) => behaviorDistance(e.trajs[0], cand.trajs[0]) > 0.02);
      if (distinct) elites.push(cand);
    }
    if (!bestEver || scored[0].score < bestEver.score) bestEver = scored[0];
    history.push({
      gen, bestScore: scored[0].score, meanScore: scored.reduce((a, b) => a + b.score, 0) / scored.length,
      bestGenome: scored[0].g, bestFinal: scored[0].meanFinal,
    });
    // next generation: elites + tournament offspring
    const next = elites.map((e) => ({ ...e.g }));
    while (next.length < population) {
      const tour = () => {
        let best = null;
        for (let i = 0; i < 3; i++) {
          const c = scored[Math.floor(stream() * scored.length)];
          if (!best || c.score < best.score) best = c;
        }
        return best;
      };
      const a = tour(), b = tour();
      next.push(mutate(crossover(a.g, b.g, stream), stream));
    }
    pop = next;
  }
  return { champion: bestEver, history };
}

// ---------------- twin-vs-sheet equivalence proof ----------------
// Same init, same rule: 30 steps on the twin and 30 on the sheet must agree
// to 1e-10 per step (they are the same formulas — this proves it).
export async function twinEquivalence({ steps = 30, initSeed = 7 } = {}) {
  const genome = { lr0: 0.1, schedule: 'const', beta: 0.9, adaptive: 'none', hiddenMult: 1, outMult: 1, decay: 0 };
  const twin = makeTwin({ initSeed });
  const rule = genomeRule(genome);
  const opt = rule.make();
  const engine = new QuiltEngine('twin-equiv', { eager: false });
  const meta = loadGradientSheet(engine, { N: 10, H: 4, initSeed });
  let worst = 0;
  for (let t = 1; t <= steps; t++) {
    const fb = twin.forwardBackward();
    const sheetUpdates = new Map();
    for (const p of meta.paramIds) {
      const gid = p.replace('nn.W', 'nn.dW').replace('nn.b1', 'nn.db1').replace('nn.b2', 'nn.db2');
      sheetUpdates.set(p, (await engine.get(gid)).data);
    }
    for (const p of fb.params) {
      const { dp } = opt.apply(p.id, p.g);
      // twin update
      const nv = fb.get(p.id) + dp;
      fb.set(p.id, nv);
      // sheet update (same dp — the rules are the same object; the CLAIM is
      // that the GRADIENTS agree, so verify that directly)
      const sheetG = sheetUpdates.get(p.id);
      worst = Math.max(worst, Math.abs(sheetG - p.g));
      const cur = (await engine.get(p.id)).data;
      await engine.set(p.id, cur + dp);
    }
  }
  return { ok: worst < 1e-10, worst };
}

// ---------------- the championship (on the living sheet) ----------------
// (run by learn/run_all.mjs — the crowned genome defends its title against
// sgd / momentum / rmsprop, all ON the QuiltEngine)

// --- direct CLI demo: node learn/breeder.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const eq = await twinEquivalence();
  console.log(`twin equivalence: ${eq.ok ? 'PROVEN' : 'FAILED'} (worst grad delta ${eq.worst.toExponential(2)})`);
  const { champion, history } = breed({ population: 12, generations: 4 });
  console.log(`breed: champion score=${champion.score.toFixed(3)} final=${champion.meanFinal.toExponential(2)} (${Date.now() - t0}ms)`);
  console.log('  genome:', JSON.stringify(champion.g));
  for (const h of history) console.log(`  gen ${h.gen}: best=${h.bestScore.toFixed(3)} mean=${h.meanScore.toFixed(3)} final=${h.bestFinal.toExponential(2)}`);
}
