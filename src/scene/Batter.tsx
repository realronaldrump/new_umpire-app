import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clamp, lerp, plerp } from '../game/rng'
import { HOME_TEAM, lookFor, type BatterDef } from '../game/roster'
import { useGame } from '../store/game'
import jerseyFontUrl from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url'

const easeInOut = (t: number) => t * t * (3 - 2 * t)

/* Swing keyframes (tuned in the original build — the bat pivots at the hands). */
const SWING_YAW: ReadonlyArray<readonly [number, number]> = [
  [0, -1.15], [0.3, -1.3], [0.62, 1.57], [0.82, 2.25], [1, 2.75],
]
const SWING_TILT: ReadonlyArray<readonly [number, number]> = [
  [0, 1.0], [0.45, 0.55], [0.62, 0.05], [1, 0.5],
]

/* Helmet-tap challenge choreography, over phase progress p ∈ [0,1]. */
const TAP_RAISE: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.14, 0], [0.32, 1], [0.74, 1], [0.92, 0], [1, 0],
]
const TAP_BAT_REST: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.2, 1], [0.82, 1], [1, 0.85],
]

const PANT = '#e2e5e9'
const CLEAT = '#101318'
const GUARD = '#d8dde4'
const UP = new THREE.Vector3(0, 1, 0)

/* Scratch vectors reused across frames (no per-frame allocation). */
const _dir = new THREE.Vector3()
const _perp = new THREE.Vector3()
const _elbow = new THREE.Vector3()
const _hand = new THREE.Vector3()
const _target = new THREE.Vector3()
const _batDir = new THREE.Vector3()
const _shoulder = new THREE.Vector3()
const _pole = new THREE.Vector3()

/**
 * Two-bone IK: given shoulder S and a desired hand position, find the elbow.
 * The pole vector picks which way the elbow folds. Writes the reachable hand
 * (target clamped to arm length) into `hand` and the elbow into `elbow`.
 */
function solveArm(
  s: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  elbow: THREE.Vector3,
  hand: THREE.Vector3,
): void {
  _dir.copy(target).sub(s)
  const d = clamp(_dir.length(), Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.015)
  _dir.normalize()
  hand.copy(s).addScaledVector(_dir, d)
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0.0004, l1 * l1 - a * a))
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir))
  if (_perp.lengthSq() < 1e-6) _perp.set(-_dir.y, _dir.x, 0)
  _perp.normalize()
  elbow.copy(s).addScaledVector(_dir, a).addScaledVector(_perp, h)
}

/** Orient+position a fixed-length bone mesh between two joints. */
function placeBone(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  mesh.position.copy(a).lerp(b, 0.5)
  _batDir.copy(b).sub(a).normalize()
  mesh.quaternion.setFromUnitVectors(UP, _batDir)
}

interface ArmRefs {
  upper: THREE.Mesh | null
  fore: THREE.Mesh | null
  hand: THREE.Group | null
}

