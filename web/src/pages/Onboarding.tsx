import { useMemo, useState } from "react";

import { ChampViewer } from "../components/ChampViewer.tsx";
import { champOf, updateMe, type Profile } from "../data/store.ts";

const LEVELS = [
  { id: "starting", label: "Just starting", goals: { steps: 6000, reps: 30, activeMinutes: 20 } },
  { id: "active", label: "Fairly active", goals: { steps: 8000, reps: 60, activeMinutes: 30 } },
  { id: "athlete", label: "Train most days", goals: { steps: 11000, reps: 120, activeMinutes: 45 } },
];

const STEPS = [
  { title: "Train for real", body: "Count push-ups and squats with your camera, log walks and runs. Your activity is tracked every day." },
  { title: "Build your champion", body: "Push-ups give Power, squats Defense, steps Stamina, running Speed. Training often makes your champ smarter." },
  { title: "Fight in the Battleground", body: "Your champ fights other players' champions in 10-champion Duels and big Rumbles, even while you sleep. Watch every fight in 3D." },
];

export function Onboarding({ profile }: { profile: Profile }) {
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState(LEVELS[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const champ = useMemo(() => champOf(profile), [profile]);

  const finish = async () => {
    setBusy(true);
    try {
      await updateMe({ goals: level.goals, onboarded: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card onboarding">
        {step < STEPS.length ? (
          <>
            <ChampViewer champ={champ} />
            <div className="label">
              Step {step + 1} of {STEPS.length + 1}
            </div>
            <h1>{step === 0 ? `Meet ${profile.champName}` : STEPS[step].title}</h1>
            <p className="note">{step === 0 ? `Your champion starts at OVR ${champ.rating}. ${STEPS[0].body}` : STEPS[step].body}</p>
            <div className="dots" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i === step ? "on" : ""} />
              ))}
            </div>
            <button className="btn btn-primary big-btn" onClick={() => setStep(step + 1)}>
              Next
            </button>
          </>
        ) : (
          <>
            <div className="label">Step 4 of 4</div>
            <h1>Set your daily goals</h1>
            <p className="note">How active are you right now? You can change this any time.</p>
            <div className="level-list" role="radiogroup">
              {LEVELS.map((l) => (
                <button key={l.id} role="radio" aria-checked={level.id === l.id} className={`level ${level.id === l.id ? "on" : ""}`} onClick={() => setLevel(l)}>
                  <b>{l.label}</b>
                  <span>
                    {l.goals.steps.toLocaleString()} steps · {l.goals.reps} reps · {l.goals.activeMinutes} active min a day
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary big-btn" onClick={finish} disabled={busy}>
              {busy ? "Saving…" : "Start training"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
