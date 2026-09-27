import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Bases } from '../game/engine'
import { clamp } from '../game/rng'
import { AWAY_TEAM, HOME_TEAM } from '../game/roster'
import { ballStateAt, useGame } from '../store/game'
import { S } from './coords'
import { FIELDER_SPOTS, FIRST_BASE, SECOND_BASE, THIRD_BASE } from './park'

/* A compact jointed ballplayer for everyone who isn't the batter, catcher or
 * pitcher. Poses are procedural: stance width, crouch, lean, run cycle and
 * where the hands go are all solved per frame with two-bone IK. */

const UP = new THREE.Vector3(0, 1, 0)
const _d = new THREE.Vector3()
const _p = new THREE.Vector3()

function ik(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3): void {
  _d.copy(target).sub(root)
  const dist = clamp(_d.length(), Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.01)
  _d.normalize()
  end.copy(root).addScaledVector(_d, dist)
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0.0004, l1 * l1 - a * a))
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1)
  _p.normalize()
  mid.copy(root).addScaledVector(_d, a).addScaledVector(_p, h)
}

function bone(mesh: THREE.Object3D | null, a: THREE.Vector3, b: THREE.Vector3): void {
  if (!mesh) return
  mesh.position.copy(a).lerp(b, 0.5)
  _d.copy(b).sub(a).normalize()
  mesh.quaternion.setFromUnitVectors(UP, _d)
}

export interface Pose {
  /** 0 standing tall … 1 deep athletic crouch. */
  crouch: number
  /** Forward torso lean (rad). */
  lean: number
  /** Run cycle phase (rad) and amount 0..1. */
  run: number
  runAmt: number
  /** Hands: 0 at sides, 1 out in front (ready), 2 on knees. */
  hands: number
  /** Body yaw in world (rad, 0 = facing home). */
  yaw: number
  /** Extra head yaw relative to the body. */
  look: number
}

interface FigureProps {
  jersey: string
  pants: string
  accent: string
  helmet?: boolean
  glove?: boolean
  skin?: string
  pose: (now: number, dt: number, out: Pose, root: THREE.Group) => void
}

const L_THIGH = 1.45
const L_SHIN = 1.4
const L_UPPER = 0.95
const L_FORE = 0.95

