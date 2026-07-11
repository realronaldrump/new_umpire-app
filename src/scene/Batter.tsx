import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { clamp, lerp, plerp } from '../game/rng'
import { HOME_TEAM, type BatterDef } from '../game/roster'
import { useGame } from '../store/game'

const easeInOut = (t: number) => t * t * (3 - 2 * t)

const SWING_YAW: ReadonlyArray<readonly [number, number]> = [
  [0, -1.15], [0.3, -1.3], [0.62, 1.57], [0.82, 2.25], [1, 2.75],
]
const SWING_TILT: ReadonlyArray<readonly [number, number]> = [
  [0, 1.0], [0.45, 0.55], [0.62, 0.05], [1, 0.5],
]

function Segment({
  from,
  to,
  radius,
  color,
  roughness = 0.78,
}: {
  from: readonly [number, number, number]
  to: readonly [number, number, number]
  radius: number
  color: string
  roughness?: number
}) {
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const direction = b.clone().sub(a)
  const distance = direction.length()
  const midpoint = a.clone().lerp(b, 0.5)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  )
  return (
    <mesh position={midpoint} quaternion={quaternion} castShadow>
      <capsuleGeometry args={[radius, Math.max(0.02, distance - radius * 2), 5, 10]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  )
}

/**
 * A jointed hitter authored from the same prepared-stance landmarks used by
 * rulebook ball/strike truth. Lefties are mirrored in world x.
 */
