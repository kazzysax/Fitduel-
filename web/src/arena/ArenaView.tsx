// Full-screen 3D arena for watching a Duel or Rumble. The fight is simulated up front
// from the fighters and seed (deterministic), then played back as a replay.

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three/addons/controls/OrbitControls.js";

import type { FakePlayer } from "../../../engine/fakeData.ts";
import { maxHpFor, simulateRumble, TICKS_PER_SECOND, type Frames, type RumbleResult } from "../../../engine/rumble.ts";
import type { Fighter, Venue } from "../data/battle.ts";
import { samplePose, type Playback } from "../replay.ts";
import { Arena } from "../scene/Arena.tsx";
import { BrickFighter } from "../scene/BrickFighter.tsx";
import { Controls, DuelBars, Feed, Results, RingList, TopBar, type ArenaMode } from "./ArenaHud.tsx";

const RESULTS_DELAY_TICKS = 25; // let the final KO burst play before showing results

export interface ArenaProps {
  mode: ArenaMode;
  title: string;
  venue: Venue;
  fighters: FakePlayer[];
  seed: number;
  youIndex: number | null;
  myXp?: number | null;
  startAt?: number; // seconds into the fight, for joining a live fight late
  onExit: () => void;
  onFinish?: (result: RumbleResult) => void;
  onNext?: () => void;
  nextLabel?: string;
}

function PlaybackClock({ playback, endTick }: { playback: Playback; endTick: number }) {
  useFrame((_, dt) => {
    if (!playback.playing) return;
    playback.t = Math.min(endTick, playback.t + Math.min(dt, 0.1) * TICKS_PER_SECOND * playback.speed);
    if (playback.t >= endTick) playback.playing = false;
  });
  return null;
}

function CameraRig({ frames, playback, follow, duel }: { frames: Frames; playback: Playback; follow: number | null; duel: boolean }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  // Portrait phones stand further back to fit the ring; duels sit closer to the action.
  useEffect(() => {
    const distance = (aspect < 0.8 ? 30 : aspect < 1.2 ? 24 : 19) * (duel ? 0.7 : 1);
    camera.position.setLength(distance);
  }, [aspect, camera, duel]);
  useFrame(() => {
    if (!controls) return;
    let goal = { x: 0, z: 0 };
    if (follow !== null) {
      goal = samplePose(frames, follow, playback.t);
    } else if (duel) {
      const a = samplePose(frames, 0, playback.t);
      const b = samplePose(frames, 1, playback.t);
      goal = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    }
    const pull = duel ? 0.9 : 0.6;
    controls.target.x += (goal.x * pull - controls.target.x) * 0.05;
    controls.target.z += (goal.z * pull - controls.target.z) * 0.05;
    controls.update();
  });
  return null;
}

export function ArenaView(props: ArenaProps) {
  const { mode, title, venue, fighters, seed, youIndex, myXp = null, startAt = 0, onExit, onFinish, onNext, nextLabel } = props;
  const duel = fighters.length === 2;
  const [showRing, setShowRing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [follow, setFollow] = useState(!duel);

  const result = useMemo(() => simulateRumble(fighters, seed, { recordFrames: true }), [fighters, seed]);
  const frames = result.frames!;
  const koTicks = useMemo(() => result.events.filter((e) => e.type === "ko").map((e) => e.tick), [result]);
  const maxHp = useMemo(() => fighters.map((f) => maxHpFor(f.stats)), [fighters]);
  const endTick = frames.ticks + RESULTS_DELAY_TICKS;

  const playback = useRef<Playback>({ t: 0, playing: true, speed: 1 }).current;
  const [tick, setTick] = useState(0);
  const [, forceRender] = useState(0);
  const reported = useRef(false);

  useEffect(() => {
    playback.t = Math.min(startAt * TICKS_PER_SECOND, Math.max(0, frames.ticks - 30));
    playback.playing = true;
    reported.current = false;
    setTick(playback.t);
  }, [result, playback, startAt, frames.ticks]);

  useEffect(() => {
    const id = setInterval(() => setTick(playback.t), 100);
    return () => clearInterval(id);
  }, [playback]);

  const finished = tick >= endTick;
  useEffect(() => {
    if (finished && !reported.current) {
      reported.current = true;
      onFinish?.(result);
    }
  }, [finished, onFinish, result]);

  const followIndex = follow ? (selected ?? youIndex) : selected;

  return (
    <div className="arena-view" style={{ background: venue.background }}>
      <Canvas shadows camera={{ position: [0, 12, 15], fov: 45 }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
        <color attach="background" args={[venue.background]} />
        <fog attach="fog" args={[venue.background, 28, 55]} />
        <hemisphereLight args={[venue.light, "#202436", 0.9]} />
        <directionalLight
          position={[6, 14, 8]}
          intensity={2.2}
          color={venue.light}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
        />
        <PlaybackClock playback={playback} endTick={endTick} />
        <Arena playback={playback} koTicks={koTicks} venue={venue} />
        {fighters.map((p, i) => (
          <BrickFighter
            key={`${seed}-${p.id}`}
            index={i}
            frames={frames}
            playback={playback}
            color={p.color}
            power={p.stats.power}
            rating={p.rating}
            maxHp={maxHp[i]}
            name={p.name}
            isYou={i === youIndex}
            equipped={(p as Fighter).equipped}
            selected={selected === i}
            onSelect={setSelected}
          />
        ))}
        <OrbitControls makeDefault enablePan={false} minDistance={5} maxDistance={40} maxPolarAngle={Math.PI / 2.2} />
        <CameraRig frames={frames} playback={playback} follow={followIndex} duel={duel} />
      </Canvas>

      <TopBar
        title={title}
        venueName={venue.name}
        mode={mode}
        frames={frames}
        tick={tick}
        onExit={onExit}
        onToggleRing={() => setShowRing((v) => !v)}
      />
      {duel ? (
        <DuelBars field={fighters} frames={frames} tick={tick} maxHp={maxHp} />
      ) : (
        <RingList
          open={showRing}
          field={fighters}
          youIndex={youIndex}
          frames={frames}
          tick={tick}
          result={result}
          selected={selected}
          onSelect={(i) => {
            setSelected(i);
            setFollow(true);
          }}
        />
      )}
      {!duel && <Feed field={fighters} result={result} tick={tick} />}
      <Controls
        playback={playback}
        tick={tick}
        endTick={frames.ticks}
        follow={follow}
        onFollow={() => setFollow((v) => !v)}
        onChange={() => {
          setTick(playback.t);
          forceRender((n) => n + 1);
        }}
      />
      {finished && (
        <Results
          mode={mode}
          field={fighters}
          youIndex={youIndex}
          result={result}
          myXp={myXp}
          onReplay={() => {
            playback.t = 0;
            playback.playing = true;
            setTick(0);
          }}
          onExit={onExit}
          onNext={onNext}
          nextLabel={nextLabel}
        />
      )}
    </div>
  );
}
