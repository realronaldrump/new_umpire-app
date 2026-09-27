import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { posAt } from '../game/physics'
import { createRng } from '../game/rng'
import { HOME_TEAM } from '../game/roster'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { pulseId } from './fx'
import { DEG, polarScene } from './park'
import { glowTexture } from './textures'

const vertex = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const fragAdditive = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * a, 1.0);
}
`
const fragSoft = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`

interface Pool {
  n: number
  pos: Float32Array
  vel: Float32Array
  col: Float32Array
  size: Float32Array
  life: Float32Array
  maxLife: Float32Array
  grow: Float32Array
  drag: number
  gravity: number
  next: number
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  base: Float32Array
}

function makePool(n: number, additive: boolean, drag: number, gravity: number): Pool {
  const geometry = new THREE.BufferGeometry()
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 4)
  const size = new Float32Array(n)
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: additive ? fragAdditive : fragSoft,
    uniforms: { uMap: { value: glowTexture() }, uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  return {
    n, pos, col, size, drag, gravity, geometry, material, next: 0,
    vel: new Float32Array(n * 3),
    life: new Float32Array(n),
    maxLife: new Float32Array(n).fill(1),
    grow: new Float32Array(n),
    base: new Float32Array(n * 4),
  }
}

function spawn(
  p: Pool,
  at: THREE.Vector3,
  v: THREE.Vector3,
  color: THREE.Color,
  alpha: number,
  size: number,
  life: number,
  grow = 0,
): void {
  const i = p.next
  p.next = (p.next + 1) % p.n
  p.pos.set([at.x, at.y, at.z], i * 3)
  p.vel.set([v.x, v.y, v.z], i * 3)
  p.base.set([color.r, color.g, color.b, alpha], i * 4)
  p.size[i] = size
  p.grow[i] = grow
  p.life[i] = life
  p.maxLife[i] = life
}

function step(p: Pool, dt: number, twinkle: boolean, t: number): void {
  const damp = Math.exp(-p.drag * dt)
  for (let i = 0; i < p.n; i++) {
    if (p.life[i] <= 0) {
      p.col[i * 4 + 3] = 0
      continue
    }
    p.life[i] -= dt
    const k = i * 3
    p.vel[k] *= damp
    p.vel[k + 1] = p.vel[k + 1] * damp - p.gravity * dt
    p.vel[k + 2] *= damp
    p.pos[k] += p.vel[k] * dt
    p.pos[k + 1] += p.vel[k + 1] * dt
    p.pos[k + 2] += p.vel[k + 2] * dt
    const f = Math.max(0, p.life[i] / p.maxLife[i])
    const tw = twinkle && f < 0.45 ? (Math.sin(t * 40 + i) > 0 ? 1 : 0.25) : 1
    p.col[i * 4] = p.base[i * 4]
    p.col[i * 4 + 1] = p.base[i * 4 + 1]
    p.col[i * 4 + 2] = p.base[i * 4 + 2]
    p.col[i * 4 + 3] = p.base[i * 4 + 3] * Math.min(1, f * 1.6) * tw
    p.size[i] = Math.max(0, p.size[i] + p.grow[i] * dt)
  }
  p.geometry.getAttribute('position').needsUpdate = true
  p.geometry.getAttribute('aColor').needsUpdate = true
  p.geometry.getAttribute('aSize').needsUpdate = true
}

const FIREWORK_COLORS = ['#f5b942', '#ffffff', HOME_TEAM.accent, '#ff5a6e', '#8fb8ff', '#ffe28a']

