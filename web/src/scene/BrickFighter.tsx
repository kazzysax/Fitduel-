// Placeholder blocky toy-brick fighter built from simple shapes (spec 5.1).
// The real Blender kit will replace these meshes but keep the same chunks and pivots:
// legL, legR, hips, upper(torso, head, armL, armR).

import { Billboard } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { Equipped } from "../../../engine/league.ts";
import { Act, type Frames } from "../../../engine/rumble.ts";
import { createRng } from "../../../engine/rng.ts";
import { clampTick, frameIndex, samplePose, type Playback } from "../replay.ts";

const torsoGeo = new THREE.CylinderGeometry(0.33, 0.25, 0.42, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.55);
const geo = {
  leg: new THREE.BoxGeometry(0.19, 0.42, 0.22).translate(0, -0.21, 0),
  boot: new THREE.BoxGeometry(0.2, 0.1, 0.28).translate(0, -0.45, 0.03),
  hips: new THREE.BoxGeometry(0.44, 0.14, 0.26),
  belt: new THREE.BoxGeometry(0.46, 0.06, 0.28),
  torso: torsoGeo,
  arm: new THREE.BoxGeometry(0.13, 0.3, 0.15).translate(0, -0.15, 0),
  glove: new RoundedBoxGeometry(0.21, 0.21, 0.23, 2, 0.06).translate(0, -0.38, 0),
  neck: new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8),
  head: new RoundedBoxGeometry(0.3, 0.28, 0.28, 2, 0.06),
  headgear: new RoundedBoxGeometry(0.34, 0.11, 0.32, 2, 0.04),
  band: new THREE.BoxGeometry(0.315, 0.05, 0.295),
  crownBase: new THREE.BoxGeometry(0.3, 0.06, 0.28),
  crownSpike: new THREE.BoxGeometry(0.06, 0.08, 0.06),
  eye: new THREE.BoxGeometry(0.05, 0.06, 0.02),
  mouth: new THREE.BoxGeometry(0.12, 0.025, 0.02),
  marker: new THREE.RingGeometry(0.42, 0.52, 32).rotateX(-Math.PI / 2),
  barBg: new THREE.PlaneGeometry(0.62, 0.08),
  bar: new THREE.PlaneGeometry(0.6, 0.06).translate(0.3, 0, 0),
};

const plastic = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0 });
const SKINS = ["#f2c38f", "#d9a066", "#a86b3c", "#7a4a26", "#ffd9b3"].map(plastic);
const gold = new THREE.MeshStandardMaterial({ color: "#ffc633", metalness: 0.85, roughness: 0.3 });
// Unlockable gear (engine/league.ts). Looks only.
const gearMat = {
  gold,
  band: plastic("#e63946"),
  flame: new THREE.MeshStandardMaterial({ color: "#ff7a1a", emissive: "#ff3d00", emissiveIntensity: 0.6, roughness: 0.4 }),
  chrome: new THREE.MeshStandardMaterial({ color: "#d9dee6", metalness: 1, roughness: 0.15 }),
};

const mat = {
  dark: plastic("#1d1f27"),
  pants: plastic("#30364a"),
  barBg: new THREE.MeshBasicMaterial({ color: "#111", transparent: true, opacity: 0.6 }),
  marker: new THREE.MeshBasicMaterial({ color: "#d4ff3a", transparent: true, opacity: 0.9 }),
  gloves: [
    plastic("#d62828"),
    new THREE.MeshStandardMaterial({ color: "#c9d0da", metalness: 0.45, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: "#ffc633", metalness: 0.85, roughness: 0.3 }),
  ],
  belts: [plastic("#8d99ae"), plastic("#3a86ff"), plastic("#ffc633")],
};

// Glove material shows Power; belt shows overall rating (spec 5.1).
export function gloveTier(power: number): number {
  return power >= 70 ? 2 : power >= 40 ? 1 : 0;
}
export function beltTier(rating: number): number {
  return rating >= 75 ? 2 : rating >= 50 ? 1 : 0;
}

