"use client";

import { useState } from "react";
import { formatMs, nodeLabel, ParsedPlan, parsePlan } from "@/lib/plan";
import { SAMPLE_PLANS } from "@/lib/samples";
import PlanMovie from "@/components/PlanMovie";

export default function Home() {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planKey, setPlanKey] = useState(0);

  const run = (text: string) => {
    try {
      setParsed(parsePlan(text));
      setPlanKey((k) => k + 1);
      setError(null);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : "Couldn't parse that plan.");
    }
  };

  const loadSample = (id: string) => {
    const s = SAMPLE_PLANS.find((x) => x.id === id);
    if (!s) return;
    setInput(s.json);
    run(s.json);
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-zinc-100 antialiased">
      {/* hero */}
      <header className="mx-auto max-w-6xl px-6 pb-14 pt-20 text-center sm:pt-28">
        <p className="inline-block rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
          PostgreSQL EXPLAIN visualizer
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Watch your query <span className="text-amber-400">execute</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400">
          Paste <span className="text-zinc-200">EXPLAIN (ANALYZE, FORMAT JSON)</span> output and get
          an animated execution movie. See every node run, watch where the milliseconds go, and
          catch the bottleneck in seconds.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => loadSample(SAMPLE_PLANS[0].id)}
            className="rounded-full bg-amber-400 px-7 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
          >
            Try a sample plan
          </button>
          <a
            href="#studio"
            className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500"
          >
            Paste your own
          </a>
        </div>
        <p className="mt-6 font-mono text-xs text-zinc-600">
          psql&gt; EXPLAIN (ANALYZE, FORMAT JSON) SELECT … ;
        </p>
      </header>

      {/* studio */}
      <main id="studio" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-20">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_PLANS.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSample(s.id)}
                title={s.blurb}
                className="rounded-full border border-zinc-700 px-4 py-1.5 text-xs text-zinc-300 transition hover:border-amber-400/60 hover:text-amber-300"
              >
                {s.name}
              </button>
            ))}
            <span className="ml-1 text-xs text-zinc-600">one-click demos</span>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder='Paste EXPLAIN (FORMAT JSON) output here — e.g. [{ "Plan": { "Node Type": "Seq Scan", … } }]'
            className="mt-4 h-44 w-full resize-y rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300 placeholder:text-zinc-700 focus:border-amber-400/60 focus:outline-none"
          />
          {error && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => run(input)}
              className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-white"
            >
              Visualize
            </button>
            <button
              onClick={() => {
                setInput("");
                setParsed(null);
                setError(null);
              }}
              className="text-sm text-zinc-500 transition hover:text-zinc-300"
            >
              Clear
            </button>
          </div>
        </div>

        {parsed && (
          <div className="mt-8">
            {/* summary strip */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="execution time"
                value={parsed.executionTime != null ? formatMs(parsed.executionTime) : "—"}
              />
              <Stat
                label="planning time"
                value={parsed.planningTime != null ? formatMs(parsed.planningTime) : "—"}
              />
              <Stat
                label="bottleneck"
                value={formatMs(parsed.slowest.exclusiveTime)}
                sub={`${nodeLabel(parsed.slowest)} · ${parsed.slowest.exclusivePct.toFixed(1)}% of time`}
                hot
              />
              <Stat
                label="rows removed by filter"
                value={parsed.totalRowsRemoved.toLocaleString()}
                sub={parsed.totalRowsRemoved > 0 ? "work the query threw away" : "nothing wasted"}
              />
            </div>

            <div className="mt-6">
              <PlanMovie key={planKey} parsed={parsed} />
            </div>
          </div>
        )}
      </main>

      {/* how it works */}
      <section className="border-t border-zinc-900">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-16 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Paste the JSON",
              d: "Run EXPLAIN (ANALYZE, FORMAT JSON) in psql and paste the output. Nothing leaves your browser.",
            },
            {
              n: "02",
              t: "Press play",
              d: "Nodes light up in true execution order while timing bars grow beside them.",
            },
            {
              n: "03",
              t: "Kill the bottleneck",
              d: "The slowest node pulses red. Hover any node for rows, loops, and filter damage.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <p className="font-mono text-xs text-amber-400">{s.n}</p>
              <p className="mt-2 font-bold text-white">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-zinc-900 px-6 py-8 text-center font-mono text-xs text-zinc-600">
        PlanScope — your query plans, as a movie. 100% client-side.
        <br />
        <span className="mt-2 inline-block">
          More free tools:{" "}
          <a href="https://privatepdfapp.vercel.app" className="underline hover:text-zinc-400">
            PrivatePDF
          </a>{" "}
          — PDF tools that never upload your files.
        </span>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  hot,
}: {
  label: string;
  value: string;
  sub?: string;
  hot?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        hot ? "border-red-500/40 bg-red-500/5" : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold ${hot ? "text-red-400" : "text-white"}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 truncate font-mono text-[11px] text-zinc-500" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}
