import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three/addons/controls/OrbitControls.js";

import { makeFakeField } from "../../engine/fakeData.ts";
import { maxHpFor, simulateRumble, TICKS_PER_SECOND, type Frames } from "../../engine/rumble.ts";
import { samplePose, type Playback } from "./replay.ts";
import { Arena } from "./scene/Arena.tsx";
import { BrickFighter } from "./scene/BrickFighter.tsx";
import { DEFAULT_TRAINING, makeYou, TODAY } from "./training.ts";
import { Controls, Feed, Results, RingList, TopBar, TrainingPanel } from "./ui.tsx";

const FIELD_SIZE = 30;
const ENTRY_CENTS = 500;
const RESULTS_DELAY_TICKS = 25; // let the final KO burst play before showing results
const YOU = 0;

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

function PlaybackClock({ playback, endTick }: { playback: Playback; endTick: number }) {
  useFrame((_, dt) => {
    if (!playback.playing) return;
    playback.t = Math.min(endTick, playback.t + Math.min(dt, 0.1) * TICKS_PER_SECOND * playback.speed);
    if (playback.t >= endTick) playback.playing = false;
  });
  return null;
}

function CameraRig({ frames, playback, follow }: { frames: Frames; playback: Playback; follow: number | null }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  // Portrait phones need to stand further back to fit the whole ring.
  useEffect(() => {
    const distance = aspect < 0.8 ? 30 : aspect < 1.2 ? 24 : 19;
    camera.position.setLength(distance);
  }, [aspect, camera]);
  useFrame(() => {
    if (!controls) return;
    const goal = follow === null ? { x: 0, z: 0 } : samplePose(frames, follow, playback.t);
    controls.target.x += (goal.x * 0.6 - controls.target.x) * 0.05;
    controls.target.z += (goal.z * 0.6 - controls.target.z) * 0.05;
    controls.update();
  });
  return null;
}

export function App() {
  const [seed, setSeed] = useState(randomSeed);
  const [training, setTraining] = useState(DEFAULT_TRAINING);
  const [showTraining, setShowTraining] = useState(false);
  const [showRing, setShowRing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);

  const you = useMemo(() => makeYou(training), [training]);
  const field = useMemo(() => [you, ...makeFakeField(seed, FIELD_SIZE - 1, TODAY)], [you, seed]);
  const result = useMemo(() => simulateRumble(field, seed, { recordFrames: true }), [field, seed]);
  const frames = result.frames!;
  const koTicks = useMemo(() => result.events.filter((e) => e.type === "ko").map((e) => e.tick), [result]);
  const endTick = frames.ticks + RESULTS_DELAY_TICKS;

  const playback = useRef<Playback>({ t: 0, playing: true, speed: 1 }).current;
  const [tick, setTick] = useState(0);
  const [, forceRender] = useState(0);

  useEffect(() => {
    playback.t = 0;
    playback.playing = true;
    setTick(0);
  }, [result, playback]);

  useEffect(() => {
    const id = setInterval(() => setTick(playback.t), 100);
    return () => clearInterval(id);
  }, [playback]);

  const restart = () => {
    playback.t = 0;
    playback.playing = true;
    setTick(0);
  };
  const followIndex = follow ? (selected ?? YOU) : null;
  const finished = tick >= endTick;

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [0, 12, 15], fov: 45 }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
        <color attach="background" args={["#14161f"]} />
        <fog attach="fog" args={["#14161f", 28, 55]} />
        <hemisphereLight args={["#fff6e0", "#202436", 0.9]} />
        <directionalLight
          position={[6, 14, 8]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
        />
        <PlaybackClock playback={playback} endTick={endTick} />
        <Arena playback={playback} koTicks={koTicks} />
        {field.map((p, i) => (
          <BrickFighter
            key={`${seed}-${p.id}`}
            index={i}
            frames={frames}
            playback={playback}
            color={p.color}
            power={p.stats.power}
            rating={p.rating}
            maxHp={maxHpFor(p.stats)}
            name={p.name}
            isYou={i === YOU}
            selected={selected === i}
            onSelect={setSelected}
          />
        ))}
        <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={40} maxPolarAngle={Math.PI / 2.2} />
        <CameraRig frames={frames} playback={playback} follow={followIndex} />
      </Canvas>

      <TopBar seed={seed} fieldSize={FIELD_SIZE} entryCents={ENTRY_CENTS} frames={frames} tick={tick} onToggleRing={() => setShowRing((v) => !v)} />
      <RingList
        open={showRing}
        field={field}
        frames={frames}
        tick={tick}
        result={result}
        selected={selected}
        onSelect={(i) => {
          setSelected(i);
          setFollow(true);
        }}
        onTrain={() => setShowTraining(true)}
      />
      <Feed field={field} result={result} tick={tick} />
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
        onNewRumble={() => {
          setSelected(null);
          setSeed(randomSeed());
        }}
      />
      {finished && !showTraining && (
        <Results
          field={field}
          result={result}
          entryCents={ENTRY_CENTS}
          onReplay={restart}
          onNext={() => setSeed(randomSeed())}
          onTrain={() => setShowTraining(true)}
        />
      )}
      {showTraining && (
        <TrainingPanel
          initial={training}
          onClose={() => setShowTraining(false)}
          onApply={(t) => {
            setTraining(t);
            setShowTraining(false);
          }}
        />
      )}
    </div>
  );
}
