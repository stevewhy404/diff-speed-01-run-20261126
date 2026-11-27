# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/stevewhy404/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/stevewhy404/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for makefun-diff 1.0.0: `solve.js` returns exactly makefun-diff's patch for every input, using integer-hashed lines and an allocation-free Myers search (Int32Array V snapshots + backtracking) instead of the reference's per-cell linked-list paths. `main.ts` is the house driver, unchanged.

## Run it

```sh
node main.ts
```

## How it works

- Lines are hashed to small integers once (one id per distinct line, shared across both texts), so the search compares integers.
- Myers's greedy search runs with the reference's exact order, deletion-on-tie rule, and no-pruning guards, over flat V snapshots; the edit script is backtracked from those snapshots.
- The patch writer mirrors makefun-diff 1.0.0's output rule: `makefun-diff/1` header, hunks with 3 lines of context, runs at most 6 kept lines apart merged, `%` after a line with no trailing newline.

---

<sub>Entered on [make.fun](https://make.fun/?ref=stevewhy404&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
