// Small hand-built SVG charts. One series per chart (the title names it), thin marks,
// rounded data ends on the baseline, recessive grid, and a hover tooltip on every mark.

import { useLayoutEffect, useRef, useState } from "react";

export const SERIES = { steps: "#c98500", reps: "#d55181", active: "#3987e5", ovr: "#3987e5" };

export function Ring({ value, goal, color, label, unit }: { value: number; goal: number; color: string; label: string; unit: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, value / goal);
  return (
    <div className="ring-tile">
      <svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={`${label}: ${value} of ${goal} ${unit}`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--track)" strokeWidth="9" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 42 42)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        {f >= 1 && (
          <text x="42" y="47" textAnchor="middle" fontSize="16" fill="var(--text)" aria-hidden>
            ✓
          </text>
        )}
      </svg>
      <div>
        <div className="ring-label">
          <span className="key" style={{ background: color }} />
          {label}
        </div>
        <div className="ring-value mono">
          {value.toLocaleString()}
          <small> / {goal.toLocaleString()} {unit}</small>
        </div>
      </div>
    </div>
  );
}

interface Point {
  label: string; // x label, e.g. "Mon 14"
  value: number;
}

const H = 200;
const PAD = { l: 40, r: 12, t: 12, b: 26 };

// Charts draw at their real pixel width so text stays 11px on every screen.
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Label every nth day, always the last one, and skip any that would crowd it.
function showLabel(i: number, count: number, width: number): boolean {
  const step = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 70))));
  if (i === count - 1) return true;
  return i % step === 0 && count - 1 - i >= step;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function fmt(v: number): string {
  return v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10);
}

function Grid({ max, W, ticks = 4 }: { max: number; W: number; ticks?: number }) {
  return (
    <g className="grid">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max / ticks) * i;
        const y = PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function BarChart({ data, color, goal, unit }: { data: Point[]; color: string; goal?: number; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const max = niceMax(Math.max(goal ?? 0, ...data.map((d) => d.value)) * 1.05);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / data.length;
  const barW = Math.max(4, Math.min(28, slot - 6));
  const y = (v: number) => PAD.t + plotH * (1 - v / max);

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of ${unit} per day`} onMouseLeave={() => setHover(null)}>
        <Grid max={max} W={W} />
        {goal !== undefined && (
          <g className="goal">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} />
            <text x={W - PAD.r} y={y(goal) - 5} textAnchor="end">
              Goal {fmt(goal)}
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const x = PAD.l + slot * i + (slot - barW) / 2;
          const h = Math.max(0, plotH * (d.value / max));
          const r = Math.min(4, barW / 2, h);
          const top = PAD.t + plotH - h;
          // Rounded top corners only; square on the baseline.
          const path = h > 0 ? `M${x},${PAD.t + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.t + plotH} Z` : "";
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${d.value} ${unit}`}>
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {showLabel(i, data.length, W) && (
                <text className="xlabel" x={PAD.l + slot * i + slot / 2} y={H - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        <line className="baseline" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} />
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${((PAD.l + slot * hover + slot / 2) / W) * 100}%` }}>
          <b>{data[hover].label}</b>
          <span className="mono">
            {data[hover].value.toLocaleString()} {unit}
          </span>
        </div>
      )}
    </div>
  );
}

export function LineChart({ data, color, unit }: { data: Point[]; color: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const max = niceMax(Math.max(...data.map((d) => d.value)) * 1.1);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (plotW * i) / Math.max(1, data.length - 1);
  const y = (v: number) => PAD.t + plotH * (1 - v / max);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");

  return (
    <div className="chart" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Line chart of ${unit} over time`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - PAD.l) / plotW) * (data.length - 1)))));
        }}
      >
        <Grid max={max} W={W} />
        <line className="baseline" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {data.map(
          (d, i) =>
            showLabel(i, data.length, W) && (
              <text key={d.label} className="xlabel" x={x(i)} y={H - 8} textAnchor="middle">
                {d.label}
              </text>
            ),
        )}
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
        {hover !== null && (
          <g>
            <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH} />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{data[hover].label}</b>
          <span className="mono">
            {unit} {data[hover].value}
          </span>
        </div>
      )}
    </div>
  );
}
