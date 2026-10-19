// Spend XP on upgrade levels; see condition and signature moves.

import { Activity, Brain, Dumbbell, Footprints, HeartPulse, Shield, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";

import {
  AREAS,
  BONUS_PER_LEVEL,
  CONDITION_FULL_AT,
  levelOf,
  MAX_LEVEL,
  MOVE_LEVEL,
  MOVE_MIN_CONDITION,
  MOVES,
  upgradeCost,
  type Area,
  type Move,
} from "../../../engine/progression.ts";
import { buyUpgrade, type Profile } from "../data/store.ts";
import { STAT_INFO } from "./StatBars.tsx";
import { ProgressCircle, Toast } from "./ui.tsx";

const AREA_ICON: Record<Area, LucideIcon> = { power: Dumbbell, speed: Zap, stamina: Footprints, defense: Shield, technique: Brain };

export function Upgrades({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState<Area | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const { champ, xp } = profile;
  const cond = champ.condition.value;

  const buy = async (area: Area) => {
    setBusy(area);
    setMsg(null);
    try {
      const r = await buyUpgrade(area);
      const label = STAT_INFO.find((s) => s.key === area)!.label;
      const move = (Object.keys(MOVES) as Move[]).find((m) => MOVES[m].area === area && r.level === MOVE_LEVEL);
      setMsg({ text: `${label} level ${r.level} (−${r.cost} XP)${move ? ` · ${MOVES[move].name} unlocked!` : ""}` });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="upgrades">
      <div className="upg-head">
        <div>
          <h2>Upgrades</h2>
          <p className="note">Earn XP by training. Spend it to make your champ stronger in the areas you choose.</p>
        </div>
        <div className="xp-balance" aria-label={`${xp.balance} XP available`}>
          <b>{xp.balance.toLocaleString()}</b> XP
        </div>
      </div>

      {msg && (
        <Toast error={msg.error} onClose={() => setMsg(null)}>
          {msg.text}
        </Toast>
      )}

      <div className="condition">
        <ProgressCircle value={cond} size={62}>
          {Math.round(cond * 100)}%
        </ProgressCircle>
        <div>
          <b>
            <HeartPulse size={15} aria-hidden /> Condition
          </b>
          <span className="muted">
            {champ.condition.activeDays} active {champ.condition.activeDays === 1 ? "day" : "days"} in the last 2 weeks ({CONDITION_FULL_AT} needed for full
            strength). Upgrades work at {Math.round(cond * 100)}%
            {cond < MOVE_MIN_CONDITION ? ` and moves are switched off until you reach ${MOVE_MIN_CONDITION * 100}%.` : "."}
          </span>
        </div>
      </div>

      <ul className="upg-list">
        {AREAS.map((area) => {
          const info = STAT_INFO.find((s) => s.key === area)!;
          const Icon = AREA_ICON[area];
          const level = levelOf(champ.upgrades, area);
          const maxed = level >= MAX_LEVEL;
          const cost = upgradeCost(level);
          const affordable = xp.balance >= cost;
          const bonus = champ.stats[area] - champ.baseStats[area];
          return (
            <li key={area}>
              <span className="upg-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <div className="upg-main">
                <div className="upg-title">
                  <b>{info.label}</b>
                  <span className="muted">
                    {champ.stats[area]}
                    {bonus > 0 && <em className="up"> (+{bonus})</em>}
                  </span>
                </div>
                <div className="upg-dots" aria-label={`Level ${level} of ${MAX_LEVEL}`}>
                  {Array.from({ length: MAX_LEVEL }, (_, i) => (
                    <span key={i} className={`${i < level ? "on" : ""} ${i === MOVE_LEVEL - 1 ? "milestone" : ""}`} />
                  ))}
                </div>
                <span className="muted small-print">
                  Lv {level} · +{BONUS_PER_LEVEL} {info.label} per level · base from {info.trainedBy.toLowerCase()}
                </span>
              </div>
              <button className={`btn small ${affordable && !maxed ? "btn-primary" : ""}`} disabled={maxed || !affordable || busy !== null} onClick={() => buy(area)}>
                {maxed ? "Max" : busy === area ? "…" : `${cost} XP`}
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="moves-title">
        <Activity size={16} aria-hidden /> Signature moves
      </h3>
      <div className="moves">
        {(Object.keys(MOVES) as Move[]).map((m) => {
          const move = MOVES[m];
          const unlocked = champ.unlockedMoves.includes(m);
          const active = champ.moves.includes(m);
          const areaLabel = STAT_INFO.find((s) => s.key === move.area)!.label;
          return (
            <div key={m} className={`move ${active ? "active" : unlocked ? "unlocked" : ""}`}>
              <b>{move.name}</b>
              <span className="muted">{move.description}</span>
              <span className="move-status">{active ? "Active" : unlocked ? "Get fit to use" : `${areaLabel} level ${MOVE_LEVEL}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
