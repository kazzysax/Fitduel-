// App shell: sign-in gate, onboarding, five tabs (bottom bar on phones, side rail on
// desktop) and the full-screen 3D arena, which any screen can open for a fight.

import { createContext, useContext, useEffect, useState } from "react";

import { ArenaView, type ArenaProps } from "./arena/ArenaView.tsx";
import { fetchFight, VENUES } from "./data/battle.ts";
import { boot, refresh, useSession, type Profile } from "./data/store.ts";
import { TABS, type GoOptions, type Tab } from "./nav.ts";
import { AuthScreen } from "./pages/Auth.tsx";
import { Battleground } from "./pages/Battleground.tsx";
import { ChampPage } from "./pages/Champ.tsx";
import { Onboarding } from "./pages/Onboarding.tsx";
import { Progress } from "./pages/Progress.tsx";
import { Today } from "./pages/Today.tsx";
import { Train } from "./pages/Train.tsx";

function tabFromHash(): Tab {
  const id = location.hash.replace("#/", "");
  return TABS.some((t) => t.id === id) ? (id as Tab) : "today";
}

// Opens a stored fight in the arena. `next` adds a follow-up button (e.g. "Next Duel").
export type WatchFight = (fightId: number, next?: { label: string; run: () => void }) => Promise<void>;
const WatchContext = createContext<WatchFight>(async () => {});
export const useWatchFight = () => useContext(WatchContext);

function Main({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [opts, setOpts] = useState<GoOptions>({});
  const [arena, setArena] = useState<ArenaProps | null>(null);
  const [arenaError, setArenaError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  // Keep data fresh when the app comes back to the foreground (fights may have happened).
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const go = (next: Tab, o: GoOptions = {}) => {
    setOpts(o);
    setTab(next);
    if (location.hash !== `#/${next}`) history.pushState(null, "", `#/${next}`);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  const watch: WatchFight = async (fightId, next) => {
    setArenaError(null);
    try {
      const f = await fetchFight(fightId);
      const youIndex = f.fighters.findIndex((x) => x.id === profile.champId);
      setArena({
        mode: youIndex < 0 ? "spectate" : f.mode,
        title: f.title,
        venue: VENUES[f.venue],
        fighters: f.fighters,
        seed: f.seed,
        youIndex: youIndex < 0 ? null : youIndex,
        entryCents: f.entryCents,
        onExit: () => {
          setArena(null);
          refresh();
        },
        onNext: next ? () => next.run() : undefined,
        nextLabel: next?.label,
      });
    } catch (e) {
      setArenaError((e as Error).message);
    }
  };

  if (!profile.onboarded) return <Onboarding profile={profile} />;

  return (
    <WatchContext.Provider value={watch}>
      <div className="shell">
        <nav className="tabbar" aria-label="Main">
          <div className="brand">
            Fit<span>Duel</span>
          </div>
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
              <span className="tab-icon" aria-hidden>
                {t.icon}
              </span>
              <span>{t.label}</span>
              {t.id === "today" && profile.unread > 0 && <span className="dot" aria-label={`${profile.unread} new`} />}
            </button>
          ))}
        </nav>
        <main className="main">
          {arenaError && (
            <div className="toast error-toast" role="alert">
              <span>{arenaError}</span>
              <button className="btn small" onClick={() => setArenaError(null)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          )}
          {tab === "today" && <Today go={go} />}
          {tab === "train" && <Train opts={opts} />}
          {tab === "progress" && <Progress />}
          {tab === "battleground" && <Battleground opts={opts} />}
          {tab === "champ" && <ChampPage go={go} />}
        </main>
        {arena && <ArenaView key={`${arena.title}-${arena.seed}`} {...arena} />}
      </div>
    </WatchContext.Provider>
  );
}

export function App() {
  const session = useSession();
  useEffect(() => {
    boot();
  }, []);

  if (session.status === "loading") {
    return (
      <div className="splash">
        <div className="brand big">
          Fit<span>Duel</span>
        </div>
      </div>
    );
  }
  if (session.status === "signedOut") return <AuthScreen />;
  if (session.status === "error") {
    return (
      <div className="splash">
        <div className="brand big">
          Fit<span>Duel</span>
        </div>
        <p className="note">{session.message}</p>
        <button className="btn btn-primary" onClick={() => refresh()}>
          Try again
        </button>
      </div>
    );
  }
  return <Main profile={session.profile} />;
}
