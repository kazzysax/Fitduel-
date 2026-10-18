// Brick-built boxing ring with an instanced crowd that cheers after knockouts.

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { RING_HALF_SIZE } from "../../../engine/rumble.ts";
import { createRng } from "../../../engine/rng.ts";
import type { Venue } from "../data/battle.ts";
import type { Playback } from "../replay.ts";

const EDGE = RING_HALF_SIZE + 0.7;
const ROPE_HEIGHTS = [0.45, 0.85, 1.25];
const STUD_SPACING = 0.6;
const FLOOR_Y = -0.81;
const CROWD_ROWS = 4;
const ROW_RISE = 0.55;
const rowDistance = (row: number) => EDGE + 2.2 + row * 1.1;

function Studs({ color }: { color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const positions = useMemo(() => {
    const out: [number, number][] = [];
    const r = EDGE - 0.25;
    for (let v = -r; v <= r + 1e-6; v += STUD_SPACING) {
      out.push([v, -r], [v, r]);
      if (Math.abs(v) < r - 1e-6) out.push([-r, v], [r, v]);
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    positions.forEach(([x, z], i) => ref.current.setMatrixAt(i, m.makeTranslation(x, 0.03, z)));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]} receiveShadow>
      <cylinderGeometry args={[0.12, 0.12, 0.06, 16]} />
      <meshStandardMaterial color={color} roughness={0.35} />
    </instancedMesh>
  );
}

function Crowd({ playback, koTicks, fill }: { playback: Playback; koTicks: number[]; fill: number }) {
  const bodies = useRef<THREE.InstancedMesh>(null!);
  const heads = useRef<THREE.InstancedMesh>(null!);
  const fans = useMemo(() => {
    const rng = createRng(2026);
    const palette = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#8338ec", "#ff006e", "#06d6a0", "#ffbe0b", "#3a86ff", "#ffffff"];
    const skins = ["#f2c38f", "#d9a066", "#a86b3c", "#7a4a26", "#ffd9b3"];
    const out: { x: number; y: number; z: number; rot: number; phase: number; body: THREE.Color; skin: THREE.Color }[] = [];
    for (let row = 0; row < CROWD_ROWS; row++) {
      const d = rowDistance(row);
      const y = FLOOR_Y + row * ROW_RISE;
      for (let side = 0; side < 4; side++) {
        for (let v = -d + 0.6; v <= d - 0.6; v += 0.85) {
          if (rng() > fill) continue; // empty seats
          const jitter = (rng() - 0.5) * 0.25;
          const [x, z] = side === 0 ? [v + jitter, -d] : side === 1 ? [v + jitter, d] : side === 2 ? [-d, v + jitter] : [d, v + jitter];
          out.push({
            x,
            y,
            z,
            rot: Math.atan2(-x, -z),
            phase: rng() * Math.PI * 2,
            body: new THREE.Color(palette[Math.floor(rng() * palette.length)]),
            skin: new THREE.Color(skins[Math.floor(rng() * skins.length)]),
          });
        }
      }
    }
    return out;
  }, [fill]);

  useLayoutEffect(() => {
    fans.forEach((f, i) => {
      bodies.current.setColorAt(i, f.body);
      heads.current.setColorAt(i, f.skin);
    });
    bodies.current.instanceColor!.needsUpdate = true;
    heads.current.instanceColor!.needsUpdate = true;
  }, [fans]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    // Excitement spikes after each knockout and fades over a few seconds.
    let excitement = 0;
    for (const tick of koTicks) {
      if (tick > playback.t) break;
      excitement += Math.exp(-(playback.t - tick) / 25);
    }
    excitement = Math.min(1.5, excitement);
    const time = clock.elapsedTime;
    fans.forEach((f, i) => {
      const bob = Math.abs(Math.sin(time * (3 + excitement * 6) + f.phase)) * (0.03 + 0.18 * excitement);
      q.setFromAxisAngle(up, f.rot);
      p.set(f.x, f.y + 0.28 + bob, f.z);
      bodies.current.setMatrixAt(i, m.compose(p, q, one));
      p.set(f.x, f.y + 0.7 + bob, f.z);
      heads.current.setMatrixAt(i, m.compose(p, q, one));
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, fans.length]}>
        <boxGeometry args={[0.42, 0.55, 0.26]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, fans.length]}>
        <boxGeometry args={[0.26, 0.26, 0.26]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </>
  );
}

// Stepped stands under each crowd row.
function Bleachers({ colors }: { colors: [string, string] }) {
  const steps = [];
  for (let row = 1; row < CROWD_ROWS; row++) {
    const d = rowDistance(row);
    const h = row * ROW_RISE;
    const len = d * 2 + 1.1;
    for (let side = 0; side < 4; side++) {
      const horizontal = side < 2;
      const offset = side % 2 === 0 ? -d : d;
      steps.push(
        <mesh key={`${row}-${side}`} position={horizontal ? [0, FLOOR_Y + h / 2, offset] : [offset, FLOOR_Y + h / 2, 0]}>
          <boxGeometry args={horizontal ? [len, h, 1.1] : [1.1, h, len]} />
          <meshStandardMaterial color={colors[row % 2]} roughness={0.9} />
        </mesh>,
      );
    }
  }
  return <>{steps}</>;
}

export function Arena({ playback, koTicks, venue }: { playback: Playback; koTicks: number[]; venue: Venue }) {
  const corners: [number, number, string][] = [
    [-EDGE + 0.15, -EDGE + 0.15, venue.posts[0]],
    [EDGE - 0.15, EDGE - 0.15, venue.posts[1]],
    [-EDGE + 0.15, EDGE - 0.15, "#f1f1f1"],
    [EDGE - 0.15, -EDGE + 0.15, "#f1f1f1"],
  ];
  return (
    <group>
      {/* Platform and canvas */}
      <mesh position={[0, -0.4, 0]} receiveShadow castShadow>
        <boxGeometry args={[EDGE * 2, 0.8, EDGE * 2]} />
        <meshStandardMaterial color={venue.apron} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[RING_HALF_SIZE * 2 + 0.4, 0.01, RING_HALF_SIZE * 2 + 0.4]} />
        <meshStandardMaterial color={venue.canvas} roughness={0.8} />
      </mesh>
      <Studs color={venue.apron} />
      {/* Corner posts */}
      {corners.map(([x, z, c]) => (
        <mesh key={`${x},${z}`} position={[x, 0.75, z]} castShadow>
          <boxGeometry args={[0.3, 1.5, 0.3]} />
          <meshStandardMaterial color={c} roughness={0.35} />
        </mesh>
      ))}
      {/* Ropes */}
      {ROPE_HEIGHTS.map((h, i) =>
        [0, 1, 2, 3].map((side) => {
          const horizontal = side < 2;
          const offset = side % 2 === 0 ? -EDGE + 0.15 : EDGE - 0.15;
          return (
            <mesh key={`${i}-${side}`} position={horizontal ? [0, h, offset] : [offset, h, 0]}>
              <boxGeometry args={horizontal ? [EDGE * 2 - 0.3, 0.05, 0.05] : [0.05, 0.05, EDGE * 2 - 0.3]} />
              <meshStandardMaterial color={i === 1 ? venue.ropes[0] : venue.ropes[1]} roughness={0.5} />
            </mesh>
          );
        }),
      )}
      {/* Arena floor */}
      <mesh position={[0, -0.81, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={venue.floor} roughness={0.9} />
      </mesh>
      <Bleachers colors={venue.stands} />
      <Crowd key={venue.name} playback={playback} koTicks={koTicks} fill={venue.crowdFill} />
    </group>
  );
}
