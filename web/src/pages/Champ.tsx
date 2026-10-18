import { useMemo, useState } from "react";

import { ChampViewer } from "../components/ChampViewer.tsx";
import { StatBars } from "../components/StatBars.tsx";
import { DIVISIONS, divisionFor, VENUES } from "../data/battle.ts";
import { champOf, resetProfile, updateChamp, useProfile } from "../data/store.ts";
import type { Go } from "../nav.ts";

const COLORS = ["#ffd60a", "#e63946", "#2a9d8f", "#3a86ff", "#8338ec", "#ff006e", "#06d6a0", "#fb5607", "#f1f1f1", "#30364a"];

const LOCKER = [
  { name: "Gold headgear", how: "Reach Champion division" },
  { name: "Flame gloves", how: "30-day streak" },
  { name: "Rooftop entrance", how: "Win 10 Duels" },
  { name: "Brick-burst KO effect", how: "Win a Rumble" },
  { name: "Chrome torso", how: "Locker Room shop" },
  { name: "Victory dance", how: "Locker Room shop" },
];

export function ChampPage({ go }: { go: Go }) {
  const profile = useProfile();
  const champ = useMemo(() => champOf(profile), [profile]);
  const division = divisionFor(champ.rating);
  const next = DIVISIONS.find((d) => d.min > champ.rating);
  const [name, setName] = useState(profile.champName);

  const duels = profile.fights.filter((f) => f.mode === "duel");
  const rumbles = profile.fights.filter((f) => f.mode === "rumble");
  const bestPlace = rumbles.length ? Math.min(...rumbles.map((r) => r.place)) : null;
  const winnings = profile.fights.reduce((s, f) => s + f.payoutCents, 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="label">Your AI champion</div>
          <h1>{champ.name}</h1>
        </div>
      </header>

      <div className="two-col champ-layout">
        <section className="card champ-stage">
          <ChampViewer champ={champ} interactive />
          <div className="division-badge">
            <b>{division.name}</b> · fights in the {VENUES[division.venue].name}
          </div>
        </section>

        <section className="card">
          <div className="ovr big-ovr">
            OVR <b>{champ.rating}</b>
          </div>
          {next ? (
            <p className="note">
              {next.min - champ.rating} more to reach <b>{next.name}</b> and the {VENUES[next.venue].name}.
            </p>
          ) : (
            <p className="note">Top division reached. Keep training to stay here: stats fade without training.</p>
          )}
          <StatBars stats={champ.stats} showSource />
          <p className="note">
            Stats come from your last 28 days of training. Recent days count most; regular training raises Technique.
          </p>
          <button className="btn btn-primary" onClick={() => go("train")}>
            Train to power up
          </button>
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <h2>Look</h2>
          <form
            className="manual-row"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim().slice(0, 18);
              if (trimmed) updateChamp({ champName: trimmed });
            }}
          >
            <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} aria-label="Champion name" />
            <button className="btn" type="submit" disabled={!name.trim() || name.trim() === profile.champName}>
              Rename
            </button>
          </form>
          <div className="swatches" role="radiogroup" aria-label="Champion colour">
            {COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={profile.color === c}
                aria-label={c}
                className={`swatch-btn ${profile.color === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => updateChamp({ color: c })}
              />
            ))}
          </div>
          <p className="note">Gloves turn silver at Power 40 and gold at Power 70. Belts show your rating.</p>
        </section>

        <section className="card">
          <h2>Fight record</h2>
          <div className="bests">
            <div>
              <span>Duels</span>
              <b className="mono">
                {duels.filter((d) => d.won).length}W {duels.filter((d) => !d.won).length}L
              </b>
            </div>
            <div>
              <span>Rumbles entered</span>
              <b className="mono">{rumbles.length}</b>
            </div>
            <div>
              <span>Best Rumble finish</span>
              <b className="mono">{bestPlace ? `#${bestPlace}` : "—"}</b>
            </div>
            <div>
              <span>Practice winnings</span>
              <b className="mono">${(winnings / 100).toFixed(2)}</b>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Locker Room</h2>
          <span className="badge">Coming soon</span>
        </div>
        <p className="note">Gear changes how your champ looks, never how it fights.</p>
        <div className="locker">
          {LOCKER.map((item) => (
            <div key={item.name} className="locker-item">
              <span aria-hidden>🔒</span>
              <b>{item.name}</b>
              <span className="note">{item.how}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="note center">
        Prototype data is stored only in this browser.{" "}
        <button className="link" onClick={() => confirm("Reset to the sample data? Your logged workouts and fights will be cleared.") && resetProfile()}>
          Reset demo data
        </button>
      </p>
    </div>
  );
}
