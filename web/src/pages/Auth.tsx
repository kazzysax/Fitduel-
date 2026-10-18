import { useState } from "react";

import { logIn, signUp } from "../data/store.ts";
import { CHAMP_COLORS } from "./Champ.tsx";

export function AuthScreen() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [champName, setChampName] = useState("");
  const [color, setColor] = useState(CHAMP_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUp(email.trim(), password, champName.trim(), color);
      else await logIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand big">
          Fit<span>Duel</span>
        </div>
        <p className="auth-tag">Train for real. Your training builds an AI champion that fights for you.</p>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>
            Create account
          </button>
          <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
            Log in
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={mode === "signup" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && <small>At least 8 characters</small>}
          </label>
          {mode === "signup" && (
            <>
              <label>
                <span>Name your champion</span>
                <input required minLength={2} maxLength={18} placeholder="e.g. Brickbreaker" value={champName} onChange={(e) => setChampName(e.target.value)} />
              </label>
              <div>
                <span className="label">Champion colour</span>
                <div className="swatches" role="radiogroup" aria-label="Champion colour">
                  {CHAMP_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      role="radio"
                      aria-checked={color === c}
                      aria-label={c}
                      className={`swatch-btn ${color === c ? "on" : ""}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary big-btn" type="submit" disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create my champion" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
