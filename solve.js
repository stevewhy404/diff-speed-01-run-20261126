// diff-speed-01-run-20261126: a faster drop-in for makefun-diff 1.0.0.
//
// Returns exactly makefun-diff 1.0.0's patch for every input, but faster: the
// reference implementation (derived from jsdiff 9.0.0) allocates a linked list
// of path components per (d, k) cell of Myers's search, which dominates its
// CPU time on the ~25k-line cases. This module instead hashes every distinct
// line to a small integer once, runs the same search (same order, same
// deletion-on-tie rule, same no-pruning guards) over Int32Array V snapshots,
// and backtracks the edit script from those snapshots. The patch writer
// mirrors the reference's output rule line for line.
//
// Lines: a text is cut after every "\n" (the only separator; "\r" is part of
// its line), and a last line with no "\n" is a line too. Two lines are equal
// only when they are the same code units, newline or its absence included.

const FORMAT = 'makefun-diff/1';
const CONTEXT = 3;
const KEEP = '=';
const DELETE = '-';
const INSERT = '+';

/** A text's lines, each with its "\n" (the last one without, when the text does not end in one). */
function tokenize(text) {
  const parts = text.split('\n');
  const lines = [];
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) lines.push(parts[i] + '\n');
  if (parts[last] !== '') lines.push(parts[last]);
  return lines;
}

/**
 * The edit runs of the middle region aIds[0..N) into bIds[0..M): [{ kind, count }]
 * in order, by the reference's rule. kind is KEEP, DELETE or INSERT.
 *
 * Forward pass: for d = 0, 1, ... and each diagonal k = x - y from -d to d in
 * steps of 2, V[d][k] holds the furthest x a path of d edits reaches on k
 * after following every run of equal lines. The candidate from k - 1 is a
 * deletion (x one past the furthest (d-1)-point on k - 1), from k + 1 an
 * insertion (x the furthest (d-1)-point on k + 1); the deletion wins when both
 * reach the same point; a move past the end of either text is no candidate.
 * The first (d, k) to reach both ends ends the search.
 *
 * Backtrack: from the snapshots, recompute each step's move with the same
 * guards and tie-break, walk the snake back to where the move started, and
 * emit the move plus the snake as runs, merged where the kind repeats.
 */
function editRuns(aIds, bIds, N, M) {
  // V snapshots: Vs[d] is an Int32Array indexed by k + d, holding x + 1 after
  // the snake, or 0 when no path reaches that diagonal at that d (a fresh
  // Int32Array is already all zeros, so no fill pass is needed).
  const Vs = [];
  // d = 0: the snake from (0, 0) on diagonal 0.
  let x = 0;
  while (x < N && x < M && aIds[x] === bIds[x]) x++;
  const v0 = new Int32Array(1);
  v0[0] = x + 1;
  Vs.push(v0);
  if (x === N && x === M) return [];
  let D = -1;
  let K = 0;
  outer: for (let d = 1; d <= N + M; d++) {
    const prev = Vs[d - 1];
    const v = new Int32Array(2 * d + 1);
    for (let k = -d; k <= d; k += 2) {
      // Candidates from the previous d, on diagonals k - 1 (deletion) and
      // k + 1 (insertion). prev is indexed by kk + (d - 1); a stored 0 means
      // no path, otherwise the stored value minus one is x.
      const iRm = k - 1 + (d - 1);
      const iAd = k + 1 + (d - 1);
      const xRm = iRm >= 0 && iRm < prev.length ? prev[iRm] - 1 : -1;
      const xAd = iAd >= 0 && iAd < prev.length ? prev[iAd] - 1 : -1;
      // A deletion consumes old line xRm (0-based); an insertion consumes new
      // line xAd - 1 - k. Either is a candidate only while inside its text.
      const canRemove = xRm >= 0 && xRm < N;
      const canAdd = xAd >= 0 && xAd - 1 - k < M;
      if (!canRemove && !canAdd) continue;
      const byDel = canRemove ? xRm : -2;
      const byIns = canAdd ? xAd - 1 : -2;
      let xx;
      if (byDel >= byIns) xx = xRm + 1;
      else xx = xAd;
      let y = xx - k;
      while (xx < N && y < M && aIds[xx] === bIds[y]) {
        xx++;
        y++;
      }
      v[k + d] = xx + 1;
      if (xx === N && y === M) {
        D = d;
        K = k;
        break outer;
      }
    }
    Vs.push(v);
  }
  if (D < 0) throw new Error('makefun-diff: the search ended without reaching both ends');

  // Backtrack from (D, K) at (N, M), emitting runs in reverse.
  const rev = [];
  let k = K;
  x = N;
  let y = M;
  const push = (kind, count) => {
    if (count <= 0) return;
    const last = rev[rev.length - 1];
    if (last !== undefined && last.kind === kind) last.count += count;
    else rev.push({ kind, count });
  };
  for (let d = D; d >= 1; d--) {
    const prev = Vs[d - 1];
    const iRm = k - 1 + (d - 1);
    const iAd = k + 1 + (d - 1);
    const xRm = iRm >= 0 && iRm < prev.length ? prev[iRm] - 1 : -1;
    const xAd = iAd >= 0 && iAd < prev.length ? prev[iAd] - 1 : -1;
    const canRemove = xRm >= 0 && xRm < N;
    const canAdd = xAd >= 0 && xAd - 1 - k < M;
    const byDel = canRemove ? xRm : -2;
    const byIns = canAdd ? xAd - 1 : -2;
    const isDel = byDel >= byIns;
    // The move's start (before the snake): deletion from (xRm + 1, xRm + 1 - k),
    // insertion from (xAd, xAd - k). The snake runs from there to (x, y).
    const x0 = isDel ? xRm + 1 : xAd;
    push(KEEP, x - x0);
    if (isDel) {
      push(DELETE, 1);
      x = xRm;
      y = xRm - (k - 1);
      k = k - 1;
    } else {
      push(INSERT, 1);
      x = xAd;
      y = xAd - (k + 1);
      k = k + 1;
    }
  }
  // The d = 0 snake, from (0, 0) to the point the loop left.
  push(KEEP, x);
  rev.reverse();
  return rev;
}

/** A line as the patch writes it: its op, the line, a newline, and "%" on a line of its own when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

/** make.fun's own patch of input.old into input.new, as makefun-diff 1.0.0 writes it. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const a = tokenize(input.old);
  const b = tokenize(input.new);
  const n = a.length;
  const m = b.length;

  // One integer id per distinct line (shared across both texts), so the
  // search compares integers instead of strings.
  const ids = new Map();
  const aIds = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let id = ids.get(a[i]);
    if (id === undefined) {
      id = ids.size;
      ids.set(a[i], id);
    }
    aIds[i] = id;
  }
  const bIds = new Int32Array(m);
  for (let j = 0; j < m; j++) {
    let id = ids.get(b[j]);
    if (id === undefined) {
      id = ids.size;
      ids.set(b[j], id);
    }
    bIds[j] = id;
  }

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && aIds[prefix] === bIds[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && aIds[n - 1 - suffix] === bIds[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  if (n - prefix - suffix > 0 || m - prefix - suffix > 0) {
    runs.push(...editRuns(
      aIds.subarray(prefix, n - suffix),
      bIds.subarray(prefix, m - suffix),
      n - prefix - suffix,
      m - prefix - suffix,
    ));
  }
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written(KEEP, a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written(DELETE, a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written(INSERT, b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written(KEEP, a[at]));
  }
  return out.join('');
}
