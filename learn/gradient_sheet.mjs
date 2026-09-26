// quilt-learn/gradient_sheet.mjs — L1: THE AUTOGRAD SHEET.
//
// The conceptual claim of this voyage:
//
//   In quilt, the dependency graph IS the computational graph. The engine's
//   memoized pull IS forward propagation. And backprop is just MORE SHEET —
//   every gradient is a formula cell over the forward cells it flows from.
//   No tape, no autograd library: a spreadsheet that trains itself, where
//   the trainer only ever calls set() on parameter cells and the reactive
//   engine does the rest. A listener cell lets the sheet KNOW it converged.
//
// Architecture: 1 -> H (tanh) -> 1 MLP fit to y = sin(x) on N samples.
//   forward cells : pre_i_j, h_i_j, yhat_i, loss_i, loss
//   gradient cells: g_i, dhpre_i_j, dW1_j, db1_j, dW2_j, db2   (all formulas)
//   parameter cells: W1_j, b1_j, W2_j, b2                       (values)
//   convergence   : converge.watch (listener) -> converge.flag (program)
//
// Correctness doctrine: sheet gradients are proven against central finite
// differences (fdCheck) before any training run books a receipt.

import { rng } from './util.mjs';

const CELLREF = (id) => id; // exprs reference dotted ids as bare identifiers

export function buildGradientSheet({ N = 12, H = 4, initSeed = 7, noiseAmp = 0, convergeAt = 0.01 } = {}) {
  const stream = rng(`init:${initSeed}`);
  const cells = [];
  const meta = { N, H, paramIds: [], gradIds: [], init: {}, convergeAt };

  // --- data cells: x in [-pi, pi], y = sin(x) (+ optional deterministic noise)
  for (let i = 0; i < N; i++) {
    const x = -Math.PI + (2 * Math.PI * i) / (N - 1);
    const noise = noiseAmp ? (stream() - 0.5) * 2 * noiseAmp : 0;
    cells.push({ id: `data.x.${i}`, kind: 'value', value: x, description: 'sample input' });
    cells.push({ id: `data.y.${i}`, kind: 'value', value: Math.sin(x) + noise, description: 'sample target' });
  }

  // --- parameter cells (the ONLY cells the trainer ever writes)
  const P = (id, v) => { cells.push({ id, kind: 'value', value: v, description: 'parameter' }); meta.paramIds.push(id); meta.init[id] = v; };
  for (let j = 0; j < H; j++) P(`nn.W1.${j}`, (stream() - 0.5));
  for (let j = 0; j < H; j++) P(`nn.b1.${j}`, (stream() - 0.5));
  for (let j = 0; j < H; j++) P(`nn.W2.${j}`, (stream() - 0.5) * 0.5);
  P('nn.b2', (stream() - 0.5) * 0.5);

  // --- forward cells
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < H; j++) {
      cells.push({ id: `nn.pre.${i}.${j}`, kind: 'formula', expr: `nn.W1.${j} * data.x.${i} + nn.b1.${j}` });
      cells.push({ id: `nn.h.${i}.${j}`, kind: 'formula', expr: `Math.tanh(nn.pre.${i}.${j})` });
    }
    const yhatTerms = Array.from({ length: H }, (_, j) => `nn.W2.${j} * nn.h.${i}.${j}`).join(' + ');
    cells.push({ id: `nn.yhat.${i}`, kind: 'formula', expr: `${yhatTerms} + nn.b2` });
    cells.push({ id: `nn.loss.i.${i}`, kind: 'formula', expr: `Math.pow(nn.yhat.${i} - data.y.${i}, 2)` });
    cells.push({ id: `nn.g.${i}`, kind: 'formula', expr: `2 * (nn.yhat.${i} - data.y.${i}) / ${N}` });
  }
  // NOTE (learned the hard way, receipted): the formula compiler rewrites
  // bare cell ids into bracket access, and its boundary check treats '.' as
  // a non-boundary — so an id that is a dotted PATH-PREFIX of another id
  // ('nn.loss' vs 'nn.loss.i.0') gets rewritten inside the longer id's
  // string literal and explodes with "Unexpected identifier". Fleet rule:
  // NO cell id may be a path-prefix of another. The aggregate is nn.mse.
  cells.push({
    id: 'nn.mse', kind: 'formula',
    expr: `(${Array.from({ length: N }, (_, i) => `nn.loss.i.${i}`).join(' + ')}) / ${N}`,
    description: 'MSE over the sample batch — the cell the whole sheet orbits',
  });

  // --- backward cells (hand-derived, generated, and fd-proven)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < H; j++) {
      cells.push({
        id: `nn.dhpre.${i}.${j}`, kind: 'formula',
        expr: `nn.g.${i} * nn.W2.${j} * (1 - Math.pow(nn.h.${i}.${j}, 2))`,
      });
    }
  }
  for (let j = 0; j < H; j++) {
    cells.push({
      id: `nn.dW1.${j}`, kind: 'formula',
      expr: Array.from({ length: N }, (_, i) => `nn.dhpre.${i}.${j} * data.x.${i}`).join(' + '),
    });
    cells.push({
      id: `nn.db1.${j}`, kind: 'formula',
      expr: Array.from({ length: N }, (_, i) => `nn.dhpre.${i}.${j}`).join(' + '),
    });
    cells.push({
      id: `nn.dW2.${j}`, kind: 'formula',
      expr: Array.from({ length: N }, (_, i) => `nn.g.${i} * nn.h.${i}.${j}`).join(' + '),
    });
    meta.gradIds.push(`nn.dW1.${j}`, `nn.db1.${j}`, `nn.dW2.${j}`);
  }
  cells.push({ id: 'nn.db2', kind: 'formula', expr: Array.from({ length: N }, (_, i) => `nn.g.${i}`).join(' + ') });
  meta.gradIds.push('nn.db2');

  // --- the sheet knows it converged: listener on the loss cell
  cells.push({ id: 'nn.converged', kind: 'value', value: false, description: 'set by the listener reflex' });
  cells.push({ id: 'nn.converge.count', kind: 'value', value: 0, description: 'listener firings below threshold' });
  // NOTE (E2's hard-won lesson, confirmed here): listener conditions see
  // caller.metadata.{changed,prev,current} — bare 'current' is undefined and
  // the reflex silently never fires.
  cells.push({ id: 'nn.converge.watch', kind: 'listener', watch: ['nn.mse'], condition: 'caller.metadata.current < ' + meta.convergeAt, action: 'nn.converge.flag' });
  cells.push({
    id: 'nn.converge.flag', kind: 'program',
    code: [
      "const c = (await runtime.get('nn.converge.count')).data;",
      "await runtime.set('nn.converge.count', c + 1);",
      "if (!(await runtime.get('nn.converged')).data) await runtime.set('nn.converged', true);",
      "return 'converged reflex fired at loss=' + input.value;",
    ].join('\n        '),
  });

  meta.dataIds = cells.filter((c) => c.id.startsWith('data.')).map((c) => c.id);
  return { cells, meta };
}

