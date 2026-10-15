# PlanScope

**Watch your query execute.** Paste PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)` output and get an animated execution movie: plan nodes light up in true execution order, timing bars show where the milliseconds went, and the slowest node gets flagged.

## What it does

- **Paste box** — drop in raw `EXPLAIN (FORMAT JSON)` output, with clear errors for bad input
- **Execution movie** — animated SVG plan tree; press play and watch nodes execute bottom-up with a timeline scrubber and speed control
- **Bottleneck detection** — per-node exclusive time (loops-aware), the slowest node pulses red with a badge, amber edges trace the critical path
- **Summary strip** — execution time, planning time, bottleneck share, rows removed by filter
- **Hover inspector** — actual vs planned rows (with stale-statistics warnings), loops, filters, timing
- **3 built-in sample plans** — one-click demos: a 450k-row filter, a 2,000-loop nested-loop trap, and a healthy plan

100% client-side. Your query plans never leave the browser.

## How to get a plan

```sql
EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM orders WHERE status = 'shipped';
```

Paste the whole JSON output into PlanScope.

## Develop

```bash
npm install
npm run dev      # dev server
npm test         # vitest (18 tests)
npm run build    # production build
```

## How exclusive time works

A node's inclusive time is `Actual Total Time × Actual Loops`. Exclusive time subtracts children's inclusive time (clamped at zero) — so a Nested Loop running an Index Scan 2,000 times correctly blames the inner scan, not the loop. See `src/lib/plan.ts`.
