// quilt-learn/run_all.mjs — the whole voyage in one receipted run.
//
//   node learn/run_all.mjs --smoke       (~1 min, mechanics only)
//   node learn/run_all.mjs               (full: proofs, competition, crown)
//   MOTH_OFFLINE=1 node learn/run_all.mjs   (force mock entropy)
//   MOTH_KEY=... node learn/run_all.mjs     (allow ONE live harvest job)
//
// Everything books rows in one fnv1a64 witness chain; the chain is verified
// before the run is allowed to say it succeeded.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuiltEngine } from '../engine/index.js';
import { sealChain, verifyChain, fnv1a64 } from './receipts.mjs';
import { mean, sd } from './util.mjs';
import { MothVault } from './moth.mjs';
import {
  loadGradientSheet, fdCheck, train, momentumRule, sgdRule, rmspropRule, genomeRule,
} from './gradient_sheet.mjs';
import { competition, EXPLORERS } from './explorers.mjs';
import { twinEquivalence, breed } from './breeder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'outputs');
const SMOKE = process.argv.includes('--smoke');

const CFG = SMOKE ? {
  N: 6, H: 3, eagerSteps: 150, lazySteps: 120, convergeAt: 0.01,
  seeds: [1, 2], T: 60, K: 6,
  pop: 6, gens: 2, evalSteps: 150, champSteps: 150,
} : {
  N: 10, H: 4, eagerSteps: 700, lazySteps: 400, convergeAt: 0.01,
  seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], T: 200, K: 10,
  pop: 24, gens: 8, evalSteps: 700, champSteps: 700,
};

const rows = [];
let seq = 0;
const book = (kind, data) => rows.push({ seq: ++seq, kind, ...data });

console.log(`═══ quilt-learn — ${SMOKE ? 'SMOKE' : 'FULL'} run ═══`);
mkdirSync(OUT, { recursive: true });

// ── L1: the autograd sheet ────────────────────────────────────────────────
console.log('\n── L1 the autograd sheet ──');
{
  const engine = new QuiltEngine('learn-l1-eager', { eager: true });
  const meta = loadGradientSheet(engine, { N: CFG.N, H: CFG.H, initSeed: 7, convergeAt: CFG.convergeAt });
  const fd = await fdCheck(engine, meta);
  book('l1.fdcheck', { ok: fd.ok, maxRelErr: fd.maxRelErr, worst: fd.worst.id, N: CFG.N, H: CFG.H });
  console.log(`fdCheck: maxRelErr=${fd.maxRelErr.toExponential(2)} ${fd.ok ? 'PROVEN' : 'FAILED'}`);
  if (!fd.ok) { console.error('gradient proof failed — refusing to book anything further'); process.exit(1); }

  const rule = momentumRule(0.3);
  const r0 = await train(engine, meta, rule, { steps: CFG.eagerSteps });
  book('l1.eager.listener', { rule: rule.name, steps: CFG.eagerSteps, finalLoss: r0.finalLoss, converged: r0.converged === true, firings: r0.firings, mode: 'eager' });
  console.log(`[eager+listener] ${rule.name} final=${Number(r0.finalLoss).toExponential(3)} converged=${r0.converged} (listener fired ${r0.firings}×)`);

  for (const [tag, r] of [['sgd(0.08)', sgdRule(0.08)], ['momentum(0.06)', momentumRule(0.06)], ['rmsprop(0.02)', rmspropRule(0.02)]]) {
    const e2 = new QuiltEngine('learn-l1-lazy', { eager: false });
    const m2 = loadGradientSheet(e2, { N: CFG.N, H: CFG.H, initSeed: 7 });
    const rr = await train(e2, m2, r, { steps: CFG.lazySteps });
    book('l1.lazy.contrast', { rule: tag, steps: CFG.lazySteps, finalLoss: rr.finalLoss, mode: 'lazy' });
    console.log(`[lazy] ${tag.padEnd(16)} final=${Number(rr.finalLoss).toExponential(3)}`);
  }
}