export function Batter({ batter }: { batter: BatterDef }) {
  const innerRef = useRef<THREE.Group>(null)
  const torsoRef = useRef<THREE.Group>(null)
  const batPivotRef = useRef<THREE.Group>(null)
  const mirror = batter.hand === 'L'

  useFrame(() => {
    const g = useGame.getState()
    const inner = innerRef.current
    const torso = torsoRef.current
    const batPivot = batPivotRef.current
    if (!inner || !torso || !batPivot) return

    const now = performance.now()
    const a = g.active
    let swingP = -1
    if (a?.plan.swings && a.flightStartMs && (g.phase === 'flight' || g.phase === 'swingResult' || g.phase === 'call')) {
      const contactMs = a.flightStartMs + (a.pitch.traj.T / a.timeScale) * 1000
      const durMs = 430 / Math.max(0.4, a.timeScale)
      swingP = clamp((now - (contactMs - durMs * 0.62)) / durMs, 0, 1.35)
    }

    const idle = Math.sin(now / 620) * 0.05
    if (swingP >= 0 && swingP <= 1.35) {
      const e = easeInOut(Math.min(1, swingP))
      batPivot.rotation.set(0, plerp(SWING_YAW, e), plerp(SWING_TILT, e))
      torso.rotation.y = lerp(-0.18, 1.0, e)
      torso.rotation.x = lerp(0.08, 0.2, e)
      inner.position.x = -lerp(0, 0.22, e)
    } else if (a && !a.plan.swings && g.phase === 'flight') {
      const ft = a.flightStartMs ? clamp((now - a.flightStartMs) / a.flightDurMs, 0, 1) : 0
      inner.position.x = -easeInOut(clamp(ft * 2.2, 0, 1)) * 0.16
      torso.rotation.set(0.1, -0.15, 0)
      batPivot.rotation.set(0, -1.15, 1.12)
    } else {
      inner.position.x = 0
      torso.rotation.set(0.09, -0.18, 0)
      batPivot.rotation.set(0, -1.15 + idle * 0.25, 1.08 + idle * 0.3)
    }
  })

  const widthFt = batter.stance.widthIn / 12
  const kneeY = batter.stance.kneeHollowIn / 12
  const hipY = batter.stance.pantsTopIn / 12 - 0.2
  const shoulderY = batter.stance.shoulderTopIn / 12 - 0.15
  const torsoHeight = shoulderY - hipY
  const body = 1 + batter.build * 0.09
  const pant = '#e2e5e9'
  const sock = HOME_TEAM.primary
  const cleat = '#101318'
  const skin = batter.skinTone

  return (
    <group scale={[mirror ? -1 : 1, 1, 1]}>
      <group position={[-2.95, 0, 0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <group ref={innerRef}>
          {/* Athletic, flexed lower body. Joint heights match the rulebook landmarks. */}
          {[-1, 1].map((side) => {
            const footX = side * widthFt * 0.5
            const kneeX = side * widthFt * 0.29
            const hipX = side * 0.22
            return (
              <group key={side}>
                <Segment from={[footX, 0.32, 0]} to={[kneeX, kneeY, 0.04]} radius={0.16 * body} color={pant} />
                <Segment from={[kneeX, kneeY, 0.04]} to={[hipX, hipY, 0]} radius={0.2 * body} color={pant} />
                <mesh position={[kneeX, kneeY, 0.04]} scale={[1, 0.9, 0.94]} castShadow>
                  <sphereGeometry args={[0.205 * body, 12, 9]} />
                  <meshStandardMaterial color={pant} roughness={0.82} />
                </mesh>
                <mesh position={[footX - 0.08, 0.13, -0.08]} rotation={[0, 0, side * -0.04]} castShadow>
                  <boxGeometry args={[0.72, 0.22, 0.34]} />
                  <meshStandardMaterial color={cleat} roughness={0.92} />
                </mesh>
                <mesh position={[footX, 0.42, 0]}>
                  <cylinderGeometry args={[0.172, 0.172, 0.22, 12]} />
                  <meshStandardMaterial color={sock} roughness={0.82} />
                </mesh>
              </group>
            )
          })}

          {/* Pants seat, belt and tucked jersey. */}
          <mesh position={[0, hipY - 0.08, 0]} scale={[0.78 * body, 0.42, 0.52 * body]} castShadow>
            <sphereGeometry args={[0.62, 18, 12]} />
            <meshStandardMaterial color={pant} roughness={0.82} />
          </mesh>
          <mesh position={[0, hipY + 0.18, 0]}>
            <cylinderGeometry args={[0.43 * body, 0.43 * body, 0.11, 18]} />
            <meshStandardMaterial color="#171b22" roughness={0.62} />
          </mesh>
          <mesh position={[0, hipY + 0.18, -0.42 * body]}>
            <boxGeometry args={[0.18, 0.13, 0.06]} />
            <meshStandardMaterial color="#b8a06a" metalness={0.5} roughness={0.35} />
          </mesh>

          <group ref={torsoRef} position={[0, hipY + 0.17, 0]}>
            <mesh position={[0, torsoHeight * 0.48, 0]} scale={[body, 1, body * 0.82]} castShadow>
              <capsuleGeometry args={[0.42, Math.max(0.3, torsoHeight - 0.55), 6, 14]} />
              <meshStandardMaterial color={HOME_TEAM.primary} roughness={0.74} />
            </mesh>
            {/* Jersey shoulder yoke, sleeve cuffs, back number. */}
            <mesh position={[0, torsoHeight * 0.78, 0]} scale={[1.28 * body, 0.34, 0.78 * body]} castShadow>
              <sphereGeometry args={[0.45, 16, 10]} />
              <meshStandardMaterial color={HOME_TEAM.primary} roughness={0.72} />
            </mesh>
            <mesh position={[0, torsoHeight * 0.48, 0.405 * body]} rotation={[0, 0, 0]}>
              <planeGeometry args={[0.46, 0.55]} />
              <meshStandardMaterial color="#000000" transparent opacity={0} depthWrite={false} />
              <Text position={[0, 0, 0.01]} fontSize={0.36} color={HOME_TEAM.accent} anchorX="center" anchorY="middle">
                {batter.number}
              </Text>
            </mesh>

            {/* Neck, face, ears and a real batting helmet silhouette. */}
            <mesh position={[0, torsoHeight + 0.03, 0]}>
              <cylinderGeometry args={[0.15, 0.17, 0.28, 12]} />
              <meshStandardMaterial color={skin} roughness={0.82} />
            </mesh>
            <mesh position={[0, torsoHeight + 0.38, -0.01]} scale={[0.9, 1.08, 0.88]} castShadow>
              <sphereGeometry args={[0.28, 18, 14]} />
              <meshStandardMaterial color={skin} roughness={0.82} />
            </mesh>
            <mesh position={[0, torsoHeight + 0.49, 0]} castShadow>
              <sphereGeometry args={[0.32, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.64]} />
              <meshStandardMaterial color={HOME_TEAM.primary} roughness={0.3} metalness={0.16} />
            </mesh>
            <mesh position={[0, torsoHeight + 0.43, -0.26]} scale={[1, 0.32, 1]}>
              <sphereGeometry args={[0.24, 14, 8]} />
              <meshStandardMaterial color={HOME_TEAM.primary} roughness={0.34} />
            </mesh>
            <mesh position={[0.24, torsoHeight + 0.35, 0]} scale={[0.2, 0.46, 0.38]}>
              <sphereGeometry args={[0.3, 12, 8]} />
              <meshStandardMaterial color={HOME_TEAM.primary} roughness={0.36} />
            </mesh>

            {/* Bent arms, jersey sleeves, forearms and batting gloves. */}
            <Segment from={[0.48, torsoHeight * 0.78, 0]} to={[0.58, torsoHeight * 0.38, 0.3]} radius={0.145 * body} color={HOME_TEAM.primary} />
            <Segment from={[0.58, torsoHeight * 0.38, 0.3]} to={[0.3, torsoHeight * 0.55, 0.46]} radius={0.105 * body} color={skin} />
            <Segment from={[-0.44, torsoHeight * 0.76, 0]} to={[-0.22, torsoHeight * 0.37, 0.34]} radius={0.145 * body} color={HOME_TEAM.primary} />
            <Segment from={[-0.22, torsoHeight * 0.37, 0.34]} to={[0.22, torsoHeight * 0.53, 0.47]} radius={0.105 * body} color={skin} />
            {[0.22, 0.33].map((x) => (
              <mesh key={x} position={[x, torsoHeight * 0.54, 0.48]} scale={[1.15, 0.9, 0.9]}>
                <sphereGeometry args={[0.13, 12, 9]} />
                <meshStandardMaterial color="#8f2637" roughness={0.7} />
              </mesh>
            ))}

            {/* Regulation-proportioned wood bat, pivoting at the hands. */}
            <group ref={batPivotRef} position={[0.28, torsoHeight * 0.56, 0.5]}>
              <mesh position={[1.32, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.105, 0.045, 2.85, 14]} />
                <meshStandardMaterial color="#c99b5d" roughness={0.48} />
              </mesh>
              <mesh position={[-0.12, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[0.09, 0.09, 0.07, 12]} />
                <meshStandardMaterial color="#8a6538" roughness={0.58} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