export function loadGradientSheet(engine, opts = {}) {
  const { cells, meta } = buildGradientSheet(opts);
  engine.loadSheet({ id: 'gradient.sheet', title: 'the autograd sheet', cells });
  return meta;
}

const G = async (engine, id) => (await engine.get(id)).data;
const S = async (engine, id, v) => { await engine.set(id, v); };

// --- finite-difference proof: every sheet gradient vs central differences.
export async function fdCheck(engine, meta, { eps = 1e-6 } = {}) {
  const rows = [];
  let worst = { relErr: 0, id: null };
  for (const p of meta.paramIds) {
    const gid = p.replace('nn.', 'nn.d').replace('.b2', 'b2'); // nn.W1.0 -> nn.dW1.0 ; nn.b2 -> nn.db2
    const v = await G(engine, p);
    await S(engine, p, v + eps);
    const lp = await G(engine, 'nn.mse');
    await S(engine, p, v - eps);
    const lm = await G(engine, 'nn.mse');
    await S(engine, p, v);
    const num = (lp - lm) / (2 * eps);
    const sheet = await G(engine, gid);
    const relErr = Math.abs(num - sheet) / Math.max(1e-6, Math.abs(num), Math.abs(sheet));
    if (relErr > worst.relErr) worst = { relErr, id: p, num, sheet };
    rows.push({ param: p, numeric: num, sheet, relErr });
  }
  return { ok: worst.relErr < 5e-3, worst, rows, maxRelErr: worst.relErr };
}

// --- optimizer rules (node-side; the breeder's genome compiles to one of these)
export function sgdRule(lr) {
  return { name: `sgd(lr=${lr})`, make: () => ({ apply: (p, g) => ({ dp: -lr * g }) }) };
}
export function momentumRule(lr, beta = 0.9) {
  return {
    name: `momentum(lr=${lr},b=${beta})`,
    make: () => {
      const v = new Map();
      return { apply: (p, g) => { const u = (v.get(p) || 0) * beta + g; v.set(p, u); return { dp: -lr * u }; } };
    },
  };
}
export function rmspropRule(lr, rho = 0.9) {
  return {
    name: `rmsprop(lr=${lr},r=${rho})`,
    make: () => {
      const s = new Map();
      return { apply: (p, g) => { const u = (s.get(p) || 0) * rho + (1 - rho) * g * g; s.set(p, u); return { dp: -lr * g / (Math.sqrt(u) + 1e-8) }; } };
    },
  };
}

