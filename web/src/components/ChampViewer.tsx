// Your champion on a brick podium, idling in a boxing stance. Reuses the arena fighter
// with a one-frame "replay" so the model and its gear tiers are identical everywhere.

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";

import type { Frames } from "../../../engine/rumble.ts";
import type { Champ } from "../data/store.ts";
import type { Playback } from "../replay.ts";
import { BrickFighter } from "../scene/BrickFighter.tsx";

const IDLE_ACT = 255; // not a fight action: the fighter just holds its guard

function idleFrames(): Frames {
  return {
    fighters: 1,
    ticks: 1,
    pos: new Float32Array([0, 0, 0]),
    hp: new Float32Array([100]),
    act: new Uint8Array([IDLE_ACT]),
    actTick: new Int32Array([0]),
    hitTick: new Int32Array([-100]),
  };
}

function Clock({ playback }: { playback: Playback }) {
  useFrame((_, dt) => {
    playback.t += dt * 10;
  });
  return null;
}

export function ChampViewer({ champ, interactive = false, hero = false }: { champ: Champ; interactive?: boolean; hero?: boolean }) {
  const frames = useMemo(idleFrames, []);
  const playback = useRef<Playback>({ t: 0, playing: true, speed: 1 }).current;
  return (
    <div className={`champ-viewer ${hero ? "hero" : ""}`}>
      <Canvas camera={{ position: hero ? [1.2, 1.1, 2.9] : [1.6, 1.6, 3.2], fov: 35 }} dpr={[1, 2]} shadows gl={{ alpha: true }}>
        <hemisphereLight args={["#fff6e0", "#202436", 1.1]} />
        <directionalLight position={[3, 6, 4]} intensity={2} castShadow shadow-mapSize={[512, 512]} />
        <pointLight position={[0, 0.2, -1.4]} intensity={2.2} color="#d4ff3a" distance={4} />
        <Clock playback={playback} />
        <group position={[0, -0.75, 0]}>
          <mesh position={[0, -0.1, 0]} receiveShadow>
            <cylinderGeometry args={[0.85, 0.95, 0.2, 32]} />
            <meshStandardMaterial color="#1d1f1a" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
            <torusGeometry args={[0.72, 0.008, 8, 64]} />
            <meshStandardMaterial color="#d4ff3a" emissive="#c6f432" emissiveIntensity={0.8} transparent opacity={0.7} />
          </mesh>
          <BrickFighter
            index={0}
            frames={frames}
            playback={playback}
            color={champ.color}
            power={champ.stats.power}
            rating={champ.rating}
            maxHp={100}
            name={champ.name}
            isYou={false}
            selected={false}
            hideBar
            equipped={champ.equipped}
            onSelect={() => {}}
          />
        </group>
        <OrbitControls
          enablePan={false}
          enableZoom={interactive}
          enableRotate={interactive}
          autoRotate
          autoRotateSpeed={1.2}
          target={[0, 0, 0]}
          minDistance={2.5}
          maxDistance={6}
        />
      </Canvas>
    </div>
  );
}