export function Figure({ jersey, pants, accent, helmet = false, glove = false, skin = '#b98a68', pose }: FigureProps) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const parts = useRef<Record<string, THREE.Object3D | null>>({})
  const state = useRef<Pose>({ crouch: 0, lean: 0, run: 0, runAmt: 0, hands: 0, yaw: 0, look: 0 })
  const tmp = useMemo(() => ({
    hip: new THREE.Vector3(), foot: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(),
    sh: new THREE.Vector3(), hand: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
    pole: new THREE.Vector3(),
  }), [])

  useFrame((_, dt) => {
    const g = root.current
    const t = torso.current
    const h = head.current
    if (!g || !t || !h) return
    const now = performance.now()
    const p = state.current
    pose(now, Math.min(0.05, dt), p, g)

    g.rotation.y = p.yaw
    const hipY = 3.05 - p.crouch * 0.75 - p.runAmt * 0.12 + Math.abs(Math.sin(p.run)) * 0.12 * p.runAmt
    const stance = 0.5 + p.crouch * 0.45 - p.runAmt * 0.25

    // Legs.
    for (const side of [-1, 1] as const) {
      const key = side < 0 ? 'L' : 'R'
      tmp.hip.set(side * 0.27, hipY, 0)
      const stride = Math.sin(p.run + (side < 0 ? 0 : Math.PI)) * 1.3 * p.runAmt
      const lift = Math.max(0, Math.cos(p.run + (side < 0 ? 0 : Math.PI))) * 0.7 * p.runAmt
      tmp.foot.set(side * stance, 0.18 + lift, stride + p.crouch * 0.1)
      tmp.pole.set(side * 0.25, 0, 1)
      ik(tmp.hip, tmp.foot, L_THIGH, L_SHIN, tmp.pole, tmp.knee, tmp.ankle)
      bone(parts.current[`thigh${key}`], tmp.hip, tmp.knee)
      bone(parts.current[`shin${key}`], tmp.knee, tmp.ankle)
      const shoe = parts.current[`shoe${key}`]
      if (shoe) shoe.position.set(tmp.ankle.x, tmp.ankle.y - 0.08, tmp.ankle.z + 0.18)
    }

    // Torso.
    t.position.set(0, hipY, 0)
    t.rotation.set(p.lean + p.crouch * 0.35 + p.runAmt * 0.3, 0, 0)
    t.updateMatrix()
    h.rotation.set(-p.lean * 0.6 - p.crouch * 0.3, p.look, 0)

    // Arms, in torso space.
    for (const side of [-1, 1] as const) {
      const key = side < 0 ? 'L' : 'R'
      tmp.sh.set(side * 0.58, 1.95, 0)
      const swing = Math.sin(p.run + (side < 0 ? Math.PI : 0)) * 0.9 * p.runAmt
      if (p.hands >= 1.5) {
        // Hands on knees (between pitches).
        tmp.hand.set(side * 0.45, -0.7 + (2 - p.hands) * 0.4, 0.75)
      } else {
        const k = p.hands
        tmp.hand.set(
          side * (0.72 - 0.34 * k),
          0.45 + 0.35 * k + Math.abs(swing) * 0.3,
          0.12 + 1.0 * k + swing,
        )
      }
      tmp.pole.set(side * 1, -0.4, -0.6)
      ik(tmp.sh, tmp.hand, L_UPPER, L_FORE, tmp.pole, tmp.elbow, tmp.wrist)
      bone(parts.current[`upper${key}`], tmp.sh, tmp.elbow)
      bone(parts.current[`fore${key}`], tmp.elbow, tmp.wrist)
      const hand = parts.current[`hand${key}`]
      if (hand) hand.position.copy(tmp.wrist)
    }
  })

  const set = (k: string) => (o: THREE.Object3D | null) => { parts.current[k] = o }
  const cloth = (color: string) => <meshStandardMaterial color={color} roughness={0.78} />

  return (
    <group ref={root}>
      {(['L', 'R'] as const).map((k) => (
        <group key={k}>
          <mesh ref={set(`thigh${k}`)} castShadow>
            <capsuleGeometry args={[0.22, L_THIGH - 0.3, 4, 8]} />
            {cloth(pants)}
          </mesh>
          <mesh ref={set(`shin${k}`)} castShadow>
            <capsuleGeometry args={[0.17, L_SHIN - 0.26, 4, 8]} />
            {cloth(jersey)}
          </mesh>
          <mesh ref={set(`shoe${k}`)} castShadow>
            <boxGeometry args={[0.32, 0.2, 0.7]} />
            <meshStandardMaterial color="#111318" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <group ref={torso}>
        <mesh position={[0, 0.1, 0]} scale={[1, 0.6, 0.8]} castShadow>
          <sphereGeometry args={[0.48, 12, 8]} />
          {cloth(pants)}
        </mesh>
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.12, 14]} />
          <meshStandardMaterial color="#16191f" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.15, 0]} scale={[1, 1, 0.72]} castShadow>
          <capsuleGeometry args={[0.52, 1.05, 4, 12]} />
          {cloth(jersey)}
        </mesh>
        <mesh position={[0, 1.2, 0.37]}>
          <boxGeometry args={[0.05, 1.2, 0.02]} />
          <meshStandardMaterial color={accent} roughness={0.6} />
        </mesh>
        <group ref={head} position={[0, 2.35, 0]}>
          <mesh position={[0, 0.28, 0]} castShadow>
            <sphereGeometry args={[0.3, 14, 10]} />
            <meshStandardMaterial color={skin} roughness={0.7} />
          </mesh>
          {helmet ? (
            <mesh position={[0, 0.38, 0]}>
              <sphereGeometry args={[0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
              <meshStandardMaterial color={jersey} roughness={0.25} metalness={0.2} />
            </mesh>
          ) : (
            <>
              <mesh position={[0, 0.42, 0]}>
                <sphereGeometry args={[0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                <meshStandardMaterial color={jersey} roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.42, 0.3]} scale={[1, 0.14, 0.9]}>
                <sphereGeometry args={[0.3, 12, 6]} />
                <meshStandardMaterial color={jersey} roughness={0.55} />
              </mesh>
            </>
          )}
        </group>
        {(['L', 'R'] as const).map((k) => (
          <group key={k}>
            <mesh ref={set(`upper${k}`)} castShadow>
              <capsuleGeometry args={[0.15, L_UPPER - 0.2, 4, 8]} />
              {cloth(jersey)}
            </mesh>
            <mesh ref={set(`fore${k}`)} castShadow>
              <capsuleGeometry args={[0.12, L_FORE - 0.18, 4, 8]} />
              <meshStandardMaterial color={skin} roughness={0.7} />
            </mesh>
            <group ref={set(`hand${k}`)}>
              {glove && k === 'L' ? (
                <mesh scale={[1, 1.1, 0.6]} castShadow>
                  <sphereGeometry args={[0.3, 12, 8]} />
                  <meshStandardMaterial color="#7a4a22" roughness={0.8} />
                </mesh>
              ) : (
                <mesh>
                  <sphereGeometry args={[0.13, 8, 6]} />
                  <meshStandardMaterial color={skin} roughness={0.7} />
                </mesh>
              )}
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------- helpers */

const livePitch = (phase: string) => phase === 'windup' || phase === 'flight'
const approach = (v: number, target: number, rate: number, dt: number) => v + (target - v) * Math.min(1, rate * dt)
const yawToward = (fromX: number, fromZ: number, toX: number, toZ: number) => Math.atan2(toX - fromX, toZ - fromZ)
const _ball = new THREE.Vector3()

/* ------------------------------------------------------------- fielders */

function Fielder({ x, y, seed }: { x: number; y: number; seed: number }) {
  const home = S(x, y, 0)
  const faceHome = yawToward(home[0], home[2], 0, 0)
  const pose = (now: number, dt: number, out: Pose, root: THREE.Group) => {
    const g = useGame.getState()
    const ready = livePitch(g.phase) || g.phase === 'swingResult'
    const inPlay = g.phase === 'swingResult' && g.active?.hitTraj
    out.crouch = approach(out.crouch, ready ? 0.85 : 0.1, ready ? 7 : 2.5, dt)
    out.hands = approach(out.hands, ready ? 1 : (Math.sin(now / 2400 + seed) > 0.4 ? 2 : 0.2), 5, dt)
    out.lean = approach(out.lean, ready ? 0.12 : 0.02, 4, dt)
    out.look = 0
    const wx = home[0] + root.position.x
    const wz = home[2] + root.position.z
    let yaw = faceHome + Math.sin(now / 3100 + seed * 3) * 0.08
    let chasing = false
    if (inPlay) {
      const b = ballStateAt(now)
      if (b?.visible) {
        const bp = S(b.pos.x, b.pos.y, b.pos.z)
        yaw = yawToward(wx, wz, bp[0], bp[2])
        chasing = Math.hypot(bp[0] - wx, bp[2] - wz) > 20
      }
    }
    out.runAmt = approach(out.runAmt, chasing ? 0.75 : 0, chasing ? 4 : 6, dt)
    out.run += dt * 11 * out.runAmt
    out.yaw = approach(out.yaw, yaw, 5, dt)
    if (chasing) {
      root.position.x += Math.sin(out.yaw) * dt * 16 * out.runAmt
      root.position.z += Math.cos(out.yaw) * dt * 16 * out.runAmt
    } else if (!inPlay) {
      // Jog back to the spot between plays.
      root.position.lerp(_ball.set(0, 0, 0), Math.min(1, dt * 0.8))
    }
  }
  return (
    <group position={home}>
      <Figure jersey={AWAY_TEAM.primary} pants="#cfd3da" accent={AWAY_TEAM.accent} glove pose={pose} />
    </group>
  )
}

/* ---------------------------------------------------------- base runners */

const BASE_PTS = [
  { x: 0, y: 0 }, FIRST_BASE, SECOND_BASE, THIRD_BASE, { x: 0, y: 0 },
]

/** Game-coord point along the base paths, p ∈ [0, 4] (0/4 = home). */
function pathPoint(p: number): { x: number; y: number } {
  const i = Math.min(3, Math.floor(p))
  const f = p - i
  const a = BASE_PTS[i]
  const b = BASE_PTS[i + 1]
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

interface Runner {
  id: number
  p: number
  target: number
  fade: number
  /** Seconds before a new runner leaves the box (lets the swing finish). */
  wait: number
}

let runnerIds = 1

function occupied(b: Bases): number[] {
  const out: number[] = []
  if (b.third) out.push(3)
  if (b.second) out.push(2)
  if (b.first) out.push(1)
  return out
}

function Runners() {
  const runners = useRef<Runner[]>([])
  const lastBases = useRef<Bases | null>(null)
  const lastSeed = useRef('')
  const slots = useRef<Array<THREE.Group | null>>([])

  useFrame((_, dt0) => {
    const dt = Math.min(0.05, dt0)
    const g = useGame.getState()
    const bases = g.sit.bases
    const fresh = g.seedText !== lastSeed.current || g.phase === 'menu'
    if (fresh || !lastBases.current) {
      runners.current = occupied(bases).map((b) => ({ id: runnerIds++, p: b, target: b, fade: 1, wait: 0 }))
      lastSeed.current = g.seedText
      lastBases.current = { ...bases }
    } else if (bases.first !== lastBases.current.first || bases.second !== lastBases.current.second || bases.third !== lastBases.current.third) {
      // Advance existing runners to the nearest occupied base at/after them;
      // anyone left over scores. The batter joins from home if needed.
      const targets = occupied(bases).sort((a, b) => a - b)
      const live = runners.current.filter((r) => r.target < 4).sort((a, b) => b.target - a.target)
      const claimed = new Set<number>()
      for (const r of live) {
        const t = targets.find((b) => b >= r.target && !claimed.has(b))
        if (t === undefined) r.target = 4
        else {
          r.target = t
          claimed.add(t)
        }
      }
      for (const t of targets) {
        if (!claimed.has(t)) runners.current.push({ id: runnerIds++, p: 0, target: t, fade: 1, wait: 0.7 })
      }
      lastBases.current = { ...bases }
    }
    // Move along the paths (~27 ft/s sprint ≈ 0.3 bases/s).
    for (const r of runners.current) {
      if (r.wait > 0) {
        r.wait -= dt
        continue
      }
      if (r.p < r.target) r.p = Math.min(r.target, r.p + dt * 0.3)
      if (r.p >= 4) r.fade -= dt * 1.5
    }
    runners.current = runners.current.filter((r) => r.fade > 0)
  })

  const makePose = (i: number) => (now: number, dt: number, out: Pose, root: THREE.Group) => {
    const r = runners.current[i]
    const slot = slots.current[i]
    if (!slot) return
    if (!r || r.wait > 0) {
      slot.visible = false
      return
    }
    slot.visible = true
    const g = useGame.getState()
    const moving = r.p < r.target - 0.001
    // Lead off the bag toward the next base; extend on the pitch.
    const lead = moving || r.p >= 4 ? 0 : (livePitch(g.phase) ? 0.16 : 0.1)
    const pt = pathPoint(Math.min(4, r.p + (r.p >= 3 ? lead * 0.5 : lead)))
    const sp = S(pt.x, pt.y, 0)
    root.parent?.position.set(sp[0], 0, sp[2])
    const ahead = pathPoint(Math.min(4, Math.floor(r.p) + 1))
    const ap = S(ahead.x, ahead.y, 0)
    const runYaw = yawToward(sp[0], sp[2], ap[0], ap[2])
    out.runAmt = approach(out.runAmt, moving ? 1 : 0, 6, dt)
    out.run += dt * 12 * out.runAmt
    out.crouch = approach(out.crouch, moving ? 0 : livePitch(g.phase) ? 0.7 : 0.35, 5, dt)
    out.hands = approach(out.hands, moving ? 0 : 0.35, 4, dt)
    out.lean = approach(out.lean, moving ? 0.25 : 0.1, 4, dt)
    // Face home while leading (square to the plate), turn to run.
    const faceHome = yawToward(sp[0], sp[2], 0, 0)
    out.yaw = approach(out.yaw, moving ? runYaw : faceHome, 6, dt)
    out.look = 0
    const s = Math.max(0, Math.min(1, r.fade))
    root.scale.setScalar(s)
    void now
  }

  return (
    <group>
      {[0, 1, 2, 3].map((i) => {
        return (
          <group key={i} ref={(o) => { slots.current[i] = o }} visible={false}>
            <group>
              <Figure jersey={HOME_TEAM.primary} pants="#e4e7eb" accent={HOME_TEAM.accent} helmet pose={makePose(i)} />
            </group>
          </group>
        )
      })}
    </group>
  )
}

/* ------------------------------------------------------------ base coaches */

function Coach({ x, y, seed }: { x: number; y: number; seed: number }) {
  const p = S(x, y, 0)
  const faceHome = yawToward(p[0], p[2], 0, 0)
  const pose = (now: number, dt: number, out: Pose) => {
    const g = useGame.getState()
    out.crouch = approach(out.crouch, livePitch(g.phase) ? 0.3 : 0.05, 3, dt)
    out.hands = approach(out.hands, Math.sin(now / 1900 + seed) > 0.6 ? 1.6 : 0.1, 3, dt)
    out.yaw = faceHome + Math.sin(now / 2700 + seed) * 0.15
    out.look = Math.sin(now / 3300 + seed * 2) * 0.3
  }
  return (
    <group position={p}>
      <Figure jersey={HOME_TEAM.primary} pants="#e4e7eb" accent={HOME_TEAM.accent} pose={pose} />
    </group>
  )
}

export function Players() {
  return (
    <group>
      {FIELDER_SPOTS.map((f, i) => <Fielder key={f.key} x={f.x} y={f.y} seed={i * 1.7} />)}
      <Runners />
      <Coach x={84} y={48} seed={0.4} />
      <Coach x={-84} y={48} seed={2.1} />
    </group>
  )
}