export function Particles() {
  const sparks = useMemo(() => makePool(3200, true, 1.1, 22), [])
  const dust = useMemo(() => makePool(220, false, 2.4, -1.2), [])
  const rng = useMemo(() => createRng('fx-particles'), [])
  const seen = useRef({ mitt: 0, walkoff: 0, homer: 0, landing: -1 })
  const shows = useRef<Array<{ at: number; phi: number; h: number; color: string }>>([])
  const tmpV = useMemo(() => new THREE.Vector3(), [])
  const tmpP = useMemo(() => new THREE.Vector3(), [])
  const tmpC = useMemo(() => new THREE.Color(), [])

  useEffect(() => () => {
    for (const p of [sparks, dust]) {
      p.geometry.dispose()
      p.material.dispose()
    }
  }, [sparks, dust])

  const schedule = (bursts: number, over: number) => {
    const now = performance.now()
    for (let i = 0; i < bursts; i++) {
      shows.current.push({
        at: now + 300 + (i / bursts) * over + rng.range(0, 260),
        phi: rng.range(-42, 42) * DEG,
        h: rng.range(170, 300),
        color: FIREWORK_COLORS[rng.int(FIREWORK_COLORS.length)],
      })
    }
  }

  useFrame((state, dt0) => {
    const dt = Math.min(0.05, dt0)
    const now = performance.now()
    const g = useGame.getState()
    const pr = state.gl.getPixelRatio()
    sparks.material.uniforms.uScale.value = 520 * pr * (state.size.height / 800)
    dust.material.uniforms.uScale.value = 520 * pr * (state.size.height / 800)

    // Pulses → emitters.
    const mittId = pulseId('mitt')
    if (mittId !== seen.current.mitt) {
      seen.current.mitt = mittId
      const a = g.active
      if (a) {
        const c = posAt(a.pitch.traj, a.pitch.traj.catchT)
        const fx = a.plan.swings ? 0 : a.framing.x
        const fz = a.plan.swings ? 0 : a.framing.z
        tmpP.set(c.x + fx, c.z + fz, -c.y)
        tmpC.set('#d9c3a4')
        for (let i = 0; i < 8; i++) {
          tmpV.set(rng.range(-0.8, 0.8), rng.range(0.2, 1.0), rng.range(-0.8, 0.4))
          spawn(dust, tmpP, tmpV, tmpC, 0.1, rng.range(0.1, 0.2), rng.range(0.5, 0.9), 0.35)
        }
      }
    }
    const walkoffId = pulseId('walkoff')
    if (walkoffId !== seen.current.walkoff) {
      seen.current.walkoff = walkoffId
      schedule(16, 7000)
    }
    const homerId = pulseId('homer')
    if (homerId !== seen.current.homer) {
      seen.current.homer = homerId
      schedule(6, 3000)
    }

    // Batted ball lands: kick up dirt/grass.
    const a = g.active
    if (g.phase === 'swingResult' && a?.hitTraj && a.hitStartMs) {
      const ht = (now - a.hitStartMs) / 1000
      if (ht >= a.hitTraj.T && seen.current.landing !== a.pitch.id) {
        seen.current.landing = a.pitch.id
        const land = posAt(a.hitTraj, a.hitTraj.T)
        if (land.z < 3 && Math.hypot(land.x, land.y) < 390) {
          tmpP.set(land.x, 0.3, -land.y)
          tmpC.set(Math.abs(land.x) < 95 && land.y < 150 ? '#b98a5e' : '#9fb58a')
          for (let i = 0; i < 18; i++) {
            tmpV.set(rng.range(-4, 4), rng.range(1, 6), rng.range(-4, 4))
            spawn(dust, tmpP, tmpV, tmpC, 0.4, rng.range(0.8, 1.6), rng.range(0.7, 1.3), 3)
          }
        }
      }
    }

    // Fireworks: launch trail, then the burst.
    const night = useSettings.getState().nightGame
    shows.current = shows.current.filter((s) => {
      if (now < s.at) return true
      const center = new THREE.Vector3(...polarScene(s.phi, 470, s.h))
      tmpC.set(s.color)
      const count = night ? 150 : 90
      const speed = rng.range(48, 72)
      for (let i = 0; i < count; i++) {
        const u = rng.next() * 2 - 1
        const th = rng.next() * Math.PI * 2
        const rr = Math.sqrt(1 - u * u)
        tmpV.set(rr * Math.cos(th), u, rr * Math.sin(th)).multiplyScalar(speed * rng.range(0.85, 1.05))
        spawn(sparks, center, tmpV, tmpC, night ? 1.6 : 1.1, rng.range(9, 14), rng.range(1.6, 2.4))
      }
      // Hot white core flash.
      tmpC.set('#ffffff')
      spawn(sparks, center, tmpV.set(0, 0, 0), tmpC, 3, 90, 0.25, -200)
      return false
    })

    step(sparks, dt, true, state.clock.elapsedTime)
    step(dust, dt, false, state.clock.elapsedTime)
  })

  return (
    <group>
      <points geometry={sparks.geometry} material={sparks.material} frustumCulled={false} renderOrder={6} />
      <points geometry={dust.geometry} material={dust.material} frustumCulled={false} renderOrder={6} />
    </group>
  )
}