function StaticSegment({
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
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize())
  return (
    <mesh position={midpoint} quaternion={quaternion} castShadow>
      <capsuleGeometry args={[radius, Math.max(0.02, distance - radius * 2), 5, 10]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  )
}

/** Un-mirrors jersey lettering inside the lefty-flipped rig. */
function JerseyText({
  mirror, position, rotation, fontSize, color, children,
}: {
  mirror: boolean
  position: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  fontSize: number
  color: string
  children: string
}) {
  return (
    <group position={position as [number, number, number]} rotation={(rotation ?? [0, 0, 0]) as [number, number, number]}>
      <Text
        scale={[mirror ? -1 : 1, 1, 1]}
        font={jerseyFontUrl}
        fontSize={fontSize}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={fontSize * 0.045}
        outlineColor="#0a1018"
      >
        {children}
      </Text>
    </group>
  )
}

/**
 * A jointed hitter authored from the same prepared-stance landmarks used by
 * rulebook ball/strike truth. Lefties are mirrored in world x. Arms are solved
 * with two-bone IK every frame so the hands really hold the bat — and can
 * leave it to tap the helmet for an ABS challenge.
 */
export function Batter({ batter }: { batter: BatterDef }) {
  const innerRef = useRef<THREE.Group>(null)
  const torsoRef = useRef<THREE.Group>(null)
  const batPivotRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const leadArm = useRef<ArmRefs>({ upper: null, fore: null, hand: null })
  const backArm = useRef<ArmRefs>({ upper: null, fore: null, hand: null })
  const gaze = useRef({ yaw: 1.02, pitch: 0.04 })

  const mirror = batter.hand === 'L'
  const look = useMemo(() => lookFor(batter), [batter])

  const widthFt = batter.stance.widthIn / 12
  const kneeY = batter.stance.kneeHollowIn / 12
  const hipY = batter.stance.pantsTopIn / 12 - 0.2
  const shoulderY = batter.stance.shoulderTopIn / 12 - 0.15
  const torsoHeight = shoulderY - hipY
  const body = 1 + batter.build * 0.09
  const skin = batter.skinTone
  const jersey = HOME_TEAM.primary
  const accent = HOME_TEAM.accent

  const stubble = useMemo(
    () => '#' + new THREE.Color(skin).lerp(new THREE.Color(look.hairColor), 0.55).getHexString(),
    [skin, look.hairColor],
  )

  /* Arm rig constants (torso-local). */
  const armLen = { upper: 0.6, fore: 0.55 }
  const shoulderLead: [number, number, number] = [-0.42 * body, torsoHeight * 0.8, 0.03]
  const shoulderBack: [number, number, number] = [0.44 * body, torsoHeight * 0.82, 0.03]
  const pivotBase: [number, number, number] = [0.28, torsoHeight * 0.56 + look.handsHeight, 0.5]
  const helmetTap: [number, number, number] = [-0.06, torsoHeight + 0.5, -0.12]

  useFrame((_, delta) => {
    const g = useGame.getState()
    const inner = innerRef.current
    const torso = torsoRef.current
    const batPivot = batPivotRef.current
    const head = headRef.current
    const lead = leadArm.current
    const back = backArm.current
    if (!inner || !torso || !batPivot || !head) return

    const nowMs = performance.now()
    const a = g.active
    const phaseP = g.phaseDur > 0 && Number.isFinite(g.phaseDur)
      ? clamp((nowMs - g.phaseStart) / g.phaseDur, 0, 1)
      : 0

    /* ---- swing progress (unchanged timing from the original build) ---- */
    let swingP = -1
    if (a?.plan.swings && a.flightStartMs && (g.phase === 'flight' || g.phase === 'swingResult' || g.phase === 'call')) {
      const contactMs = a.flightStartMs + (a.pitch.traj.T / a.timeScale) * 1000
      const durMs = 430 / Math.max(0.4, a.timeScale)
      swingP = clamp((nowMs - (contactMs - durMs * 0.62)) / durMs, 0, 1.35)
    }

    const waggle = Math.sin(nowMs / (530 / look.waggleHz)) * look.waggle
    const challenging = g.phase === 'challenge' && g.absChallenge?.challengerSide === 'offense'
    const reviewing = g.phase === 'absReveal'

    /* ---- gaze target ---- */
    let gazeYaw = 1.02 + Math.sin(nowMs / 3100) * 0.05
    let gazePitch = 0.04
    if (g.phase === 'call' || g.phase === 'reveal') {
      gazeYaw = -0.55
      gazePitch = 0.38
    } else if (challenging) {
      gazeYaw = -1.12 // square up and stare a hole through the umpire
      gazePitch = -0.28
    } else if (reviewing) {
      gazeYaw = 0.95 // up at the big board in center field
      gazePitch = -0.38
    } else if (swingP > 1) {
      gazeYaw = 0.35
      gazePitch = -0.12
    }
    const gk = Math.min(1, delta * (challenging ? 7 : 4.5))
    gaze.current.yaw += (gazeYaw - gaze.current.yaw) * gk
    gaze.current.pitch += (gazePitch - gaze.current.pitch) * gk
    head.rotation.set(gaze.current.pitch, gaze.current.yaw, 0)

    /* ---- body + bat pose ---- */
    let tapRaise = 0
    if (swingP >= 0 && swingP <= 1.35) {
      const e = easeInOut(Math.min(1, swingP))
      batPivot.rotation.set(0, plerp(SWING_YAW, e), plerp(SWING_TILT, e))
      torso.rotation.y = lerp(-0.18, 1.0, e)
      torso.rotation.x = lerp(0.08, 0.2, e)
      inner.position.x = -lerp(0, 0.22, e)
    } else if (a && !a.plan.swings && g.phase === 'flight') {
      const ft = a.flightStartMs ? clamp((nowMs - a.flightStartMs) / a.flightDurMs, 0, 1) : 0
      inner.position.x = -easeInOut(clamp(ft * 2.2, 0, 1)) * 0.16
      torso.rotation.set(0.1, -0.15, 0)
      batPivot.rotation.set(0, -1.15, 1.12)
    } else if (challenging) {
      const rest = plerp(TAP_BAT_REST, phaseP)
      tapRaise = plerp(TAP_RAISE, phaseP)
      inner.position.x = 0
      torso.rotation.set(lerp(0.09, 0.02, rest), lerp(-0.18, -0.5, rest), 0)
      batPivot.rotation.set(0, lerp(-1.15, -1.3, rest), lerp(1.08, -0.42, rest))
    } else if (reviewing) {
      const settle = Math.min(1, phaseP * 6)
      inner.position.x = 0
      torso.rotation.set(0.04, lerp(-0.5, -0.1, settle), 0)
      batPivot.rotation.set(0, -1.25, lerp(-0.42, -0.5, settle) + Math.sin(nowMs / 900) * 0.02)
    } else {
      inner.position.x = 0
      torso.rotation.set(0.09, -0.18, 0)
      batPivot.rotation.set(0, -1.15 + waggle * 0.07, 1.08 + look.batAngle + waggle * 0.1)
    }
    batPivot.position.set(pivotBase[0], pivotBase[1], pivotBase[2])

    /* ---- arms: hands ride the bat handle; the lead hand taps the helmet ---- */
    _batDir.set(1, 0, 0).applyEuler(batPivot.rotation)

    // Back (top) hand.
    _shoulder.set(shoulderBack[0], shoulderBack[1], shoulderBack[2])
    _target.copy(batPivot.position).addScaledVector(_batDir, 0.16)
    _pole.set(0.85, 0.4, 0.3)
    solveArm(_shoulder, _target, armLen.upper, armLen.fore, _pole, _elbow, _hand)
    if (back.upper && back.fore && back.hand) {
      placeBone(back.upper, _shoulder, _elbow)
      placeBone(back.fore, _elbow, _hand)
      back.hand.position.copy(_hand)
      back.hand.quaternion.setFromUnitVectors(UP, _dir.copy(_hand).sub(_elbow).normalize())
    }

    // Lead (bottom) hand — leaves the bat during a challenge tap.
    _shoulder.set(shoulderLead[0], shoulderLead[1], shoulderLead[2])
    _target.copy(batPivot.position).addScaledVector(_batDir, 0.04)
    if (tapRaise > 0) {
      const bounce = Math.abs(Math.sin(clamp((phaseP - 0.32) / 0.42, 0, 1) * Math.PI * 2)) * 0.055
      _target.set(
        lerp(_target.x, helmetTap[0], tapRaise),
        lerp(_target.y, helmetTap[1] - bounce, tapRaise),
        lerp(_target.z, helmetTap[2], tapRaise),
      )
    }
    _pole.set(-0.75, lerp(-0.7, 0.2, tapRaise), -0.2)
    solveArm(_shoulder, _target, armLen.upper, armLen.fore, _pole, _elbow, _hand)
    if (lead.upper && lead.fore && lead.hand) {
      placeBone(lead.upper, _shoulder, _elbow)
      placeBone(lead.fore, _elbow, _hand)
      lead.hand.position.copy(_hand)
      lead.hand.quaternion.setFromUnitVectors(UP, _dir.copy(_hand).sub(_elbow).normalize())
    }
  })

  const sockColor = look.highSocks ? jersey : PANT
  const nobSize = Math.min(0.15, 1.0 / Math.max(4, look.nameOnBack.length))
  const batWood = look.batFinish === 'black' ? '#26201c' : '#c99b5d'
  const batHandleColor = look.batFinish === 'twoTone' ? '#2b2320' : look.batFinish === 'black' ? '#26201c' : '#c99b5d'

  return (
    <group scale={[mirror ? -1 : 1, 1, 1]}>
      <group position={[-2.95, 0, 0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <group ref={innerRef}>
          {/* ---------- lower body ---------- */}
          {([-1, 1] as const).map((side) => {
            const isLead = side === -1
            const footX = side * widthFt * 0.5
            const footZ = isLead ? look.openStance : 0
            const kneeX = side * widthFt * 0.29
            const hipX = side * 0.22
            const shinFrom: [number, number, number] = [footX, 0.3, footZ]
            const shinTo: [number, number, number] = [kneeX, kneeY, 0.04]
            return (
              <group key={side}>
                <StaticSegment from={[hipX, hipY, 0]} to={shinTo} radius={0.2 * body} color={PANT} />
                {/* Shin: socks when the pants are cuffed high, pants otherwise */}
                <StaticSegment from={shinFrom} to={shinTo} radius={0.148 * body} color={sockColor} />
                {look.highSocks && (
                  <>
                    {/* Knicker cuff just below the knee */}
                    <mesh position={[kneeX, kneeY - 0.13, 0.035]}>
                      <cylinderGeometry args={[0.175 * body, 0.16 * body, 0.16, 12]} />
                      <meshStandardMaterial color={PANT} roughness={0.82} />
                    </mesh>
                    <mesh position={[(footX + kneeX) / 2, (0.3 + kneeY) / 2 + 0.05, footZ * 0.5 + 0.02]} rotation={[0, 0, side * -0.08]}>
                      <cylinderGeometry args={[0.152 * body, 0.152 * body, 0.09, 12]} />
                      <meshStandardMaterial color={accent} roughness={0.7} />
                    </mesh>
                  </>
                )}
                {/* Knee cap */}
                <mesh position={[kneeX, kneeY, 0.04]} scale={[1, 0.9, 0.94]} castShadow>
                  <sphereGeometry args={[0.205 * body, 12, 9]} />
                  <meshStandardMaterial color={PANT} roughness={0.82} />
                </mesh>
                {/* Lead-shin guard (over the sock, facing the pitch) */}
                {isLead && look.legGuard && (
                  <StaticSegment
                    from={[footX - 0.02, 0.34, footZ - 0.1]}
                    to={[kneeX - 0.02, kneeY + 0.04, -0.07]}
                    radius={0.115}
                    color={GUARD}
                    roughness={0.4}
                  />
                )}
                {/* Cleats: toes point at the plate */}
                <group position={[footX, 0, footZ]} rotation={[0, isLead ? -look.openStance * 1.6 : side * 0.06, 0]}>
                  <mesh position={[0, 0.1, -0.1]} castShadow>
                    <boxGeometry args={[0.27 * body, 0.16, 0.56]} />
                    <meshStandardMaterial color={CLEAT} roughness={0.9} />
                  </mesh>
                  <mesh position={[0, 0.09, -0.4]} scale={[0.85, 0.55, 1]} castShadow>
                    <sphereGeometry args={[0.145 * body, 10, 8]} />
                    <meshStandardMaterial color={CLEAT} roughness={0.9} />
                  </mesh>
                  <mesh position={[0, 0.035, -0.12]}>
                    <boxGeometry args={[0.28 * body, 0.045, 0.6]} />
                    <meshStandardMaterial color="#e8e4da" roughness={0.85} />
                  </mesh>
                  <mesh position={[side * 0.14 * body, 0.12, -0.08]}>
                    <boxGeometry args={[0.012, 0.07, 0.4]} />
                    <meshStandardMaterial color={accent} roughness={0.6} />
                  </mesh>
                </group>
                {/* Ankle cuff: sock or long-pant break over the shoe */}
                <mesh position={[footX, 0.26, footZ]}>
                  <cylinderGeometry args={[0.16 * body, 0.17 * body, 0.14, 12]} />
                  <meshStandardMaterial color={look.highSocks ? jersey : PANT} roughness={0.82} />
                </mesh>
              </group>
            )
          })}

          {/* ---------- seat, belt, buckle, loops ---------- */}
          <mesh position={[0, hipY - 0.08, 0]} scale={[0.78 * body, 0.42, 0.52 * body]} castShadow>
            <sphereGeometry args={[0.62, 18, 12]} />
            <meshStandardMaterial color={PANT} roughness={0.82} />
          </mesh>
          {/* Belt hugs the torso's elliptical cross-section; buckle up front. */}
          <mesh position={[0, hipY + 0.18, 0]} scale={[1, 1, 0.84]}>
            <cylinderGeometry args={[0.435 * body, 0.435 * body, 0.11, 18]} />
            <meshStandardMaterial color="#171b22" roughness={0.62} />
          </mesh>
          <mesh position={[0, hipY + 0.18, -0.37 * body]}>
            <boxGeometry args={[0.14, 0.11, 0.05]} />
            <meshStandardMaterial color="#c8b070" metalness={0.65} roughness={0.3} />
          </mesh>

          {/* ---------- torso ---------- */}
          <group ref={torsoRef} position={[0, hipY + 0.17, 0]}>
            <mesh position={[0, torsoHeight * 0.48, 0]} scale={[body, 1, body * 0.82]} castShadow>
              <capsuleGeometry args={[0.42, Math.max(0.3, torsoHeight - 0.55), 6, 14]} />
              <meshStandardMaterial color={jersey} roughness={0.74} />
            </mesh>
            {/* Shoulder yoke + deltoid caps */}
            <mesh position={[0, torsoHeight * 0.78, 0]} scale={[1.28 * body + batter.build * 0.06, 0.34, 0.78 * body]} castShadow>
              <sphereGeometry args={[0.45, 16, 10]} />
              <meshStandardMaterial color={jersey} roughness={0.72} />
            </mesh>
            {[shoulderLead, shoulderBack].map((s, i) => (
              <mesh key={i} position={[s[0] * 1.12, s[1], s[2]]} castShadow>
                <sphereGeometry args={[0.165 * body, 12, 9]} />
                <meshStandardMaterial color={jersey} roughness={0.72} />
              </mesh>
            ))}
            {/* Button placket + buttons on the chest */}
            <mesh position={[0, torsoHeight * 0.45, -0.352 * body]} rotation={[0.02, 0, 0]}>
              <boxGeometry args={[0.035, torsoHeight * 0.74, 0.018]} />
              <meshStandardMaterial color="#f0f3f6" roughness={0.7} />
            </mesh>
            {[0.18, 0.36, 0.54, 0.72].map((f) => (
              <mesh key={f} position={[0, torsoHeight * f, -0.362 * body]}>
                <sphereGeometry args={[0.014, 8, 6]} />
                <meshStandardMaterial color="#cfd6dd" roughness={0.5} />
              </mesh>
            ))}
            {/* Chest wordmark + front number */}
            <JerseyText
              mirror={mirror}
              position={[0.02, torsoHeight * 0.62, -0.372 * body]}
              rotation={[0, Math.PI, 0]}
              fontSize={0.135}
              color={accent}
            >
              {HOME_TEAM.name.toUpperCase()}
            </JerseyText>
            <JerseyText
              mirror={mirror}
              position={[-0.16 * body, torsoHeight * 0.42, -0.368 * body]}
              rotation={[0, Math.PI, 0]}
              fontSize={0.12}
              color={accent}
            >
              {String(batter.number)}
            </JerseyText>
            {/* Nameplate + number on the back */}
            <JerseyText
              mirror={mirror}
              position={[0, torsoHeight * 0.68, 0.37 * body]}
              fontSize={nobSize}
              color="#f0f3f6"
            >
              {look.nameOnBack}
            </JerseyText>
            <JerseyText
              mirror={mirror}
              position={[0, torsoHeight * 0.44, 0.375 * body]}
              fontSize={0.34}
              color={accent}
            >
              {String(batter.number)}
            </JerseyText>
            {/* Collar + optional chain */}
            <mesh position={[0, torsoHeight + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.155, 0.032, 8, 16]} />
              <meshStandardMaterial color={accent} roughness={0.66} />
            </mesh>
            {look.chain && (
              <mesh position={[0, torsoHeight - 0.05, -0.12 * body]} rotation={[1.32, 0, 0]}>
                <torusGeometry args={[0.13, 0.013, 6, 18]} />
                <meshStandardMaterial color="#e8c35c" metalness={0.85} roughness={0.22} />
              </mesh>
            )}

            {/* ---------- head (yaws to face the pitcher / the umpire) ---------- */}
            <mesh position={[0, torsoHeight + 0.05, 0]}>
              <cylinderGeometry args={[0.15, 0.17, 0.24, 12]} />
              <meshStandardMaterial color={skin} roughness={0.72} />
            </mesh>
            <group ref={headRef} position={[0, torsoHeight + 0.18, 0]}>
              {/* Skull + jaw */}
              <mesh position={[0, 0.2, -0.01]} scale={[0.9, 1.08, 0.88]} castShadow>
                <sphereGeometry args={[0.28, 18, 14]} />
                <meshStandardMaterial color={skin} roughness={0.72} />
              </mesh>
              {/* Face: eyes, eye black, nose */}
              {[-0.09, 0.09].map((x) => (
                <mesh key={x} position={[x, 0.24, -0.235]}>
                  <sphereGeometry args={[0.026, 8, 6]} />
                  <meshStandardMaterial color="#12100e" roughness={0.35} />
                </mesh>
              ))}
              {look.eyeBlack && [-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, 0.175, -0.243]} rotation={[0.25, 0, x > 0 ? -0.18 : 0.18]}>
                  <boxGeometry args={[0.085, 0.028, 0.02]} />
                  <meshStandardMaterial color="#141210" roughness={0.9} />
                </mesh>
              ))}
              <mesh position={[0, 0.18, -0.27]} scale={[0.7, 1, 1]}>
                <sphereGeometry args={[0.045, 8, 6]} />
                <meshStandardMaterial color={skin} roughness={0.72} />
              </mesh>
              {/* Facial hair */}
              {look.beard === 'full' && (
                <mesh position={[0, 0.06, -0.045]} scale={[0.86, 0.66, 0.85]}>
                  <sphereGeometry args={[0.28, 14, 10]} />
                  <meshStandardMaterial color={look.hairColor} roughness={0.95} />
                </mesh>
              )}
              {look.beard === 'stubble' && (
                <mesh position={[0, 0.075, -0.04]} scale={[0.83, 0.56, 0.82]}>
                  <sphereGeometry args={[0.28, 14, 10]} />
                  <meshStandardMaterial color={stubble} roughness={0.95} />
                </mesh>
              )}
              {look.beard === 'goatee' && (
                <mesh position={[0, 0.06, -0.2]} scale={[0.42, 0.5, 0.35]}>
                  <sphereGeometry args={[0.16, 10, 8]} />
                  <meshStandardMaterial color={look.hairColor} roughness={0.95} />
                </mesh>
              )}
              {/* Hair peeking out under the shell */}
              <mesh position={[0, 0.13, 0.13]} scale={[0.85, 0.5, 0.72]}>
                <sphereGeometry args={[0.29, 14, 10]} />
                <meshStandardMaterial color={look.hairColor} roughness={0.95} />
              </mesh>
              {/* Batting helmet: gloss shell, brim, flap on the pitcher side, C-flap */}
              <mesh position={[0, 0.31, 0]} castShadow>
                <sphereGeometry args={[0.315, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
                <meshStandardMaterial color={jersey} roughness={0.24} metalness={0.22} />
              </mesh>
              <mesh position={[0, 0.25, -0.27]} scale={[1, 0.3, 1]}>
                <sphereGeometry args={[0.23, 14, 8]} />
                <meshStandardMaterial color={jersey} roughness={0.3} metalness={0.15} />
              </mesh>
              <mesh position={[-0.245, 0.16, -0.015]} scale={[0.22, 0.5, 0.42]} castShadow>
                <sphereGeometry args={[0.3, 12, 8]} />
                <meshStandardMaterial color={jersey} roughness={0.3} metalness={0.15} />
              </mesh>
              {look.jawGuard && (
                <mesh position={[-0.19, 0.05, -0.16]} rotation={[0.15, 0.5, 0.35]} scale={[0.16, 0.32, 0.5]}>
                  <sphereGeometry args={[0.28, 10, 8]} />
                  <meshStandardMaterial color={jersey} roughness={0.3} metalness={0.15} />
                </mesh>
              )}
              {/* Helmet logo dot */}
              <mesh position={[0, 0.34, -0.29]}>
                <sphereGeometry args={[0.05, 8, 6]} />
                <meshStandardMaterial color={accent} roughness={0.4} />
              </mesh>
            </group>

            {/* ---------- arms (posed imperatively via IK) ---------- */}
            {([leadArm, backArm] as const).map((armRef, i) => {
              const isLead = i === 0
              const sleeved = look.sleeve === 'both' || (look.sleeve === 'lead' && isLead)
              const foreColor = sleeved ? look.sleeveColor : skin
              return (
                <group key={i}>
                  <mesh name={isLead ? 'leadUpper' : 'backUpper'} ref={(m) => { armRef.current.upper = m }} castShadow>
                    <capsuleGeometry args={[0.135 * body, armLen.upper - 0.16, 5, 10]} />
                    <meshStandardMaterial color={jersey} roughness={0.74} />
                  </mesh>
                  <mesh name={isLead ? 'leadFore' : 'backFore'} ref={(m) => { armRef.current.fore = m }} castShadow>
                    <capsuleGeometry args={[0.1 * body, armLen.fore - 0.14, 5, 10]} />
                    <meshStandardMaterial color={foreColor} roughness={sleeved ? 0.68 : 0.72} />
                    {/* Lead-elbow guard rides the forearm bone */}
                    {isLead && look.armGuard && (
                      <mesh position={[0, armLen.fore * 0.32, -0.05]} scale={[1.15, 1.5, 1.25]}>
                        <sphereGeometry args={[0.115 * body, 10, 8]} />
                        <meshStandardMaterial color={GUARD} roughness={0.35} metalness={0.1} />
                      </mesh>
                    )}
                  </mesh>
                  <group name={isLead ? 'leadHand' : 'backHand'} ref={(grp) => { armRef.current.hand = grp }}>
                    {/* Batting glove */}
                    <mesh scale={[1.1, 1.35, 0.95]} castShadow>
                      <sphereGeometry args={[0.093, 10, 8]} />
                      <meshStandardMaterial color={look.gloveColor} roughness={0.62} />
                    </mesh>
                    <mesh position={[0, -0.07, 0]}>
                      <cylinderGeometry args={[0.075, 0.09, 0.07, 10]} />
                      <meshStandardMaterial color={accent} roughness={0.65} />
                    </mesh>
                    {look.wristbands && (
                      <mesh position={[0, -0.13, 0]}>
                        <cylinderGeometry args={[0.093, 0.093, 0.075, 10]} />
                        <meshStandardMaterial color={look.sleeveColor} roughness={0.8} />
                      </mesh>
                    )}
                  </group>
                </group>
              )
            })}

            {/* ---------- bat (finish varies per player) ---------- */}
            <group name="batPivot" ref={batPivotRef} position={pivotBase}>
              <mesh position={[1.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.105, 0.07, 2.5, 14]} />
                <meshStandardMaterial color={batWood} roughness={0.42} />
              </mesh>
              <mesh position={[0.32, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.068, 0.042, 0.95, 12]} />
                <meshStandardMaterial color={batHandleColor} roughness={0.5} />
              </mesh>
              {/* Pine-tar band + knob */}
              <mesh position={[0.62, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[0.072, 0.062, 0.28, 12]} />
                <meshStandardMaterial color="#573a1e" roughness={0.95} />
              </mesh>
              <mesh position={[-0.14, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[0.095, 0.095, 0.06, 12]} />
                <meshStandardMaterial color={look.batFinish === 'natural' ? '#8a6538' : '#1d1815'} roughness={0.58} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
