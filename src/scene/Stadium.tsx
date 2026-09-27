import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createRng } from '../game/rng'
import {
  BATTERS_EYE_HALF, DEG, FOUL_ANGLE, polarScene, standRSmooth, wallH, wallR,
} from './park'
import {
  concreteTexture, flareTexture, glowTexture, outfieldWallTexture, ribbonTexture, seatsTexture, windowsTexture,
} from './textures'

/* ---------------------------------------------------------------- layout */

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** How "infield" a bearing is (0 = outfield bleachers, 1 = foul-territory bowl). */
const infieldness = (phi: number) => smooth(40 * DEG, 62 * DEG, Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))))

export interface Tier {
  phi0: number
  phi1: number
  rows: number
  r0: (phi: number) => number
  depth: (phi: number) => number
  y0: (phi: number) => number
  y1: (phi: number) => number
}

export const LOWER_BOWL: Tier = {
  phi0: BATTERS_EYE_HALF + 1 * DEG,
  phi1: Math.PI * 2 - BATTERS_EYE_HALF - 1 * DEG,
  rows: 26,
  r0: (phi) => standRSmooth(phi),
  depth: (phi) => 72 + 34 * infieldness(phi),
  y0: (phi) => 13 - 8 * infieldness(phi),
  y1: (phi) => 50 - 6 * infieldness(phi),
}

export const UPPER_DECK: Tier = {
  phi0: 58 * DEG,
  phi1: Math.PI * 2 - 58 * DEG,
  rows: 22,
  r0: (phi) => standRSmooth(phi) + 80,
  depth: () => 96,
  y0: () => 66,
  y1: () => 124,
}

/** Tread position for (tier, bearing, row index, fraction across the row). */
export function seatPoint(t: Tier, phi: number, row: number, f = 0.55): [number, number, number] {
  const d = t.depth(phi) / t.rows
  const h = (t.y1(phi) - t.y0(phi)) / t.rows
  return polarScene(phi, t.r0(phi) + (row + f) * d, t.y0(phi) + row * h)
}

/* ------------------------------------------------------ geometry builder */

type ProfilePt = { dr: number; y: number; v: number }

/**
 * Sweep a 2-D profile (radial offset from `r0(φ)`, height, texture v) around
 * bearings φ0→φ1. Each profile segment gets its own vertex strip so steps
 * keep crisp normals. u is front-edge arc length / `uScale`.
 */
