import { Check, Lock, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { GEAR, type GearSlot } from "../../../engine/league.ts";
import { ChampViewer } from "../components/ChampViewer.tsx";
import { StatBars } from "../components/StatBars.tsx";
import { Toast } from "../components/ui.tsx";
import { DIVISIONS, divisionFor, VENUES } from "../data/battle.ts";
import { champOf, deleteAccount, logOut, updateChamp, updateMe, useProfile } from "../data/store.ts";
import type { Go } from "../nav.ts";

export const CHAMP_COLORS = ["#ffd60a", "#e63946", "#2a9d8f", "#3a86ff", "#8338ec", "#ff006e", "#06d6a0", "#fb5607", "#f1f1f1", "#30364a"];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function ChampPage({ go }: { go: Go }) {
  const profile = useProfile();
  const champ = useMemo(() => champOf(profile), [profile]);
  const division = divisionFor(champ.rating);
  const next = DIVISIONS.find((d) => d.min > champ.rating);
  const [name, setName] = useState(profile.champName);
  const [goals, setGoals] = useState(profile.goals);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const rec = profile.record;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    }
  };

  const toggleGear = (slot: GearSlot, id: string) => {
    const equipped = { ...profile.equipped };
    if (equipped[slot] === id) delete equipped[slot];
    else equipped[slot] = id;
    run(() => updateChamp({ equipped }), "Gear updated");
  };

  return (
    <div className="page">
      <header className="title-row">
        <h1>{champ.name}</h1>
        <span className="record">
          <b>OVR {champ.rating}</b>
          <span className="muted">{division.name}</span>
        </span>
      </header>

      {msg && (
        <Toast error={msg.error} onClose={() => setMsg(null)}>
          {msg.text}
        </Toast>
      )}

      <div className="two-col champ-layout">
        <section className="card champ-stage">
          <div className="hero-glow" aria-hidden />
          <ChampViewer champ={champ} interactive hero />
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
          <p className="note">Stats come from your last 28 days of training. Recent days count most; training often raises Technique.</p>
          <button className="btn btn-primary" onClick={() => go("train")}>
            Train to power up
          </button>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Locker Room</h2>
          <span className="note">Gear changes how your champ looks, never how it fights.</span>
        </div>
        <div className="locker">
          {GEAR.map((item) => {
            const unlocked = profile.unlocked.includes(item.id);
            const on = profile.equipped[item.slot] === item.id;
            return (
              <button key={item.id} className={`locker-item ${unlocked ? "unlocked" : ""} ${on ? "on" : ""}`} disabled={!unlocked} onClick={() => toggleGear(item.slot, item.id)}>
                <span className="locker-icon" aria-hidden>{on ? <Check size={16} /> : unlocked ? <Sparkles size={16} /> : <Lock size={16} />}</span>
                <b>{item.name}</b>
                <span className="note">{unlocked ? (on ? "Equipped · tap to remove" : "Tap to equip") : item.how}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Look</h2>
          <form
            className="manual-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateChamp({ name: name.trim() }), "Champion renamed");
            }}
          >
            <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} aria-label="Champion name" />
            <button className="btn" type="submit" disabled={name.trim().length < 2 || name.trim() === profile.champName}>
              Rename
            </button>
          </form>
          <div className="swatches" role="radiogroup" aria-label="Champion colour">
            {CHAMP_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={profile.color === c}
                aria-label={c}
                className={`swatch-btn ${profile.color === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => run(() => updateChamp({ color: c }), "Colour updated")}
              />
            ))}
          </div>
          <p className="note">Gloves turn silver at Power 40 and gold at Power 70. Belts show your rating.</p>
        </section>

        <section className="card">
          <h2>Fight record</h2>
          <div className="bests">
            <div>
              <span>Duels won</span>
              <b className="mono">
                {rec.duelWins} of {rec.duels}
              </b>
            </div>
            <div>
              <span>Rumbles entered</span>
              <b className="mono">{rec.rumbles}</b>
            </div>
            <div>
              <span>Best Rumble finish</span>
              <b className="mono">{rec.bestRumblePlace ? `#${rec.bestRumblePlace}` : "—"}</b>
            </div>
            <div>
              <span>Practice winnings</span>
              <b className="mono">{money(rec.practiceWinningsCents)}</b>
            </div>
            <div>
              <span>Best streak</span>
              <b className="mono">{profile.streak.best} days</b>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Daily goals</h2>
        <form
          className="goals"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateMe({ goals }), "Goals saved");
          }}
        >
          <label>
            <span>Steps</span>
            <input type="number" min={1000} max={50000} step={500} value={goals.steps} onChange={(e) => setGoals({ ...goals, steps: Number(e.target.value) })} />
          </label>
          <label>
            <span>Reps</span>
            <input type="number" min={10} max={1000} step={5} value={goals.reps} onChange={(e) => setGoals({ ...goals, reps: Number(e.target.value) })} />
          </label>
          <label>
            <span>Active minutes</span>
            <input type="number" min={5} max={300} step={5} value={goals.activeMinutes} onChange={(e) => setGoals({ ...goals, activeMinutes: Number(e.target.value) })} />
          </label>
          <button className="btn" type="submit">
            Save goals
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Account</h2>
        <p className="note">Signed in as {profile.email}</p>
        <div className="quick">
          <button className="btn" onClick={() => logOut()}>
            Log out
          </button>
          <button
            className="btn danger"
            onClick={() => {
              const pw = prompt("This permanently deletes your account, training and fights. Enter your password to confirm.");
              if (pw) run(() => deleteAccount(pw), "Account deleted");
            }}
          >
            Delete account
          </button>
        </div>
      </section>
    </div>
  );
}
