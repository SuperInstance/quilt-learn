// quilt-learn/receipts.mjs — witness idiom (ported verbatim from the fleet
// toolkit: quilt-cortex/cortex/receipts.mjs, same chain every fleet repo uses).
// fnv1a64 + append-only hash chain. Every learning event books a row.

export function fnv1a64(input) {
  let h = 0xcbf29ce484222325n, p = 0x100000001b3n, mask = 0xffffffffffffffffn;
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * p) & mask;
  }
  return '0x' + h.toString(16).padStart(16, '0');
}

export function rowHash(row, prevHash) {
  const { row_hash, ...rest } = row;
  return fnv1a64([prevHash, rest]);
}

export function sealChain(rows, genesis = 'GENESIS') {
  let prev = genesis;
  for (const r of rows) { prev = rowHash(r, prev); r.row_hash = prev; }
  return rows;
}

// verifyChain strips the hash so re-derivation matches sealChain exactly.
export function verifyChain(rows, genesis = 'GENESIS') {
  let prev = genesis;
  for (const r of rows) {
    if (r.row_hash === undefined) return { ok: false, at: r.seq ?? null, why: 'missing row_hash' };
    const { row_hash, ...rest } = r;
    const want = rowHash(rest, prev);
    if (want !== r.row_hash) return { ok: false, at: r.seq ?? null, why: 'hash mismatch' };
    prev = r.row_hash;
  }
  return { ok: true, links: rows.length };
}

export function stamp(prefix = 'ln') {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