// Name tag drawn to a canvas texture: no DOM overlay, cheap on phones.
function Label({ text, highlight }: { text: string; highlight: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "800 44px 'Bricolage Grotesque', system-ui, sans-serif";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 36;
    canvas.width = w;
    canvas.height = 64;
    ctx.fillStyle = highlight ? "#d4ff3a" : "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, 64, 14);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = highlight ? "#1b1b1b" : "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 18, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { texture: tex, aspect: w / 64 };
  }, [text, highlight]);
  return (
    <sprite position={[0, 1.85, 0]} scale={[0.32 * aspect, 0.32, 1]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

const GUARD = -2.15;
const REST_BASE_Y = 0.06;
const GRAVITY = 9.8;
const DEBRIS_SECONDS = 3; // bricks stay on the canvas this long, then shrink away

interface Props {
  index: number;
  frames: Frames;
  playback: Playback;
  color: string;
  power: number;
  rating: number;
  maxHp: number;
  name: string;
  isYou: boolean;
  selected: boolean;
  hideBar?: boolean;
  equipped?: Equipped;
  onSelect: (index: number) => void;
}

export function BrickFighter({ index, frames, playback, color, power, rating, maxHp, name, isYou, selected, hideBar, equipped = {}, onSelect }: Props) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const upper = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const hips = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const bar = useRef<THREE.Group>(null!);
  const tags = useRef<THREE.Group>(null);
  const barFill = useRef<THREE.Mesh>(null!);

  const colorMat = useMemo(() => plastic(color), [color]);
  const barMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#3ddc84" }), []);
  const skin = SKINS[index % SKINS.length];
  const gloveMat = equipped.gloves === "flame-gloves" ? gearMat.flame : mat.gloves[gloveTier(power)];

  // Knockout burst: each chunk flies off with its own velocity and spin, then lands.
  const chunks = useMemo(() => {
    const rng = createRng(index * 7919 + 17);
    const spec: { ref: React.RefObject<THREE.Group>; base: THREE.Vector3; parentY: number }[] = [
      { ref: legL, base: new THREE.Vector3(0.11, 0.5, 0), parentY: 0 },
      { ref: legR, base: new THREE.Vector3(-0.11, 0.5, 0), parentY: 0 },
      { ref: hips, base: new THREE.Vector3(0, 0.5, 0), parentY: 0 },
      { ref: torso, base: new THREE.Vector3(0, 0.27, 0), parentY: 0.5 },
      { ref: head, base: new THREE.Vector3(0, 0.66, 0), parentY: 0.5 },
      { ref: armL, base: new THREE.Vector3(0.3, 0.42, 0), parentY: 0.5 },
      { ref: armR, base: new THREE.Vector3(-0.3, 0.42, 0), parentY: 0.5 },
    ];
    return spec.map((c) => {
      const vy = 2 + rng() * 2.5;
      const startY = c.base.y + c.parentY;
      const landAt = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, startY - REST_BASE_Y))) / GRAVITY;
      return {
        ...c,
        v: new THREE.Vector3((rng() - 0.5) * 3, vy, (rng() - 0.5) * 3 - 0.8),
        spin: new THREE.Vector3((rng() - 0.5) * 14, (rng() - 0.5) * 14, (rng() - 0.5) * 14),
        landAt,
      };
    });
  }, [index]);

  useFrame(() => {
    const t = clampTick(frames, playback.t);
    const pose = samplePose(frames, index, t);
    root.current.position.set(pose.x, 0, pose.z);
    root.current.rotation.y = pose.rot;

    const k = frameIndex(frames, index, t);
    const act = frames.act[k];
    const age = t - frames.actTick[k];

    if (act === Act.Out) {
      bar.current.visible = false;
      body.current.position.y = 0;
      upper.current.rotation.set(0, 0, 0);
      const s = Math.max(0, age) / 10;
      if (tags.current) tags.current.visible = s < DEBRIS_SECONDS + 1;
      for (const c of chunks) {
        const g = c.ref.current;
        const st = Math.min(s, c.landAt);
        g.position.set(
          c.base.x + c.v.x * st,
          Math.max(REST_BASE_Y - c.parentY, c.base.y + c.v.y * st - 0.5 * GRAVITY * st * st),
          c.base.z + c.v.z * st,
        );
        g.rotation.set(c.spin.x * st, c.spin.y * st, c.spin.z * st);
        g.scale.setScalar(Math.max(0.001, Math.min(1, (DEBRIS_SECONDS + 1 - s) / 1)));
      }
      return;
    }

    for (const c of chunks) {
      c.ref.current.position.copy(c.base);
      c.ref.current.rotation.set(0, 0, 0);
      c.ref.current.scale.setScalar(1);
    }
    bar.current.visible = !hideBar;
    if (tags.current) tags.current.visible = true;
    const hp = frames.hp[k] / maxHp;
    barFill.current.scale.x = Math.max(0.001, hp);
    barMat.color.setHSL(0.33 * hp, 0.75, 0.5);

    const phase = playback.t * 0.9 + index;
    const moving = act === Act.Move;
    body.current.position.y = Math.abs(Math.sin(phase * (moving ? 1 : 0.5))) * (moving ? 0.05 : 0.025);
    legL.current.rotation.x = moving ? Math.sin(phase) * 0.6 : 0;
    legR.current.rotation.x = moving ? -Math.sin(phase) * 0.6 : 0;

    // Arms default to a boxing guard; punches blend out of it.
    armL.current.rotation.set(GUARD, -0.35, 0);
    armR.current.rotation.set(GUARD, 0.35, 0);
    const strike = age < 2 ? age / 2 : Math.max(0, 1 - (age - 2) / 3);
    if (act === Act.Jab) {
      armR.current.rotation.set(GUARD + (-Math.PI / 2 - GUARD) * strike, 0.35 * (1 - strike), 0);
      armR.current.position.z += 0.12 * strike;
    } else if (act === Act.Hook) {
      armL.current.rotation.set(-Math.PI / 2, 0.9 - 1.5 * strike, 0);
      upper.current.rotation.y = -0.4 * strike;
    } else if (act === Act.Uppercut) {
      armR.current.rotation.set(-0.6 - 2.1 * strike, 0.2, 0);
      upper.current.rotation.x = 0.15 * strike;
    } else if (act === Act.Guard) {
      armL.current.rotation.set(-2.5, -0.6, 0);
      armR.current.rotation.set(-2.5, 0.6, 0);
    } else if (act === Act.Rest) {
      armL.current.rotation.set(-0.5, -0.2, 0);
      armR.current.rotation.set(-0.5, 0.2, 0);
    }
    if (act !== Act.Hook) upper.current.rotation.y = 0;
    if (act !== Act.Uppercut) upper.current.rotation.x = 0;

    const hitAge = t - frames.hitTick[k];
    if (hitAge >= 0 && hitAge < 4) upper.current.rotation.x = -0.4 * (1 - hitAge / 4);
  });

  const select = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(index);
  };

  return (
    <group ref={root} onClick={select}>
      {(isYou || selected) && (
        <group ref={tags}>
          <mesh geometry={geo.marker} material={mat.marker} position={[0, 0.02, 0]} />
          <Label text={isYou ? "YOU" : name} highlight={isYou} />
        </group>
      )}
      <group ref={body}>
        <group ref={legL}>
          <mesh geometry={geo.leg} material={mat.pants} castShadow />
          <mesh geometry={geo.boot} material={mat.dark} castShadow />
        </group>
        <group ref={legR}>
          <mesh geometry={geo.leg} material={mat.pants} castShadow />
          <mesh geometry={geo.boot} material={mat.dark} castShadow />
        </group>
        <group ref={hips}>
          <mesh geometry={geo.hips} material={colorMat} castShadow />
          <mesh geometry={geo.belt} material={mat.belts[beltTier(rating)]} position={[0, 0.07, 0]} />
        </group>
        <group ref={upper} position={[0, 0.5, 0]}>
          <group ref={torso}>
            <mesh geometry={geo.torso} material={equipped.torso === "chrome-torso" ? gearMat.chrome : colorMat} castShadow />
          </group>
          <group ref={head}>
            <mesh geometry={geo.neck} material={skin} position={[0, -0.16, 0]} />
            <mesh geometry={geo.head} material={skin} castShadow />
            {!equipped.head && <mesh geometry={geo.headgear} material={colorMat} position={[0, 0.12, -0.01]} />}
            {equipped.head === "gold-headgear" && <mesh geometry={geo.headgear} material={gearMat.gold} position={[0, 0.12, -0.01]} />}
            {equipped.head === "sweatband" && <mesh geometry={geo.band} material={gearMat.band} position={[0, 0.07, 0]} />}
            {equipped.head === "crown" && (
              <group position={[0, 0.17, 0]}>
                <mesh geometry={geo.crownBase} material={gearMat.gold} />
                {[-0.1, 0, 0.1].map((x) => (
                  <mesh key={x} geometry={geo.crownSpike} material={gearMat.gold} position={[x, 0.07, 0.1]} />
                ))}
              </group>
            )}
            <mesh geometry={geo.eye} material={mat.dark} position={[0.065, 0.02, 0.141]} />
            <mesh geometry={geo.eye} material={mat.dark} position={[-0.065, 0.02, 0.141]} />
            <mesh geometry={geo.mouth} material={mat.dark} position={[0, -0.07, 0.141]} />
          </group>
          <group ref={armL} rotation-order="YXZ">
            <mesh geometry={geo.arm} material={colorMat} castShadow />
            <mesh geometry={geo.glove} material={gloveMat} castShadow />
          </group>
          <group ref={armR} rotation-order="YXZ">
            <mesh geometry={geo.arm} material={colorMat} castShadow />
            <mesh geometry={geo.glove} material={gloveMat} castShadow />
          </group>
        </group>
        <group ref={bar} position={[0, 1.55, 0]}>
          <Billboard>
            <mesh geometry={geo.barBg} material={mat.barBg} />
            <mesh ref={barFill} geometry={geo.bar} material={barMat} position={[-0.3, 0, 0.001]} />
          </Billboard>
        </group>
      </group>
    </group>
  );
}