// ── L2: the explorer games ────────────────────────────────────────────────
console.log('\n── L2 the explorer games ──');
const vault = new MothVault({ label: 'run_all', maxLiveJobs: 1, offline: process.env.MOTH_OFFLINE === '1' || !process.env.MOTH_KEY });
{
  const t0 = Date.now();
  const { harvest, results } = await competition({ seeds: CFG.seeds, T: CFG.T, K: CFG.K, vault });
  book('l2.harvest', { mock: harvest.mock, why: harvest.why, bits: harvest.bits.length, poolDigest: harvest.poolDigest, jobId: harvest.jobId });
  console.log(`entropy: mock=${harvest.mock}${harvest.why ? ` (${harvest.why})` : ''} bits=${harvest.bits.length} digest=${harvest.poolDigest.slice(0, 12)} job=${harvest.jobId || '—'} (${Date.now() - t0}ms)`);
  const board = {};
  for (const e of EXPLORERS) {
    const regs = results.map((r) => r[e].regret);
    const ident = results.filter((r) => r[e].identified).length;
    board[e] = { meanRegret: mean(regs), sdRegret: sd(regs), identified: ident, wins: 0 };
  }
  for (const r of results) {
    const win = EXPLORERS.reduce((a, b) => (r[b].regret < r[a].regret ? b : a));
    board[win].wins++;
    book('l2.seed', { seed: r.seed, best: r.best, regret: Object.fromEntries(EXPLORERS.map((e) => [e, r[e].regret])), identified: Object.fromEntries(EXPLORERS.map((e) => [e, r[e].identified])) });
  }
  const winner = EXPLORERS.reduce((a, b) => (board[b].meanRegret < board[a].meanRegret ? b : a));
  book('l2.scoreboard', { board, winner, seeds: CFG.seeds.length, T: CFG.T, paired: true });
  console.log(`scoreboard (mean regret over ${CFG.seeds.length} seeds, T=${CFG.T}, paired noise):`);
  for (const e of EXPLORERS) console.log(`  ${e.padEnd(4)} regret=${board[e].meanRegret.toFixed(1)} ±${board[e].sdRegret.toFixed(1)}  identified ${board[e].identified}/${CFG.seeds.length}  wins ${board[e].wins}`);
  console.log(`WINNER: ${winner}`);
  var L2 = { board, winner, harvest: { mock: harvest.mock, digest: harvest.poolDigest, jobId: harvest.jobId } };
}

// ── L3: the optimizer breeder ─────────────────────────────────────────────
console.log('\n── L3 the optimizer breeder ──');
let crown;
{
  const eq = await twinEquivalence({ steps: SMOKE ? 20 : 30, initSeed: 7 });
  book('l3.twinEquivalence', { ok: eq.ok, worstGradDelta: eq.worst });
  console.log(`twin equivalence: ${eq.ok ? 'PROVEN' : 'FAILED'} (worst grad delta ${eq.worst.toExponential(2)})`);
  if (!eq.ok) { console.error('twin is not the sheet — breeder results would be fiction'); process.exit(1); }

  const { champion, history } = await (async () => {
    const mod = await import('./breeder.mjs');
    const wrapped = (g) => mod.evaluateGenome(g, { steps: CFG.evalSteps, initSeeds: [7, 11, 23] });
    return breed({ population: CFG.pop, generations: CFG.gens, genomeEval: wrapped });
  })();
  crown = champion.g;
  for (const h of history) book('l3.generation', { gen: h.gen, bestScore: h.bestScore, meanScore: h.meanScore, bestFinal: h.bestFinal });
  console.log(`breed: champion score=${champion.score.toFixed(3)} meanFinal=${champion.meanFinal.toExponential(2)}`);
  console.log('  crown genome:', JSON.stringify(crown));

  // the championship — ON the living sheet (lazy engines, same distance)
  const entries = [
    ['crown', genomeRule(crown)],
    ['sgd(0.08)', sgdRule(0.08)],
    ['momentum(0.06)', momentumRule(0.06)],
    ['momentum(0.3) tuned', momentumRule(0.3)],
    ['rmsprop(0.02)', rmspropRule(0.02)],
  ];
  const podium = {};
  for (const [tag, rule] of entries) {
    const e = new QuiltEngine('learn-championship', { eager: false });
    const m = loadGradientSheet(e, { N: CFG.N, H: CFG.H, initSeed: 7 });
    const r = await train(e, m, rule, { steps: CFG.champSteps });
    podium[tag] = { finalLoss: r.finalLoss, floor: Math.min(...r.traj) };
    book('l3.championship', { rule: tag, steps: CFG.champSteps, finalLoss: r.finalLoss, floor: Math.min(...r.traj) });
    console.log(`  ${tag.padEnd(20)} final=${Number(r.finalLoss).toExponential(3)} floor=${Number(Math.min(...r.traj)).toExponential(3)}`);
  }
  const champTag = Object.keys(podium).reduce((a, b) => (podium[b].finalLoss < podium[a].finalLoss ? b : a));
  book('l3.podium', { champion: champTag, crown });
  console.log(`CHAMPION: ${champTag}`);
  var L3 = { crown, podium, champion: champTag, history: history.map((h) => ({ gen: h.gen, best: h.bestScore, mean: h.meanScore })) };
}

// ── seal the chain + write artifacts ──────────────────────────────────────
sealChain(rows);
const v = verifyChain(rows);
if (!v.ok) { console.error('WITNESS CHAIN BROKEN at', v.at, v.why); process.exit(1); }
writeFileSync(join(OUT, 'receipts.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const summary = {
  config: CFG, smoke: SMOKE,
  l1: { fdProven: true },
  l2: L2,
  l3: L3,
  chain: { links: v.links, tip: rows[rows.length - 1].row_hash, digest: fnv1a64(rows.map((r) => r.row_hash).join('|')) },
  finishedAt: new Date().toISOString(),
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\n═══ chain verified: ${v.links} rows, tip ${rows[rows.length - 1].row_hash} ═══`);
console.log(`artifacts: outputs/receipts.jsonl, outputs/summary.json`);
