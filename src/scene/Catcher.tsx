import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { clamp } from '../game/rng'
import { AWAY_TEAM } from '../game/roster'
import { useGame } from '../store/game'

/**
 * The catcher crouches just behind the plate, seen from behind. The mitt sets
 * up at the pitcher's intended target, tracks the live ball, and — on
 * borderline takes — quietly pulls the receive toward the zone (framing).
 */
export function Catcher() {
  const rootRef = useRef<THREE.Group>(null)
  const mittRef = useRef<THREE.Group>(null)
  const armRef = useRef<THREE.Mesh>(null)
  const mittPos = useRef(new THREE.Vector3(0, 1.6, 2.2))
  const target = useRef(new THREE.Vector3(0, 1.6, 2.2))
  const shoulder = new THREE.Vector3()

  useFrame((_, delta) => {
    const g = useGame.getState()
    const root = rootRef.current
    const mitt = mittRef.current
    const arm = armRef.current
    if (!root || !mitt || !arm) return

    const a = g.active
    const now = performance.now()

    // Body slides a touch toward the setup target.
    const setupX = a ? clamp(a.pitch.intended.x * 0.42, -0.85, 0.85) : 0
    root.position.x += (setupX - root.position.x) * Math.min(1, delta * 3)
    root.position.z = 3.55
    // Breathing bob.
    root.position.y = Math.sin(now / 900) * 0.015

    // Mitt target in scene coords (game y=-2.7 plane → scene z=2.7).
    if (!a || g.phase === 'newBatter' || g.phase === 'reveal' || g.phase === 'swingResult') {
      target.current.set(setupX * 0.6, 1.55, 2.55)
    } else if (g.phase === 'prePitch' || g.phase === 'windup') {
      target.current.set(a.pitch.intended.x, clamp(a.pitch.intended.z, 0.7, 4), 2.62)
    } else if (g.phase === 'flight' && a.flightStartMs) {
      const ft = ((now - a.flightStartMs) / 1000) * a.timeScale
      const frac = clamp(ft / a.pitch.traj.catchT, 0, 1)
      const cx = a.catchPos.x + (a.plan.swings ? 0 : a.framing.x)
      const cz = a.catchPos.z + (a.plan.swings ? 0 : a.framing.z)
      // Ease from setup spot to the real catch point as the ball arrives.
      const k = frac * frac
      target.current.set(
        a.pitch.intended.x + (cx - a.pitch.intended.x) * k,
        clamp(a.pitch.intended.z + (cz - a.pitch.intended.z) * k, 0.35, 4.6),
        2.62,
      )
    } else if (g.phase === 'call') {
      const cx = a.catchPos.x + a.framing.x
      const cz = a.catchPos.z + a.framing.z
      // Receive with a little give, then stick the frame.
      const sinceCatch = now - (a.flightStartMs + a.flightDurMs)
      const give = Math.exp(-sinceCatch / 110) * 0.24
      target.current.set(cx, clamp(cz, 0.3, 4.6), 2.62 + give)
    }

    const speed = g.phase === 'flight' ? 14 : 6
    mittPos.current.lerp(target.current, Math.min(1, delta * speed))
    mitt.position.copy(mittPos.current)

    // Forearm stretches from the right shoulder to the mitt.
    shoulder.set(root.position.x + 0.55, 1.85, 3.4)
    const mid = shoulder.clone().lerp(mittPos.current, 0.5)
    arm.position.copy(mid)
    const len = Math.max(0.4, shoulder.distanceTo(mittPos.current))
    arm.scale.set(1, len / 1.6, 1)
    arm.lookAt(mittPos.current)
    arm.rotateX(Math.PI / 2)
  })

  return (
    <group>
      <group ref={rootRef} position={[0, 0, 3.55]}>
        {/* Haunches / folded legs */}
        {[-0.42, 0.42].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.62, 0.18]} rotation={[1.25, 0, x * 0.35]} castShadow>
              <capsuleGeometry args={[0.21, 0.85, 4, 10]} />
              <meshStandardMaterial color="#2c2f36" roughness={0.85} />
            </mesh>
            {/* Shin guards */}
            <mesh position={[x * 1.35, 0.5, -0.32]} rotation={[0.22, 0, 0]} castShadow>
              <capsuleGeometry args={[0.17, 0.8, 4, 10]} />
              <meshStandardMaterial color="#d8dde4" roughness={0.5} metalness={0.15} />
            </mesh>
            <mesh position={[x * 1.35, 0.56, -0.49]} rotation={[0.22, 0, 0]}>
              <boxGeometry args={[0.3, 0.62, 0.08]} />
              <meshStandardMaterial color={AWAY_TEAM.accent} roughness={0.52} metalness={0.1} />
            </mesh>
            {/* Cleats */}
            <mesh position={[x * 1.4, 0.12, -0.42]}>
              <boxGeometry args={[0.32, 0.2, 0.62]} />
              <meshStandardMaterial color="#15161a" roughness={0.9} />
            </mesh>
          </group>
        ))}

        {/* Torso, leaning toward the plate */}
        <mesh position={[0, 1.42, 0.12]} rotation={[0.34, 0, 0]} castShadow>
          <capsuleGeometry args={[0.44, 0.95, 4, 12]} />
          <meshStandardMaterial color={AWAY_TEAM.primary} roughness={0.8} />
        </mesh>
        {/* Chest protector (we see its back edge + shoulders) */}
        <mesh position={[0, 1.62, -0.18]} rotation={[0.34, 0, 0]}>
          <capsuleGeometry args={[0.47, 0.7, 4, 12]} />
          <meshStandardMaterial color={AWAY_TEAM.accent} roughness={0.65} />
        </mesh>
        {[1.38, 1.58, 1.78].map((y) => (
          <mesh key={y} position={[0, y, -0.58]} rotation={[0.34, 0, 0]}>
            <boxGeometry args={[0.68, 0.055, 0.055]} />
            <meshStandardMaterial color="#202630" roughness={0.6} />
          </mesh>
        ))}
        {/* Number plate on the back */}
        <mesh position={[0, 1.66, 0.56]} rotation={[0.32, 0, 0]}>
          <planeGeometry args={[0.5, 0.5]} />
          <meshStandardMaterial color="#f0ede4" roughness={0.7} />
        </mesh>

        {/* Helmet (backwards catcher mask reads as a smooth dome from here) */}
        <mesh position={[0, 2.34, 0.06]} castShadow>
          <sphereGeometry args={[0.31, 18, 14]} />
          <meshStandardMaterial color="#1a1c22" roughness={0.35} metalness={0.2} />
        </mesh>
        {/* Mask cage hint */}
        <mesh position={[0, 2.3, -0.2]}>
          <torusGeometry args={[0.2, 0.025, 6, 14]} />
          <meshStandardMaterial color="#3a3f49" roughness={0.4} metalness={0.6} />
        </mesh>
        {[-0.14, 0, 0.14].map((x) => (
          <mesh key={x} position={[x, 2.29, -0.385]}>
            <boxGeometry args={[0.025, 0.38, 0.025]} />
            <meshStandardMaterial color="#535b68" roughness={0.4} metalness={0.65} />
          </mesh>
        ))}

        {/* Bare hand tucked behind the mitt-side knee */}
        <mesh position={[-0.55, 0.85, 0.1]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color="#b98a68" roughness={0.8} />
        </mesh>
      </group>

      {/* Throwing-side forearm reaching to the mitt */}
      <mesh ref={armRef} castShadow>
        <capsuleGeometry args={[0.13, 1.6, 4, 8]} />
        <meshStandardMaterial color={AWAY_TEAM.primary} roughness={0.8} />
      </mesh>

      {/* The mitt — the star of the show */}
      <group ref={mittRef} position={[0, 1.6, 2.6]}>
        <mesh castShadow scale={[1, 1, 0.55]}>
          <sphereGeometry args={[0.42, 18, 14]} />
          <meshStandardMaterial color="#8a5a2e" roughness={0.75} />
        </mesh>
        {/* Pocket */}
        <mesh position={[0, 0.04, -0.13]} scale={[1, 1, 0.5]}>
          <sphereGeometry args={[0.3, 14, 10]} />
          <meshStandardMaterial color="#4a2d14" roughness={0.95} />
        </mesh>
        {/* Lacing rim */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.05]}>
          <torusGeometry args={[0.4, 0.045, 8, 18]} />
          <meshStandardMaterial color="#6d4522" roughness={0.85} />
        </mesh>
        <mesh position={[-0.28, -0.2, 0]} rotation={[0, 0, -0.55]} scale={[0.5, 1, 0.55]}>
          <sphereGeometry args={[0.28, 12, 9]} />
          <meshStandardMaterial color="#754820" roughness={0.82} />
        </mesh>
      </group>
    </group>
  )
}
