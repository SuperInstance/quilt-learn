#!/usr/bin/env python3
# quilt-learn/charts.py — the three voyage charts, SuperInstance palette.
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
for p in ('/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf',
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
    if os.path.exists(p):
        fm.fontManager.addfont(p)
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Noto Sans SC']
plt.rcParams['axes.unicode_minus'] = False

INK, PAPER, BLUE, ORANGE, TEAL, GRAY, RED = '#1a2332', '#fbfaf7', '#2f6f8f', '#c96f2e', '#3d8a7d', '#9aa1ab', '#a94438'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'outputs')
plt.rcParams.update({'figure.facecolor': PAPER, 'axes.facecolor': PAPER, 'axes.edgecolor': INK,
                     'axes.labelcolor': INK, 'xtick.color': INK, 'ytick.color': INK, 'text.color': INK})

# ── 1. championship loss curves ──────────────────────────────────────────
with open(os.path.join(OUT, 'trajs.json')) as f:
    T = json.load(f)
styles = {
    'crown':               (RED,   'crown (bred rule)', 2.4),
    'momentum(0.3) tuned': (BLUE,  'momentum(0.3) — tuned classic', 1.8),
    'adam(0.05)':          (ORANGE,'adam(0.05) — shipped classic', 1.6),
    'sgd(0.08)':           (TEAL,  'sgd(0.08)', 1.3),
    'momentum(0.06)':      ('#8a5a2a', 'momentum(0.06) — converges then diverges', 1.3),
    'rmsprop(0.02)':       (GRAY,  'rmsprop(0.02)', 1.3),
}
fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
for tag, (c, label, lw) in styles.items():
    ys = T['trajs'][tag]
    ax.plot(range(1, len(ys) + 1), ys, color=c, label=label, lw=lw)
ax.set_yscale('log')
ax.set_xlabel('training step (on the quilt engine)')
ax.set_ylabel('MSE (log scale)')
ax.set_title('The Championship v2 — six rules, one sheet, 700 steps', color=INK, fontsize=12, fontweight='bold')
ax.legend(frameon=False, fontsize=8, loc='upper right', bbox_to_anchor=(1.0, 1.0))
for s in ('top', 'right'):
    ax.spines[s].set_visible(False)
fig.savefig(os.path.join(OUT, 'championship.png'), dpi=150)
plt.close(fig)

# ── 2. explorer scoreboard ───────────────────────────────────────────────
with open(os.path.join(OUT, 'summary.json')) as f:
    S = json.load(f)
board = S['l2']['board']
names = ['eps', 'ucb', 'bz', 'qm', 'qm2', 'chord']
labels = {'eps': 'eps-greedy', 'ucb': 'UCB1', 'bz': 'boltz (pseudo)', 'qm': 'quantum v1 (shared)', 'qm2': 'quantum v2 (per-seed)', 'chord': 'chord (UCB+q-ties)'}
colors = {'eps': GRAY, 'ucb': BLUE, 'bz': TEAL, 'qm': '#c98f8f', 'qm2': RED, 'chord': ORANGE}
fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 4.0), constrained_layout=True)
means = [board[e]['meanRegret'] for e in names]
sds = [board[e]['sdRegret'] for e in names]
a1.bar([labels[e] for e in names], means, yerr=sds, color=[colors[e] for e in names], capsize=4)
a1.set_ylabel('cumulative regret (mean ± sd, 10 seeds)')
a1.set_title('The Explorer Games v2 — regret', fontsize=11, fontweight='bold')
a1.tick_params(axis='x', rotation=14, labelsize=7.5)
for s in ('top', 'right'):
    a1.spines[s].set_visible(False)
ident = [board[e]['identified'] for e in names]
a2.bar([labels[e] for e in names], ident, color=[colors[e] for e in names])
a2.set_ylabel('best arm identified (of 10 seeds)')
a2.set_title('…and who found the truth', fontsize=11, fontweight='bold')
a2.tick_params(axis='x', rotation=14, labelsize=7.5)
for s in ('top', 'right'):
    a2.spines[s].set_visible(False)
fig.savefig(os.path.join(OUT, 'explorers.png'), dpi=150)
plt.close(fig)

# ── 3. breeder generations ───────────────────────────────────────────────
gens = []
with open(os.path.join(OUT, 'receipts.jsonl')) as f:
    for line in f:
        r = json.loads(line)
        if r.get('kind') == 'l3.generation':
            gens.append(r)
fig, ax = plt.subplots(figsize=(8.2, 4.0), constrained_layout=True)
g = [r['gen'] for r in gens]
ax.plot(g, [r['bestScore'] for r in gens], color=RED, marker='o', label='best genome score', lw=2)
ax.plot(g, [r['meanScore'] for r in gens], color=GRAY, marker='s', label='population mean', lw=1.6)
ax.set_xlabel('generation')
ax.set_ylabel('discriminator score (lower = better)')
ax.set_title('The Optimizer Breeder — selection at championship distance', fontsize=12, fontweight='bold')
ax.legend(frameon=False, fontsize=9)
for s in ('top', 'right'):
    ax.spines[s].set_visible(False)
fig.savefig(os.path.join(OUT, 'breeder.png'), dpi=150)
plt.close(fig)
print('charts written: championship.png, explorers.png, breeder.png')
