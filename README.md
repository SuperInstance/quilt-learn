# quilt-learn — THE LEARNING SHEET

**Backprop as reactive cells, quantum-seeded exploration games, and a GAN that
breeds optimizers onto a living spreadsheet.** Three voyages into the question
the fleet keeps asking: *what happens when the machine that learns and the
machine that reacts are the same machine?*

Status: **v2 full receipted run green** — gradient proof 8.17e-10, twin
equivalence 1.67e-16, 35-row fnv1a64 witness chain verified, one live MOTH
harvest per run (v2 job `053f6f93`), deterministic replay byte-identical.

```
npm install
node learn/run_all.mjs --smoke      # ~1 min, mechanics only
node learn/run_all.mjs              # full: proofs, competition, crown (~5 min)
MOTH_OFFLINE=1 node learn/run_all.mjs           # force mock entropy
MOTH_KEY=... node learn/run_all.mjs             # allow ONE live harvest job
node learn/gradient_sheet.mjs       # L1 demo alone
node learn/explorers.mjs            # L2 demo alone
node learn/breeder.mjs              # L3 demo alone
python3 learn/charts.py             # the three voyage charts
```

The engine is vendored at `engine/` — the play-test-patched core of
`SuperInstance/quilt`, receipted in `engine/PROVENANCE.md`. The key doctrine:
**entropy and tokens live in the environment, never in the repo** (`.env.example`,
`moth_key.env` is gitignored, live calls are budget-capped and journal every
refusal).

---

## L1 — the autograd sheet (`learn/gradient_sheet.mjs`)

The conceptual claim: in quilt, the dependency graph IS the computational
graph. The engine's memoized pull IS forward propagation. And backprop is just
MORE SHEET — every gradient is a formula cell over the forward cells it flows
from. No tape, no autograd library. The trainer only ever calls `set()` on 13
parameter cells; the reactive engine does everything else.

A 1→4(tanh)→1 MLP fits `y = sin(x)` on 10 samples — 250 generated cells, of
which ~90 are gradient formulas. Results:

| proof | value |
|---|---|
| sheet gradients vs central finite differences | **max rel err 8.17e-10** |
| full training (momentum 0.3, 700 steps, eager) | **final MSE 9.5e-6** |
| the sheet knowing it converged | **listener fired 4048×, flipped `nn.converged`** |

The convergence reflex is the demo's soul: a listener cell watches `nn.mse`,
its condition reads `caller.metadata.current`, and its program action flips a
flag cell — the sheet self-reports learning with zero trainer involvement.

Two engine contracts were learned the hard way and are receipted in code:

1. **No cell id may be a dotted path-prefix of another.** The formula compiler
   rewrites bare ids into bracket access and treats `.` as a non-boundary — so
   `nn.loss` (prefix of `nn.loss.i.0`) gets rewritten inside the longer id's
   string literal: `cells["cells["nn.loss"].i.0"]` → `Unexpected identifier`.
   The aggregate is `nn.mse` for this reason.
2. **Listener conditions see `caller.metadata.{changed,prev,current}`** — a
   bare `current` is silently `undefined` and the reflex never fires.

## L2 — the explorer games (`learn/explorers.mjs`)

Six minds, one bandit (K=10 Bernoulli arms), identical rations (T=200), ten
seeds, **paired environment noise** — every explorer faces the exact same
outcome bits, so regret differences are pure policy. The policies live in the
sheet: UCB1's optimism is a formula cell per arm; the softmax minds share the
same annealed-softmax weight formulas and differ in exactly one thing — where
their randomness comes from. Quantum bits come from a **MOTH-harvested bit
pool** (one live `graph-v1` job per run; v2 job `053f6f93`, 256
measurement-outcome keys → 2048-bit pool → fnv1a64 counter-mode expansion).

The v2 protocol was built to answer v1's honest loss (quantum regret 63.2):

- **qm → qm2**: v1 shared one quantum realization across all seeds; v2 derives
  a **per-seed sub-stream** from the same single harvest (`streamFor` — the
  pool seeds a family, the key picks a member). No extra live jobs spent.