function sweep(
  phi0: number,
  phi1: number,
  segs: number,
  r0: (phi: number) => number,
  profile: (phi: number) => ProfilePt[],
  uScale: number,
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const phis: number[] = []
  const arc: number[] = [0]
  for (let j = 0; j <= segs; j++) phis.push(phi0 + ((phi1 - phi0) * j) / segs)
  for (let j = 1; j <= segs; j++) {
    const a = polarScene(phis[j - 1], r0(phis[j - 1]), 0)
    const b = polarScene(phis[j], r0(phis[j]), 0)
    arc.push(arc[j - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]))
  }
  const profiles = phis.map((p) => profile(p))
  const nSeg = profiles[0].length - 1
  for (let k = 0; k < nSeg; k++) {
    const base = positions.length / 3
    for (let j = 0; j <= segs; j++) {
      const phi = phis[j]
      const r = r0(phi)
      for (const pt of [profiles[j][k], profiles[j][k + 1]]) {
        const p = polarScene(phi, r + pt.dr, pt.y)
        positions.push(p[0], p[1], p[2])
        uvs.push(arc[j] / uScale, pt.v)
      }
    }
    for (let j = 0; j < segs; j++) {
      const a = base + j * 2
      const b = a + 2
      const c = a + 1
      const d = b + 1
      indices.push(a, b, c, b, d, c)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

const SEAT_TILE_FT = 16 * 1.85

function steppedProfile(t: Tier) {
  return (phi: number): ProfilePt[] => {
    const d = t.depth(phi) / t.rows
    const y0 = t.y0(phi)
    const h = (t.y1(phi) - y0) / t.rows
    const pts: ProfilePt[] = []
    for (let i = 0; i < t.rows; i++) {
      pts.push({ dr: i * d, y: y0 + i * h, v: i })
      pts.push({ dr: (i + 1) * d, y: y0 + i * h, v: i + 0.78 })
    }
    pts.push({ dr: t.depth(phi), y: y0 + t.rows * h, v: t.rows })
    return pts
  }
}

/* ------------------------------------------------------------- materials */

function useStandMaterials(night: boolean) {
  return useMemo(() => {
    const seats = new THREE.MeshStandardMaterial({ map: seatsTexture(), roughness: 0.85 })
    const concrete = concreteTexture().clone()
    concrete.repeat.set(0.05, 0.05)
    concrete.needsUpdate = true
    const shell = new THREE.MeshStandardMaterial({
      map: concrete, color: night ? '#6c7686' : '#9aa5b5', roughness: 0.95,
    })
    const dark = new THREE.MeshStandardMaterial({ color: '#141a24', roughness: 0.9 })
    const pad = new THREE.MeshStandardMaterial({ color: '#16304a', roughness: 0.85 })
    const ribbon = new THREE.MeshBasicMaterial({ map: ribbonTexture(), toneMapped: false })
    ribbon.color.setScalar(night ? 1.25 : 1)
    const wall = new THREE.MeshStandardMaterial({ map: outfieldWallTexture(), roughness: 0.85 })
    const soffit = new THREE.MeshStandardMaterial({ color: '#0c1119', roughness: 1 })
    const roof = new THREE.MeshStandardMaterial({ color: '#d9dee6', roughness: 0.55, metalness: 0.35 })
    return { seats, shell, dark, pad, ribbon, wall, soffit, roof }
  }, [night])
}

/* ------------------------------------------------------------ components */

function Bowl({ night }: { night: boolean }) {
  const m = useStandMaterials(night)
  const geo = useMemo(() => {
    const L = LOWER_BOWL
    const U = UPPER_DECK
    const lowerSteps = sweep(L.phi0, L.phi1, 260, L.r0, steppedProfile(L), SEAT_TILE_FT)
    // Low padded wall in front of the first row (the fence covers it in the outfield).
    const lowerFront = sweep(L.phi0, L.phi1, 260, L.r0, (phi) => [
      { dr: 0, y: 0, v: 0 }, { dr: 0, y: L.y0(phi), v: 1 },
    ], 60)
    const lowerBack = sweep(L.phi0, L.phi1, 200, L.r0, (phi) => [
      { dr: L.depth(phi), y: L.y1(phi) + 8, v: 1 }, { dr: L.depth(phi), y: 0, v: 0 },
    ], 60)
    const lowerRail = sweep(L.phi0, L.phi1, 200, L.r0, (phi) => [
      { dr: L.depth(phi), y: L.y1(phi), v: 0 }, { dr: L.depth(phi), y: L.y1(phi) + 8, v: 1 },
    ], 60)

    const upperSteps = sweep(U.phi0, U.phi1, 220, U.r0, steppedProfile(U), SEAT_TILE_FT)
    const fascia = sweep(U.phi0, U.phi1, 220, U.r0, () => [
      { dr: 0, y: U.y0(0) - 11, v: 0 }, { dr: 0, y: U.y0(0) - 1, v: 1 },
    ], 320)
    const fasciaCap = sweep(U.phi0, U.phi1, 220, U.r0, () => [
      { dr: 0, y: U.y0(0) - 1, v: 0 }, { dr: 0, y: U.y0(0), v: 1 },
    ], 60)
    const soffit = sweep(U.phi0, U.phi1, 160, U.r0, () => [
      { dr: 46, y: U.y0(0) - 11, v: 1 }, { dr: 0, y: U.y0(0) - 11, v: 0 },
    ], 60)
    const upperBack = sweep(U.phi0, U.phi1, 160, U.r0, () => [
      { dr: U.depth(0), y: U.y1(0) + 10, v: 1 }, { dr: U.depth(0), y: 20, v: 0 },
    ], 60)
    const upperRail = sweep(U.phi0, U.phi1, 160, U.r0, () => [
      { dr: U.depth(0), y: U.y1(0), v: 0 }, { dr: U.depth(0), y: U.y1(0) + 10, v: 1 },
    ], 60)
    // Cantilevered roof over the upper deck (ends are set in a touch).
    const roof = sweep(U.phi0 + 5 * DEG, U.phi1 - 5 * DEG, 160, U.r0, () => [
      { dr: 150, y: 150, v: 0 }, { dr: 64, y: 146, v: 1 },
    ], 60)
    const roofUnder = sweep(U.phi0 + 5 * DEG, U.phi1 - 5 * DEG, 160, U.r0, () => [
      { dr: 64, y: 145, v: 1 }, { dr: 150, y: 149, v: 0 },
    ], 60)
    return { lowerSteps, lowerFront, lowerBack, lowerRail, upperSteps, fascia, fasciaCap, soffit, upperBack, upperRail, roof, roofUnder }
  }, [])

  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  // Foul-territory LED boards along the low wall.
  const sideBoards = useMemo(() => {
    const make = (a0: number, a1: number) => sweep(a0, a1, 80, LOWER_BOWL.r0, () => [
      { dr: -0.05, y: 1.2, v: 0 }, { dr: -0.05, y: 4.4, v: 1 },
    ], 102)
    return [make(58 * DEG, 150 * DEG), make(210 * DEG, 302 * DEG)]
  }, [])
  useEffect(() => () => sideBoards.forEach((g) => g.dispose()), [sideBoards])

  const ribbonTex = m.ribbon.map
  useFrame((_, dt) => {
    if (ribbonTex) ribbonTex.offset.x = (ribbonTex.offset.x + dt * 0.035) % 1
  })

  return (
    <group>
      <mesh geometry={geo.lowerSteps} material={m.seats} receiveShadow />
      <mesh geometry={geo.lowerFront} material={m.pad} receiveShadow />
      <mesh geometry={geo.lowerBack} material={m.shell} />
      <mesh geometry={geo.lowerRail} material={m.dark} />
      <mesh geometry={geo.upperSteps} material={m.seats} />
      <mesh geometry={geo.fascia} material={m.ribbon} />
      <mesh geometry={geo.fasciaCap} material={m.dark} />
      <mesh geometry={geo.soffit} material={m.soffit} />
      <mesh geometry={geo.upperBack} material={m.shell} />
      <mesh geometry={geo.upperRail} material={m.dark} />
      <mesh geometry={geo.roof} material={m.roof} />
      <mesh geometry={geo.roofUnder} material={m.soffit} />
      {sideBoards.map((g, i) => <mesh key={i} geometry={g} material={m.ribbon} />)}
    </group>
  )
}

function OutfieldFence() {
  const { fence, cap, back } = useMemo(() => {
    const a0 = -FOUL_ANGLE - 2 * DEG
    const a1 = FOUL_ANGLE + 2 * DEG
    const span = a1 - a0
    const build = (profile: (phi: number) => ProfilePt[]) => {
      const g = sweep(a0, a1, 180, wallR, profile, 1)
      // Re-map u to 0..1 pole-to-pole so the painted markers land correctly.
      const pos = g.getAttribute('position')
      const uv = g.getAttribute('uv')
      for (let i = 0; i < pos.count; i++) {
        const phi = Math.atan2(pos.getX(i), -pos.getZ(i))
        uv.setX(i, (phi - a0) / span)
      }
      return g
    }
    return {
      fence: build((phi) => [{ dr: 0, y: 0, v: 0 }, { dr: 0, y: wallH(phi), v: 1 }]),
      cap: build((phi) => [{ dr: 0, y: wallH(phi), v: 0 }, { dr: 1.2, y: wallH(phi), v: 1 }]),
      back: build((phi) => [{ dr: 1.2, y: wallH(phi), v: 1 }, { dr: 1.2, y: 0, v: 0 }]),
    }
  }, [])
  useEffect(() => () => { fence.dispose(); cap.dispose(); back.dispose() }, [fence, cap, back])
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ map: outfieldWallTexture(), roughness: 0.8 }), [])
  return (
    <group>
      <mesh geometry={fence} material={wallMat} receiveShadow />
      <mesh geometry={cap}>
        <meshStandardMaterial color="#f2cf2e" roughness={0.5} emissive="#f2cf2e" emissiveIntensity={0.12} />
      </mesh>
      <mesh geometry={back}>
        <meshStandardMaterial color="#12251c" roughness={1} />
      </mesh>
    </group>
  )
}

