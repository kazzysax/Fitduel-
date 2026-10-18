// App shell: five tabs (bottom bar on phones, side rail on desktop) plus the full-screen
// 3D arena, which opens on top of the Battleground.

import { useEffect, useState } from "react";

import { ArenaView, type ArenaProps } from "./arena/ArenaView.tsx";
import { TABS, type GoOptions, type Tab } from "./nav.ts";
import { Battleground } from "./pages/Battleground.tsx";
import { ChampPage } from "./pages/Champ.tsx";
import { Progress } from "./pages/Progress.tsx";
import { Today } from "./pages/Today.tsx";
import { Train } from "./pages/Train.tsx";

function tabFromHash(): Tab {
  const id = location.hash.replace("#/", "");
  return TABS.some((t) => t.id === id) ? (id as Tab) : "today";
}

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [opts, setOpts] = useState<GoOptions>({});
  const [arena, setArena] = useState<ArenaProps | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: Tab, o: GoOptions = {}) => {
    setOpts(o);
    setTab(next);
    if (location.hash !== `#/${next}`) history.pushState(null, "", `#/${next}`);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  const openArena = (a: ArenaProps) =>
    setArena({
      ...a,
      onExit: () => {
        a.onExit();
        setArena(null);
      },
    });

  return (
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
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === "today" && <Today go={go} />}
        {tab === "train" && <Train opts={opts} />}
        {tab === "progress" && <Progress />}
        {tab === "battleground" && <Battleground opts={opts} openArena={openArena} />}
        {tab === "champ" && <ChampPage go={go} />}
      </main>
      {arena && <ArenaView key={`${arena.mode}-${arena.seed}`} {...arena} />}
    </div>
  );
}