- **chord**: the cortex doctrine as a mind — UCB1 structure, with quantum
  entropy spent ONLY at decision borders (top-2 score gap < 8% → the packet
  picks, weighted by the distribution itself).

| mind | mean regret | identified | wins |
|---|---|---|---|
| eps-greedy (ε=0.1) | 56.6 ± 30.4 | 2/10 | 1 |
| UCB1 | 42.6 ± 4.7 | **7/10** | 1 |
| boltz (pseudo) | 54.2 ± 34.1 | 1/10 | 2 |
| quantum v1 (shared) | 63.2 ± 48.1 | 2/10 | 3 |
| **quantum v2 (per-seed)** | **38.0 ± 23.7** | 3/10 | **3** |
| chord (UCB + q-ties) | 43.4 ± 5.6 | 5/10 | 0 |

**Finding (v2): the protocol fix rescued the quantum mind.** Same harvest, no
extra budget: per-seed re-seeding took the quantum explorer from last place
(63.2) to first (38.0) — how you *protocol* entropy matters more than how much
you spend. The chord mind added the reliability result: structure + border-only
entropy = 2nd-lowest variance (±5.6) and the 2nd-best identification rate (5/10)
without ever winning a seed outright. UCB1 still identifies the truth most
often (7/10) — optimism remains the best teacher.

## L3 — the optimizer breeder (`learn/breeder.mjs`)

A GAN whose generator proposes **update rules** and whose discriminator is the
learning problem itself, judged at **championship distance** (700 steps, 5
inits) with quilt-native gesture metrics on the loss curve — arc length
(directness) and bending energy (calmness) — plus final and mid-training loss.
Elites are picked for score AND behavioral distance (loom doctrine: divergent
proven-correct, not clones).

The v2 genome opens the toolbox the classics shipped with: adam-family moments
(m-hat/√v-hat with bias correction), gradient clipping, nesterov momentum,
cosine warm restarts — the GAN must DISCOVER what King & Ba shipped. The GAN
breeds on a **vectorized twin** of the sheet, proven equivalent first
(`worst grad delta 1.67e-16` over 30 steps): the twin only ever nominates;
the **sheet elects**. The crowned genome is hardened into
`learn/elite_rule.json` and defends its title on the living engine — and the
classics now defend with a real Adam:

| rule | final MSE @700 steps |
|---|---|
| momentum(0.3) — tuned classic | **9.5e-6 — champion (title defended)** |
| adam(0.05) — shipped classic | 2.16e-3 — runner-up |
| **crown v2 (bred: rms + clip 1 + invtime + 1.48× hidden mult)** | **8.75e-3 — 3rd** |
| sgd(0.08) | 3.53e-2 |
| momentum(0.06) | 2.10e-1 (floor 7.0e-3 — it converged, then diverged) |
| rmsprop(0.02) | 1.17e-1 |

**Findings (honest):** the wider genome improved the crown 3.4× (v1: 2.95e-2 →
v2: 8.75e-3 — it discovered gradient clipping + a better per-layer split), but
the shipped classics hold the podium: bias-corrected moments are hard to
evolve in 10 generations. The championship again exposed what raw final-loss
ranking hides: momentum(0.06) *touched* 7e-3 then blew up — exactly what the
discriminator's bending-energy term punishes. Selection at deployment distance
is the whole game, and the two-generation arc (2.95e-2 → 8.75e-3 → ?) is the
breeder's open ledger.

## The receipts

Every event books a row in one append-only fnv1a64 chain
(`outputs/receipts.jsonl`): fd proof, listener firings, per-seed regrets +
chord tie-break counts, the entropy harvest (digest + job id + mock flag),
every generation, the championship. The chain is verified before the run is
allowed to claim success; `outputs/summary.json` carries the tip. v2 full-run
tip: `0x9c823e35089a407f`.

## Fleet context

- engine: vendored play-test-patched core of `SuperInstance/quilt` (see `engine/PROVENANCE.md`)
- siblings: `quilt-loom` (the foundry), `quilt-cortex` (tri-nervous system), `quilt-arena` (perception games), `quilt-quant` (trading desk), `quilt-mesh` (the bazaar)
- doctrine shared: receipts or it didn't happen; entropy in the environment; mock never shadows live; honest failures are results