function BattersEye() {
  const r = wallR(0) + 24
  return (
    <group>
      <mesh position={polarScene(0, r + 22, 0)} rotation={[-0.32, 0, 0]}>
        <boxGeometry args={[150, 96, 40]} />
        <meshStandardMaterial color="#0d1f16" roughness={1} />
      </mesh>
      {/* Planted berm in front */}
      <mesh position={polarScene(0, r - 4, 3)} rotation={[-Math.PI / 2 + 0.25, 0, 0]}>
        <planeGeometry args={[140, 24]} />
        <meshStandardMaterial color="#1f3d22" roughness={1} />
      </mesh>
    </group>
  )
}

/** Light bank heads: a grid of lamps, a hot flare and (at night) a beam. */
function LightBank({
  position, target, night, lamps = [4, 10], scale = 1,
}: {
  position: [number, number, number]
  target: [number, number, number]
  night: boolean
  lamps?: [number, number]
  scale?: number
}) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    ref.current?.lookAt(...target)
  }, [target])
  const [rows, cols] = lamps
  const w = cols * 2.6 * scale
  const h = rows * 2.6 * scale
  const lampGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2 * scale, 2 * scale)
    const merged: number[] = []
    const idx: number[] = []
    const uv: number[] = []
    const pos = g.getAttribute('position')
    const gi = g.getIndex()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const base = merged.length / 3
        const ox = (c - (cols - 1) / 2) * 2.6 * scale
        const oy = (r - (rows - 1) / 2) * 2.6 * scale
        for (let i = 0; i < pos.count; i++) {
          merged.push(pos.getX(i) + ox, pos.getY(i) + oy, 0.7)
          uv.push(0, 0)
        }
        if (gi) for (let i = 0; i < gi.count; i++) idx.push(base + gi.getX(i))
      }
    }
    g.dispose()
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.Float32BufferAttribute(merged, 3))
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    out.setIndex(idx)
    return out
  }, [rows, cols, scale])
  useEffect(() => () => lampGeo.dispose(), [lampGeo])

  return (
    <group position={position}>
      <group ref={ref}>
        <mesh>
          <boxGeometry args={[w + 3, h + 3, 1.2]} />
          <meshStandardMaterial color="#1b212b" roughness={0.7} metalness={0.4} />
        </mesh>
        <mesh geometry={lampGeo}>
          <meshBasicMaterial color={night ? '#fff6e2' : '#c9d2de'} toneMapped={false} />
        </mesh>
        {night && (
          <>
            <sprite position={[0, 0, 4]} scale={[w * 3.2, w * 3.2, 1]}>
              <spriteMaterial map={flareTexture()} color="#fff1d6" blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.9} toneMapped={false} fog={false} />
            </sprite>
            <sprite position={[0, 0, 6]} scale={[w * 1.2, h * 1.6, 1]}>
              <spriteMaterial map={glowTexture()} color="#ffe9c4" blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.75} toneMapped={false} fog={false} />
            </sprite>
          </>
        )}
      </group>
    </group>
  )
}

const beamVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`
const beamFragment = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  float along = 1.0 - vUv.y;               // 0 at the lamp → 1 at the field
  float fade = pow(1.0 - along, 1.4);
  float rim = abs(dot(normalize(-vViewPos), vNormalV));
  float a = uOpacity * fade * pow(rim, 1.6);
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, 1.0);
}
`

/** Soft volumetric-looking beam from a light bank toward the infield. */
function Beam({ from, to, radius }: { from: [number, number, number]; to: [number, number, number]; radius: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize())
    return { position: a.clone().lerp(b, 0.5), quaternion: q, length: len }
  }, [from, to])
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uOpacity: { value: 0.07 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh position={position} quaternion={quaternion} material={material} renderOrder={5}>
      <cylinderGeometry args={[radius * 0.12, radius, length, 24, 1, true]} />
    </mesh>
  )
}

function Lights({ night }: { night: boolean }) {
  const banks = useMemo(() => {
    const list: Array<{ pos: [number, number, number]; aim: [number, number, number]; lamps: [number, number]; scale: number; beam: boolean }> = []
    // Roof-rim banks over the upper deck.
    for (const deg of [-150, -122, -94, -70, 70, 94, 122, 150]) {
      const phi = deg * DEG
      const r = UPPER_DECK.r0(phi) + 70
      list.push({ pos: polarScene(phi, r, 152), aim: [0, 0, -60], lamps: [3, 9], scale: 1, beam: Math.abs(deg) < 100 })
    }
    // Outfield towers.
    for (const deg of [-36, 36]) {
      const phi = deg * DEG
      list.push({ pos: polarScene(phi, LOWER_BOWL.r0(phi) + LOWER_BOWL.depth(phi) + 30, 165), aim: [0, 0, -40], lamps: [5, 8], scale: 1.2, beam: true })
    }
    return list
  }, [])
  const towers = [-36, 36].map((deg) => {
    const phi = deg * DEG
    return polarScene(phi, LOWER_BOWL.r0(phi) + LOWER_BOWL.depth(phi) + 30, 0)
  })
  return (
    <group>
      {towers.map((p, i) => (
        <mesh key={i} position={[p[0], 80, p[2]]}>
          <cylinderGeometry args={[2.2, 3.6, 160, 10]} />
          <meshStandardMaterial color="#2a313d" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      {banks.map((b, i) => (
        <LightBank key={i} position={b.pos} target={b.aim} night={night} lamps={b.lamps} scale={b.scale} />
      ))}
      {night && banks.filter((b) => b.beam).map((b, i) => (
        <Beam key={i} from={b.pos} to={[b.pos[0] * 0.3, 0, -60 + (b.pos[2] + 60) * 0.3]} radius={70} />
      ))}
    </group>
  )
}

/** Distant downtown beyond the outfield: one merged mesh, emissive windows at night. */
function Skyline({ night }: { night: boolean }) {
  const geometry = useMemo(() => {
    const rng = createRng('skyline')
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 64; i++) {
      const phi = rng.range(-80, 80) * DEG
      const r = rng.range(1500, 2300)
      const w = rng.range(50, 140)
      const d = rng.range(50, 110)
      const h = Math.abs(phi) < 30 * DEG ? rng.range(80, 340) : rng.range(40, 170)
      const g = new THREE.BoxGeometry(w, h, d)
      const uv = g.getAttribute('uv')
      const nrm = g.getAttribute('normal')
      for (let k = 0; k < uv.count; k++) {
        const side = Math.abs(nrm.getX(k)) > 0.5 ? d : w
        const top = Math.abs(nrm.getY(k)) > 0.5
        uv.setXY(k, top ? 0 : uv.getX(k) * side / 25, top ? 0 : uv.getY(k) * h / 50)
      }
      const p = polarScene(phi, r, h / 2)
      g.rotateY(-phi)
      g.translate(p[0], p[1], p[2])
      parts.push(g)
      // Rooftop mast on the tall ones.
      if (h > 280) {
        const mast = new THREE.CylinderGeometry(0.8, 1.4, 60, 6)
        mast.translate(p[0], h + 30, p[2])
        const muv = mast.getAttribute('uv')
        for (let k = 0; k < muv.count; k++) muv.setXY(k, 0, 0)
        parts.push(mast)
      }
    }
    const merged = mergeGeometries(parts)
    parts.forEach((g) => g.dispose())
    return merged
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const tex = windowsTexture()
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={night ? '#0d121b' : '#8d98a8'}
        roughness={0.8}
        metalness={0.2}
        emissiveMap={tex}
        emissive={night ? '#ffffff' : '#000000'}
        emissiveIntensity={night ? 0.55 : 0}
        map={night ? null : tex}
      />
    </mesh>
  )
}

/** Minimal non-indexed merge (position/normal/uv) for static props. */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    const u = g.getAttribute('uv')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
      uv.push(u.getX(i), u.getY(i))
    }
    if (g !== g0) g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return out
}

/** Flag poles over the batter's eye: a little motion in the skyline. */
function Flags() {
  const geo = useMemo(() => new THREE.PlaneGeometry(14, 8, 12, 4), [])
  const base = useMemo(() => Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>), [geo])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3] + 7
      pos.setZ(i, Math.sin(x * 0.45 - t * 4.2) * x * 0.09 + Math.sin(t * 2.3 + x) * 0.2)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  })
  useEffect(() => () => geo.dispose(), [geo])
  const spots = [-5, 0, 5].map((deg) => polarScene(deg * DEG, wallR(0) + 48, 0))
  const colors = ['#b22234', '#123b5c', '#3fd9c4']
  return (
    <group>
      {spots.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 55, 0]}>
            <cylinderGeometry args={[0.35, 0.5, 110, 6]} />
            <meshStandardMaterial color="#c9ced6" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh geometry={geo} position={[7, 104, 0]}>
            <meshStandardMaterial color={colors[i]} roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Stadium({ night }: { night: boolean }) {
  return (
    <group>
      <Bowl night={night} />
      <OutfieldFence />
      <BattersEye />
      <Flags />
      <Lights night={night} />
      <Skyline night={night} />
    </group>
  )
}
