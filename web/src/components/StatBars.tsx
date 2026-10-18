import type { FighterStats } from "../../../engine/stats.ts";

export const STAT_INFO: { key: keyof FighterStats; label: string; trainedBy: string }[] = [
  { key: "power", label: "Power", trainedBy: "Push-ups" },
  { key: "speed", label: "Speed", trainedBy: "Running" },
  { key: "stamina", label: "Stamina", trainedBy: "Steps" },
  { key: "defense", label: "Defense", trainedBy: "Squats" },
  { key: "technique", label: "Technique", trainedBy: "Training often" },
];

export function StatBars({ stats, compare, compact, showSource }: { stats: FighterStats; compare?: FighterStats; compact?: boolean; showSource?: boolean }) {
  return (
    <div className={`stats ${compact ? "compact" : ""}`}>
      {STAT_INFO.map(({ key, label, trainedBy }) => {
        const delta = compare ? stats[key] - compare[key] : 0;
        return (
          <div className="stat" key={key}>
            <span>
              {label}
              {showSource && <small>{trainedBy}</small>}
            </span>
            <div className="meter" role="meter" aria-valuenow={stats[key]} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
              <div style={{ width: `${stats[key]}%` }} />
            </div>
            <b className="mono">
              {stats[key]}
              {delta !== 0 && <em className={delta > 0 ? "up" : "down"}>{delta > 0 ? `+${delta}` : delta}</em>}
            </b>
          </div>
        );
      })}
    </div>
  );
}
