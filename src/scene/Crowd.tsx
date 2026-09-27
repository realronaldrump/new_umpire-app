import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { createRng } from '../game/rng'
import { AWAY_TEAM, HOME_TEAM } from '../game/roster'
import type { Quality } from '../store/settings'
import { excitementAt } from './fx'
import { BATTERS_EYE_HALF } from './park'
import { LOWER_BOWL, UPPER_DECK, seatPoint, type Tier } from './Stadium'

const COUNTS: Record<Quality, number> = { low: 1800, med: 5200, high: 9000 }
const FLASHES: Record<Quality, number> = { low: 120, med: 320, high: 600 }

const SHIRTS = [
  HOME_TEAM.primary, HOME_TEAM.primary, HOME_TEAM.primary, '#1c3f63', HOME_TEAM.accent,
  '#e9ebee', '#e9ebee', '#2a2f38', '#2a2f38', '#1a1d23', '#4b5563', '#6b7280',
  '#7a2f3a', '#b8a27a', AWAY_TEAM.accent, AWAY_TEAM.primary,
]
const SKIN = ['#f1c7a5', '#e0ac85', '#c68863', '#9d6a48', '#6f4930', '#4a2f20']

/** One fan: torso + head + (hidden-until-cheering) raised arms, merged. */
function fanGeometry(): THREE.BufferGeometry {
  const parts: Array<[THREE.BufferGeometry, number]> = []
  const torso = new THREE.BoxGeometry(1.45, 2.1, 0.95, 1, 2, 1)
  torso.translate(0, 1.05, 0)
  parts.push([torso, 0])
  const head = new THREE.SphereGeometry(0.44, 8, 6)
  head.translate(0, 2.55, 0)
  parts.push([head, 1])
  for (const side of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.3, 1.6, 0.3)
    arm.translate(side * 0.72, 2.1 + 0.8, 0)
    parts.push([arm, 2])
  }
  const pos: number[] = []
  const nrm: number[] = []
  const part: number[] = []
  for (const [g0, id] of parts) {
    const g = g0.toNonIndexed()
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
      part.push(id)
    }
    g.dispose()
    g0.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1))
  return out
}

interface Seat {
  pos: [number, number, number]
  yaw: number
}

function buildSeats(count: number): Seat[] {
  const rng = createRng('crowd-seats')
  const seats: Seat[] = []
  const pick = (t: Tier) => {
    const phi = t.phi0 + rng.next() * (t.phi1 - t.phi0)
    const row = rng.int(t.rows)
    const pos = seatPoint(t, phi, row, 0.5)
    return { pos, phi }
  }
  let guard = 0
  while (seats.length < count && guard++ < count * 3) {
    const upper = rng.chance(0.38)
    const t = upper ? UPPER_DECK : LOWER_BOWL
    const { pos, phi } = pick(t)
    const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)))
    if (a < BATTERS_EYE_HALF + 0.02) continue
    // Cheap seats behind the dish fill up first; outfield corners thin out.
    if (a < 0.9 && rng.chance(0.25)) continue
    const yaw = Math.atan2(-pos[0], -60 - pos[2]) + Math.PI
    seats.push({ pos, yaw })
  }
  return seats
}

