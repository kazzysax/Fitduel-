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

export function ChampViewer({ champ, interactive = false }: { champ: Champ; interactive?: boolean }) {
  const frames = useMemo(idleFrames, []);
  const playback = useRef<Playback>({ t: 0, playing: true, speed: 1 }).current;
  return (
    <div className="champ-viewer">
      <Canvas camera={{ position: [1.6, 1.6, 3.2], fov: 35 }} dpr={[1, 2]} shadows>
        <hemisphereLight args={["#fff6e0", "#202436", 1.1]} />
        <directionalLight position={[3, 6, 4]} intensity={2} castShadow shadow-mapSize={[512, 512]} />
        <Clock playback={playback} />
        <group position={[0, -0.75, 0]}>
          <mesh position={[0, -0.1, 0]} receiveShadow>
            <cylinderGeometry args={[0.85, 0.95, 0.2, 32]} />
            <meshStandardMaterial color="#2a2e3d" roughness={0.5} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[Math.sin((i / 6) * Math.PI * 2) * 0.62, 0.03, Math.cos((i / 6) * Math.PI * 2) * 0.62]}>
              <cylinderGeometry args={[0.09, 0.09, 0.06, 16]} />
              <meshStandardMaterial color="#363b4e" roughness={0.4} />
            </mesh>
          ))}
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
