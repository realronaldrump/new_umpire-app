import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { MOUND_HEIGHT_FT, RUBBER_Y_FT, TIMING } from '../game/constants'
import { clamp, lerp, plerp } from '../game/rng'
import { AWAY_TEAM } from '../game/roster'
import { useGame } from '../store/game'
import { S } from './coords'

const easeInOut = (t: number) => t * t * (3 - 2 * t)

/**
 * Keyframe curves over windup progress p ∈ [0,1]; release at p = 1.
 * Follow-through continues on f ∈ [0,1] after release.
 */
const ARM_X: ReadonlyArray<readonly [number, number]> = [
  [0, 0.25], [0.3, 0.2], [0.6, -1.15], [0.85, -2.3], [1, 1.3],
]
const TORSO_TILT: ReadonlyArray<readonly [number, number]> = [
  [0, 0.05], [0.35, -0.06], [0.7, 0.12], [1, 0.55],
]
const THIGH_X: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.3, -0.25], [0.5, -1.5], [0.8, -0.7], [1, -0.15],
]
const SHIN_X: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.5, 1.35], [0.8, 0.5], [1, 0.1],
]
const HIP_DROP: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.35, -0.12], [0.75, -0.3], [1, -0.6],
]

export function Pitcher({ hand }: { hand: 'R' | 'L' }) {
  const armRef = useRef<THREE.Group>(null)
  const torsoRef = useRef<THREE.Group>(null)
  const thighRef = useRef<THREE.Group>(null)
  const shinRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const armSide = hand === 'R' ? -1 : 1 // his throwing arm, from the umpire's view

  useFrame(() => {
    const g = useGame.getState()
    const arm = armRef.current
    const torso = torsoRef.current
    const thigh = thighRef.current
    const shin = shinRef.current
    const body = bodyRef.current
    if (!arm || !torso || !thigh || !shin || !body) return

    const now = performance.now()
    let p = 0 // windup progress
    let f = 0 // follow-through progress

    if (g.phase === 'windup') {
      p = clamp((now - g.phaseStart) / TIMING.windupMs, 0, 1)
    } else if (g.phase === 'flight' || g.phase === 'call' || g.phase === 'challenge' || g.phase === 'absReveal' || g.phase === 'swingResult' || g.phase === 'reveal') {
      p = 1
      const t0 = g.active?.flightStartMs || g.phaseStart
      f = clamp((now - t0) / 600, 0, 1)
    }

    const idle = Math.sin(now / 800) * 0.03
    if (p <= 0) {
      // Getting the sign: lean in, glove at the chest.
      torso.rotation.x = 0.16 + idle
      arm.rotation.x = 0.25
      arm.rotation.z = armSide * 0.25
      thigh.rotation.x = 0
      shin.rotation.x = 0
      body.position.y = 0
      return
    }

    const e = easeInOut(p)
    arm.rotation.x = plerp(ARM_X, p) + (p >= 1 ? f * 0.6 : 0)
    arm.rotation.z = armSide * lerp(0.25, 0.85, e)
    torso.rotation.x = plerp(TORSO_TILT, p) + f * 0.35
    torso.rotation.y = armSide * Math.sin(e * Math.PI) * 0.4
    thigh.rotation.x = plerp(THIGH_X, p) + f * 0.1
    shin.rotation.x = plerp(SHIN_X, p)
    body.position.y = plerp(HIP_DROP, p)
    body.position.z = lerp(0, 1.6, Math.max(0, p - 0.5) * 2) + f * 0.4
  })

  return (
    <group position={S(0, RUBBER_Y_FT - 0.6, MOUND_HEIGHT_FT)}>
      <group ref={bodyRef}>
        {/* Back (anchor) leg */}
        <mesh position={[armSide * -0.28, 1.55, -0.1]} castShadow>
          <capsuleGeometry args={[0.2, 2.4, 4, 8]} />
          <meshStandardMaterial color="#c9ced6" roughness={0.85} />
        </mesh>
        <mesh position={[armSide * -0.28, 0.14, 0.12]} castShadow>
          <boxGeometry args={[0.42, 0.2, 0.72]} />
          <meshStandardMaterial color="#11141a" roughness={0.92} />
        </mesh>
        {/* Lead leg: thigh → knee → shin */}
        <group ref={thighRef} position={[armSide * 0.3, 2.7, 0]}>
          <mesh position={[0, -0.7, 0]} castShadow>
            <capsuleGeometry args={[0.2, 1.2, 4, 8]} />
            <meshStandardMaterial color="#c9ced6" roughness={0.85} />
          </mesh>
          <group ref={shinRef} position={[0, -1.4, 0]}>
            <mesh position={[0, -0.6, 0]} castShadow>
              <capsuleGeometry args={[0.17, 1.1, 4, 8]} />
              <meshStandardMaterial color="#c9ced6" roughness={0.85} />
            </mesh>
            <mesh position={[0, -1.25, 0.14]}>
              <boxGeometry args={[0.3, 0.2, 0.6]} />
              <meshStandardMaterial color="#15161a" roughness={0.9} />
            </mesh>
          </group>
        </group>

        <group ref={torsoRef} position={[0, 4.05, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.44, 1.3, 4, 12]} />
            <meshStandardMaterial color={AWAY_TEAM.primary} roughness={0.75} />
          </mesh>
          {/* Tucked jersey, belt and piping distinguish a baseball uniform. */}
          <mesh position={[0, -0.78, 0]}>
            <cylinderGeometry args={[0.43, 0.43, 0.11, 16]} />
            <meshStandardMaterial color="#171a20" roughness={0.62} />
          </mesh>
          <mesh position={[0, -0.78, 0.42]}>
            <boxGeometry args={[0.17, 0.13, 0.05]} />
            <meshStandardMaterial color="#b7a06f" metalness={0.48} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.2, 0.43]}>
            <boxGeometry args={[0.045, 1.35, 0.025]} />
            <meshStandardMaterial color={AWAY_TEAM.accent} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.35, 0.3]}>
            <planeGeometry args={[0.55, 0.4]} />
            <meshStandardMaterial color={AWAY_TEAM.accent} roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          {/* Head + cap */}
          <mesh position={[0, 1.15, 0]}>
            <sphereGeometry args={[0.24, 12, 10]} />
            <meshStandardMaterial color="#b98a68" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.3, 0.02]}>
            <sphereGeometry args={[0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color="#17181d" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.3, 0.27]} scale={[1, 0.16, 0.72]}>
            <sphereGeometry args={[0.3, 14, 8]} />
            <meshStandardMaterial color="#17181d" roughness={0.55} />
          </mesh>

          {/* Glove arm */}
          <mesh position={[armSide * -0.62, 0.35, 0.25]} rotation={[0.5, 0, armSide * -0.7]} castShadow>
            <capsuleGeometry args={[0.13, 1.15, 4, 8]} />
            <meshStandardMaterial color={AWAY_TEAM.primary} roughness={0.75} />
          </mesh>
          <mesh position={[armSide * -0.85, -0.05, 0.55]}>
            <sphereGeometry args={[0.26, 14, 10]} />
            <meshStandardMaterial color="#5e3a1c" roughness={0.8} />
          </mesh>
          <mesh position={[armSide * -0.86, -0.02, 0.72]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.025, 7, 14]} />
            <meshStandardMaterial color="#2e1b0e" roughness={0.9} />
          </mesh>

          {/* Throwing arm (pivots at the shoulder) */}
          <group ref={armRef} position={[armSide * 0.6, 0.55, 0]}>
            <mesh position={[0, -0.95, 0]} castShadow>
              <capsuleGeometry args={[0.13, 1.7, 4, 8]} />
              <meshStandardMaterial color={AWAY_TEAM.primary} roughness={0.75} />
            </mesh>
            <mesh position={[0, -1.85, 0]}>
              <sphereGeometry args={[0.13, 8, 8]} />
              <meshStandardMaterial color="#b98a68" roughness={0.8} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
