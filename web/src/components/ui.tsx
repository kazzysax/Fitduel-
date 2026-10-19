// Building blocks of the FitDuel look: dark rounded cards, one lime accent,
// big numbers with small units, gauges, a ruler bar and a dot calendar.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className = "", as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardLabel({ icon: Icon, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-label">
      <span>
        {Icon && <Icon size={15} strokeWidth={2} aria-hidden />}
        {children}
      </span>
      {action}
    </div>
  );
}

export function IconButton({ icon: Icon, label, onClick, badge, active }: { icon: LucideIcon; label: string; onClick?: () => void; badge?: number; active?: boolean }) {
  return (
    <button className={`icon-btn ${active ? "on" : ""}`} onClick={onClick} aria-label={label} title={label}>
      <Icon size={19} strokeWidth={1.8} aria-hidden />
      {!!badge && <span className="icon-badge">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

export function BigNumber({ value, unit, small }: { value: ReactNode; unit?: string; small?: boolean }) {
  return (
    <div className={`big-number ${small ? "small" : ""}`}>
      {value}
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

export function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

// Floating stat pill over the hero, with a dot that "points" at the champion.
export function StatPill({ icon: Icon, children, className = "" }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={`stat-pill ${className}`}>
      <Icon size={13} strokeWidth={2} aria-hidden />
      {children}
    </div>
  );
}

// Arc gauge (about 240°) with tick marks, a lime arc and a needle.
export function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const f = Math.max(0, Math.min(1, value / max));
  const sweep = 240; // degrees, centred on 12 o'clock
  const cx = 70;
  const cy = 66;
  const r = 52;
  const point = (deg: number, radius: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  const a0 = -sweep / 2;
  const a1 = a0 + sweep * f;
  const arc = (from: number, to: number, radius: number) => {
    const [x0, y0] = point(from, radius);
    const [x1, y1] = point(to, radius);
    return `M${x0},${y0} A${radius},${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x1},${y1}`;
  };
  const [nx, ny] = point(a1, r - 14);
  return (
    <svg className="gauge" viewBox="0 0 140 100" role="img" aria-label={`${label}: ${value} of ${max}`}>
      {Array.from({ length: 13 }, (_, i) => {
        const deg = a0 + (sweep / 12) * i;
        const [x0, y0] = point(deg, r + 7);
        const [x1, y1] = point(deg, r + (i % 3 === 0 ? 12 : 10));
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className="gauge-tick" />;
      })}
      <path d={arc(a0, a0 + sweep, r)} className="gauge-track" />
      {f > 0 && <path d={arc(a0, a1, r)} className="gauge-fill" />}
      <line x1={cx} y1={cy} x2={nx} y2={ny} className="gauge-needle" />
      <circle cx={cx} cy={cy} r="4.5" className="gauge-hub" />
    </svg>
  );
}

// Ruler-style progress bar: fine ticks, a lime marker at the current value.
export function RulerBar({ value, max, unit }: { value: number; max: number; unit: string }) {
  const f = Math.max(0, Math.min(1, value / max));
  const ticks = 48;
  return (
    <div className="ruler" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={`${value} of ${max} ${unit}`}>
      <div className="ruler-top">
        <span>0</span>
        <span>{Math.round(f * 100)}%</span>
      </div>
      <div className="ruler-track">
        <div className="ruler-fill" style={{ width: `${f * 100}%` }} />
        <div className="ruler-ticks" aria-hidden>
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <span key={i} className={i % 6 === 0 ? "major" : ""} />
          ))}
        </div>
        <div className="ruler-marker" style={{ left: `${f * 100}%` }} />
      </div>
      <div className="ruler-bottom">
        <span>0</span>
        <span>
          <b>{value.toLocaleString()}</b> / {max.toLocaleString()} {unit}
        </span>
      </div>
    </div>
  );
}

// Small ring with a number or icon in the middle (progress toward a goal).
export function ProgressCircle({ value, children, size = 44 }: { value: number; children: ReactNode; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, value));
  return (
    <div className="progress-circle" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="pc-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="pc-fill" strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span>{children}</span>
    </div>
  );
}

// Dot calendar: one dot per day, grouped by month; brighter dots for more activity.
export function DotMatrix({ days }: { days: { date: string; level: 0 | 1 | 2 | 3 }[] }) {
  const months = new Map<string, typeof days>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(d);
  }
  return (
    <div className="dot-matrix">
      {[...months.entries()].map(([key, list]) => {
        const first = new Date(`${key}-01T12:00:00`);
        const offset = (first.getDay() + 6) % 7; // weeks start on Monday
        const startDay = Number(list[0].date.slice(8, 10)) - 1;
        return (
          <div key={key} className="dm-month">
            <div className="dm-name">{first.toLocaleDateString(undefined, { month: "short" })}</div>
            <div className="dm-grid">
              {Array.from({ length: offset + startDay }, (_, i) => (
                <span key={`pad${i}`} className="dm-dot pad" />
              ))}
              {list.map((d) => (
                <span key={d.date} className={`dm-dot l${d.level}`} title={d.date} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Toast({ children, error, onClose }: { children: ReactNode; error?: boolean; onClose: () => void }) {
  return (
    <div className={`toast ${error ? "error-toast" : ""}`} role={error ? "alert" : "status"}>
      <span>{children}</span>
      <button className="toast-x" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
