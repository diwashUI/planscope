"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMs, nodeLabel, ParsedPlan, PlanNode } from "@/lib/plan";

const H_SPACING = 270;
const V_SPACING = 96;
const NODE_W = 220;
const NODE_H = 64;
const BAR_MAX_W = 150;

interface Pos {
  x: number;
  y: number;
}

function layoutTree(root: PlanNode) {
  const pos = new Map<string, Pos>();
  let leaves = 0;
  let maxDepth = 0;
  const walk = (n: PlanNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    if (n.children.length === 0) {
      const y = leaves * V_SPACING;
      leaves++;
      pos.set(n.id, { x: depth * H_SPACING, y });
      return y;
    }
    const ys = n.children.map((c) => walk(c, depth + 1));
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    pos.set(n.id, { x: depth * H_SPACING, y });
    return y;
  };
  walk(root, 0);
  return {
    pos,
    width: (maxDepth + 1) * H_SPACING + BAR_MAX_W + 120,
    height: Math.max(leaves * V_SPACING, V_SPACING) + 90,
  };
}

function edgePath(a: Pos, b: Pos): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y;
  const x2 = b.x - NODE_W / 2;
  const y2 = b.y;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

type NodeState = "idle" | "active" | "done";

export default function PlanMovie({ parsed }: { parsed: ParsedPlan }) {
  const { root, executionOrder, slowest } = parsed;
  const total = executionOrder.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hovered, setHovered] = useState<PlanNode | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { pos, width, height } = useMemo(() => layoutTree(root), [root]);
  const maxExclusive = useMemo(
    () => Math.max(...parsed.nodes.map((n) => n.exclusiveTime), 0.0001),
    [parsed]
  );

  const finished = step >= total;

  useEffect(() => {
    if (!playing || finished) return;
    timer.current = setInterval(() => {
      setStep((s) => Math.min(s + 1, total));
    }, 750 / speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, finished, total]);

  // NOTE: no "reset on new plan" effect here — the parent remounts via key.

  const handlePlay = () => {
    if (finished) {
      setStep(0);
      setPlaying(true);
      return;
    }
    if (step === 0 && !playing) {
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const stateOf = (n: PlanNode): NodeState => {
    if (n.orderIndex < step) return "done";
    if (n.orderIndex === step && step < total) return "active";
    return "idle";
  };

  const restart = () => {
    setStep(0);
    setPlaying(true);
  };

  const detail = hovered ?? slowest;

  return (
    <div>
      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handlePlay}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
        >
          {finished ? "Replay" : playing ? "Pause" : step === 0 ? "Play execution" : "Resume"}
        </button>
        <button
          onClick={restart}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          Restart
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPlaying(false);
            setStep(v);
          }}
          className="w-56 accent-amber-400"
          aria-label="Execution timeline scrubber"
        />
        <span className="font-mono text-xs text-zinc-400">
          {Math.min(step, total)} / {total} nodes
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300"
          aria-label="Playback speed"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
        </select>
      </div>

      {/* tree */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/60">
        <svg width={width} height={height} className="min-w-full">
          <g transform="translate(40,45)">
            {/* edges */}
            {parsed.nodes.flatMap((n) =>
              n.children.map((c) => {
                const a = pos.get(n.id)!;
                const b = pos.get(c.id)!;
                const onCritical =
                  parsed.criticalPathIds.includes(n.id) && parsed.criticalPathIds.includes(c.id);
                return (
                  <path
                    key={`${n.id}-${c.id}`}
                    d={edgePath(a, b)}
                    fill="none"
                    stroke={onCritical ? "#f59e0b" : "#3f3f46"}
                    strokeOpacity={onCritical ? 0.7 : 0.8}
                    strokeWidth={onCritical ? 2.5 : 1.5}
                  />
                );
              })
            )}
            {/* nodes */}
            {parsed.nodes.map((n) => {
              const p = pos.get(n.id)!;
              const st = stateOf(n);
              const isBottleneck = n.id === slowest.id;
              const barW = (n.exclusiveTime / maxExclusive) * BAR_MAX_W;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                >
                  {isBottleneck && (
                    <g className="bottleneck-pulse">
                      <rect
                        x={-NODE_W / 2 - 6}
                        y={-NODE_H / 2 - 6}
                        width={NODE_W + 12}
                        height={NODE_H + 12}
                        rx={14}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={2}
                      />
                    </g>
                  )}
                  <rect
                    x={-NODE_W / 2}
                    y={-NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx={12}
                    fill={st === "active" ? "#451a03" : st === "done" ? "#052e22" : "#18181b"}
                    stroke={
                      isBottleneck
                        ? "#ef4444"
                        : st === "active"
                          ? "#fbbf24"
                          : st === "done"
                            ? "#34d399"
                            : "#52525b"
                    }
                    strokeWidth={st === "active" || isBottleneck ? 2.5 : 1.5}
                    opacity={st === "idle" ? 0.55 : 1}
                    style={{ transition: "all 0.35s ease" }}
                  />
                  {isBottleneck && (
                    <g transform={`translate(0,${-NODE_H / 2 - 22})`}>
                      <rect x={-52} y={-11} width={104} height={22} rx={11} fill="#ef4444" />
                      <text textAnchor="middle" dy={4} fontSize={10} fontWeight={700} fill="#fff">
                        BOTTLENECK
                      </text>
                    </g>
                  )}
                  <text
                    textAnchor="middle"
                    dy={-4}
                    fontSize={12}
                    fontWeight={700}
                    fill={st === "idle" ? "#a1a1aa" : "#fafafa"}
                    fontFamily="ui-monospace, monospace"
                  >
                    {n.nodeType.length > 26 ? n.nodeType.slice(0, 25) + "…" : n.nodeType}
                  </text>
                  <text
                    textAnchor="middle"
                    dy={14}
                    fontSize={10}
                    fill="#71717a"
                    fontFamily="ui-monospace, monospace"
                  >
                    {(n.relationName ?? n.indexName ?? "").slice(0, 30)}
                  </text>
                  {/* timing bar */}
                  <rect
                    x={NODE_W / 2 + 14}
                    y={-5}
                    width={Math.max(barW, 2)}
                    height={10}
                    rx={5}
                    fill={isBottleneck ? "#ef4444" : st === "done" ? "#34d399" : "#3f3f46"}
                    opacity={st === "idle" ? 0.4 : 1}
                    style={{ transition: "all 0.35s ease" }}
                  />
                  <text
                    x={NODE_W / 2 + 20 + BAR_MAX_W}
                    dy={4}
                    fontSize={11}
                    fill="#a1a1aa"
                    fontFamily="ui-monospace, monospace"
                  >
                    {formatMs(n.exclusiveTime)}
                    {n.actualLoops > 1 ? ` ×${n.actualLoops}` : ""}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-500" /> not yet executed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> executing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" /> done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> bottleneck
        </span>
        <span className="ml-auto font-mono">amber edges = critical path</span>
      </div>

      {/* detail panel */}
      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <p className="font-mono text-sm font-bold text-white">{nodeLabel(detail)}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs sm:grid-cols-4">
          <Detail label="exclusive" value={formatMs(detail.exclusiveTime)} accent />
          <Detail label="inclusive" value={formatMs(detail.inclusiveTime)} />
          <Detail
            label="rows"
            value={`${detail.actualRows.toLocaleString()} actual / ${detail.planRows.toLocaleString()} planned`}
          />
          <Detail label="loops" value={String(detail.actualLoops)} />
          {detail.filter && <Detail label="filter" value={detail.filter} wide />}
          {detail.rowsRemovedByFilter > 0 && (
            <Detail
              label="rows removed by filter"
              value={detail.rowsRemovedByFilter.toLocaleString()}
              warn
              wide
            />
          )}
          {detail.actualRows > 0 && detail.planRows > 0 && (
            <RowEstimate actual={detail.actualRows} planned={detail.planRows} />
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  accent,
  warn,
  wide,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-4" : ""}>
      <p className="text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 break-words ${
          warn ? "text-red-400" : accent ? "text-amber-300" : "text-zinc-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function RowEstimate({ actual, planned }: { actual: number; planned: number }) {
  const ratio = actual / planned;
  const bad = ratio > 10 || ratio < 0.1;
  if (!bad) return null;
  return (
    <div className="col-span-2 sm:col-span-4">
      <p className="text-zinc-500">planner estimate</p>
      <p className="mt-0.5 text-red-400">
        Off by {ratio > 1 ? `${ratio.toFixed(1)}x over` : `${(1 / ratio).toFixed(1)}x under`} — stale
        statistics? Try ANALYZE.
      </p>
    </div>
  );
}