// Interpret a breeder genome as a rule (the crown seam: whatever the GAN
// discovers runs through this SAME apply path as the classics).
export function genomeRule(genome) {
  const { lr0, schedule, beta, adaptive, hiddenMult, outMult, decay } = genome;
  return {
    name: `crown(${JSON.stringify(genome)})`.slice(0, 88),
    make: () => {
      const v = new Map(), s = new Map();
      let t = 0;
      return {
        apply: (p, g) => {
          t++;
          const lr = schedule === 'invtime' ? lr0 / (1 + 0.02 * t) : schedule === 'sqrt' ? lr0 / Math.sqrt(t) : lr0;
          const isHidden = p.includes('W1.') || p.includes('b1.');
          const m = isHidden ? hiddenMult : outMult;
          const ge = decay ? g + decay * 0 : g;
          let dp;
          if (adaptive === 'rms') {
            const u = (s.get(p) || 0) * 0.9 + 0.1 * ge * ge; s.set(p, u);
            dp = -lr * m * ge / (Math.sqrt(u) + 1e-8);
          } else if (adaptive === 'sign') {
            dp = -lr * m * Math.sign(ge);
          } else if (adaptive === 'none' && beta > 0) {
            const u = (v.get(p) || 0) * beta + ge; v.set(p, u);
            dp = -lr * m * u;
          } else {
            dp = -lr * m * ge;
          }
          return { dp };
        },
      };
    },
  };
}

// --- training ON the sheet: the trainer only ever calls set() on parameter
// cells; every gradient read and every loss read is the reactive engine
// pulling its memoized graph. Textbook semantics: all gradients are read
// against the SAME parameter snapshot, then applied simultaneously.
export async function train(engine, meta, rule, { steps = 300 } = {}) {
  const opt = rule.make();
  const traj = [];
  await S(engine, 'nn.converged', false);
  await S(engine, 'nn.converge.count', 0);
  for (let t = 1; t <= steps; t++) {
    // phase 1 — read the full gradient + parameter snapshot (memoized: the
    // first get sweeps the graph, the rest ride the same caller context)
    const grads = new Map(), vals = new Map();
    for (const p of meta.paramIds) {
      const gid = p.replace('nn.W', 'nn.dW').replace('nn.b1', 'nn.db1').replace('nn.b2', 'nn.db2');
      grads.set(p, await G(engine, gid));
      vals.set(p, await G(engine, p));
    }
    // phase 2 — compute the simultaneous update, then write the sheet
    for (const p of meta.paramIds) {
      const { dp } = opt.apply(p, grads.get(p));
      await S(engine, p, vals.get(p) + dp);
    }
    // phase 3 — the sheet re-evaluates; read the loss the engine computed
    const loss = await G(engine, 'nn.mse');
    traj.push(loss);
  }
  const converged = await G(engine, 'nn.converged');
  const firings = await G(engine, 'nn.converge.count');
  return { traj, finalLoss: traj[traj.length - 1], converged, firings };
}

// --- direct CLI demo: node learn/gradient_sheet.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  // run 1 — EAGER: the convergence-listener demo (swept config: momentum
  // lr=0.3 crosses 0.01 within ~600 steps on N=10/H=4; see dbg sweep notes).
  const { QuiltEngine } = await import('../engine/index.js');
  const engine = new QuiltEngine('learn-l1', { eager: true });
  const meta = loadGradientSheet(engine, { N: 10, H: 4, initSeed: 7 });
  const fd = await fdCheck(engine, meta);
  console.log(`fdCheck: maxRelErr=${fd.maxRelErr.toExponential(2)} ${fd.ok ? 'PROVEN' : 'FAILED'} (worst ${fd.worst.id})`);
  const r0 = await train(engine, meta, momentumRule(0.3), { steps: 700 });
  console.log(`[eager+listener] ${momentumRule(0.3).name} final=${Number(r0.finalLoss).toExponential(3)} converged=${r0.converged} (listener fired ${r0.firings}×)`);

  // runs 2..4 — LAZY: bulk training is pull-based; the reflex is not
  // exercised in lazy mode (documented); convergence is read from the graph.
  for (const rule of [momentumRule(0.06), rmspropRule(0.02), sgdRule(0.08)]) {
    const e2 = new QuiltEngine('learn-l1', { eager: false });
    const m2 = loadGradientSheet(e2, { N: 10, H: 3, initSeed: 7 });
    const t0 = Date.now();
    const r = await train(e2, m2, rule, { steps: 400 });
    console.log(`[lazy] ${rule.name.padEnd(28)} final=${Number(r.finalLoss).toExponential(3)} (${Date.now() - t0}ms)`);
    if (!Number.isFinite(r.finalLoss)) { console.log('  traj tail:', r.traj.slice(-3)); process.exit(1); }
  }
}