export function Crowd({ quality, night }: { quality: Quality; night: boolean }) {
  const count = COUNTS[quality]
  const seats = useMemo(() => buildSeats(count), [count])
  const geometry = useMemo(() => {
    const g = fanGeometry()
    g.setAttribute('aShirt', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSkin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(count), 1))
    return g
  }, [count])

  const { mesh, material } = useMemo(() => {
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff' })
    const uniforms = { uTime: { value: 0 }, uExcite: { value: 0.1 }, uDim: { value: 1 } }
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aPart;
          attribute vec3 aShirt;
          attribute vec3 aSkin;
          attribute float aSeed;
          uniform float uTime;
          uniform float uExcite;
          varying vec3 vFan;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float fan = step(aSeed, uExcite * 1.1);
          float standing = fan * smoothstep(0.25, 0.55, uExcite);
          float hop = fan * max(0.0, sin(uTime * (6.5 + aSeed * 5.0) + aSeed * 57.0)) * (0.25 + 0.55 * uExcite);
          float idle = sin(uTime * (0.7 + aSeed * 1.1) + aSeed * 31.0) * 0.05;
          if (aPart > 1.5) {
            float armsUp = standing;
            float wave = sin(uTime * (5.0 + aSeed * 3.0) + aSeed * 13.0) * 0.35 * armsUp;
            float k = (transformed.y - 2.1) / 1.6;
            transformed.y = mix(1.7, transformed.y, armsUp);
            transformed.x = mix(transformed.x * 0.6, transformed.x + wave * k, armsUp);
          }
          transformed.y += idle + hop + standing * 0.9;
          vFan = aPart > 0.5 && aPart < 1.5 ? aSkin : aShirt;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFan;\nuniform float uDim;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vFan * uDim;')
    }
    material.customProgramCacheKey = () => 'crowd-fan'
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    mesh.userData.uniforms = uniforms
    return { mesh, material }
  }, [geometry, count])

  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const scale = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const rng = createRng('crowd-colors')
    const shirtAttr = geometry.getAttribute('aShirt') as THREE.InstancedBufferAttribute
    const skinAttr = geometry.getAttribute('aSkin') as THREE.InstancedBufferAttribute
    const seedAttr = geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute
    const shirt = shirtAttr.array as Float32Array
    const skin = skinAttr.array as Float32Array
    const seed = seedAttr.array as Float32Array
    const c = new THREE.Color()
    seats.forEach((seat, i) => {
      q.setFromAxisAngle(up, seat.yaw)
      const s = 0.85 + rng.next() * 0.3
      scale.set(s, s * (0.92 + rng.next() * 0.16), s)
      pos.set(...seat.pos)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(i, m)
      c.set(SHIRTS[rng.int(SHIRTS.length)]).convertSRGBToLinear()
      c.multiplyScalar(0.7 + rng.next() * 0.35)
      shirt.set([c.r, c.g, c.b], i * 3)
      c.set(SKIN[rng.int(SKIN.length)]).convertSRGBToLinear()
      skin.set([c.r, c.g, c.b], i * 3)
      seed[i] = rng.next()
    })
    // Hide any unused instances (count may exceed the seats found).
    m.makeScale(0, 0, 0)
    for (let i = seats.length; i < count; i++) mesh.setMatrixAt(i, m)
    mesh.instanceMatrix.needsUpdate = true
    shirtAttr.needsUpdate = true
    skinAttr.needsUpdate = true
    seedAttr.needsUpdate = true
  }, [seats, mesh, geometry, count])

  useEffect(() => {
    const u = mesh.userData.uniforms as { uDim: { value: number } }
    u.uDim.value = night ? 0.8 : 1
  }, [mesh, night])

  useEffect(() => () => {
    material.dispose()
    mesh.dispose()
    geometry.dispose()
  }, [material, mesh, geometry])

  useFrame((state) => {
    const u = mesh.userData.uniforms as { uTime: { value: number }; uExcite: { value: number } }
    u.uTime.value = state.clock.elapsedTime
    u.uExcite.value = excitementAt(performance.now())
  })

  return (
    <group>
      <primitive object={mesh} />
      <CameraFlashes seats={seats} quality={quality} night={night} />
    </group>
  )
}

const flashVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uExcite;
uniform float uPixelRatio;
varying float vI;
void main() {
  float rate = 0.35 + aSeed * 0.9;
  float ph = fract(uTime * rate + aSeed * 17.0);
  float window = 0.012 + uExcite * uExcite * 0.09;
  float flash = step(ph, window) * (1.0 - ph / max(window, 0.0001));
  // Steady phone screens glow faintly between flashes.
  vI = max(flash, step(0.82, aSeed) * 0.18);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (2.0 + 9.0 * flash) * uPixelRatio * (320.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const flashFragment = /* glsl */ `
varying float vI;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d)) * vI;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a * 2.2, 1.0);
}
`

function CameraFlashes({ seats, quality, night }: { seats: Seat[]; quality: Quality; night: boolean }) {
  const n = FLASHES[quality]
  const { geometry, material } = useMemo(() => {
    const rng = createRng('crowd-flashes')
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const s = seats.length ? seats[rng.int(seats.length)].pos : [0, 20, -430]
      pos[i * 3] = s[0] + rng.range(-0.4, 0.4)
      pos[i * 3 + 1] = s[1] + 2.9
      pos[i * 3 + 2] = s[2]
      seed[i] = rng.next()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: flashVertex,
      fragmentShader: flashFragment,
      uniforms: { uTime: { value: 0 }, uExcite: { value: 0 }, uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material }
  }, [seats, n])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uExcite.value = excitementAt(performance.now())
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
  })
  if (!night) return null
  return <points geometry={geometry} material={material} frustumCulled={false} />
}
