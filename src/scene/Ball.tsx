import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BALL_RADIUS_FT } from '../game/constants'
import { ballStateAt, useGame } from '../store/game'
import { ballTexture } from './textures'

const TRAIL_N = 26

export function Ball() {
  const ballRef = useRef<THREE.Mesh>(null)
  const trailRef = useRef<THREE.InstancedMesh>(null)
  const spinAngle = useRef(0)
  const lastSpinT = useRef(0)
  const lastPitchId = useRef(-1)
  const history = useRef<THREE.Vector3[]>(
    Array.from({ length: TRAIL_N }, () => new THREE.Vector3(0, -50, 0)),
  )
  const tex = ballTexture()

  const spinAxisScene = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const tmpM = useMemo(() => new THREE.Matrix4(), [])
  const tmpQ = useMemo(() => new THREE.Quaternion(), [])
  const tmpS = useMemo(() => new THREE.Vector3(), [])
  const tmpC = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const ball = ballRef.current
    const trail = trailRef.current
    if (!ball || !trail) return
    const now = performance.now()
    const state = ballStateAt(now)
    const g = useGame.getState()
    const pitch = g.active?.pitch

    if (!state || !pitch) {
      ball.visible = false
      hideTrail(trail, tmpM)
      return
    }

    if (pitch.id !== lastPitchId.current) {
      lastPitchId.current = pitch.id
      spinAngle.current = 0
      lastSpinT.current = 0
      spinAxisScene.set(pitch.spinAxis.x, pitch.spinAxis.z, -pitch.spinAxis.y).normalize()
      for (const v of history.current) v.set(pitch.traj.p0.x, pitch.traj.p0.z, -pitch.traj.p0.y)
    }

    ball.visible = state.visible
    ball.position.set(state.pos.x, state.pos.z, -state.pos.y)

    // Spin (visually damped so the seams stay readable).
    const dt = Math.max(0, state.spinT - lastSpinT.current)
    lastSpinT.current = state.spinT
    spinAngle.current += dt * (pitch.spinRpm / 60) * Math.PI * 2 * 0.32
    ball.quaternion.setFromAxisAngle(spinAxisScene, spinAngle.current)

    // Trail ribbon.
    if (state.trailing && state.visible) {
      const h = history.current
      const last = h[h.length - 1]
      h.shift()
      last.copy(ball.position)
      h.push(last)
      for (let i = 0; i < TRAIL_N; i++) {
        const p = h[i]
        const k = i / (TRAIL_N - 1) // 0 oldest … 1 newest
        const r = BALL_RADIUS_FT * (0.25 + 0.75 * k)
        tmpM.compose(p, tmpQ.identity(), tmpS.setScalar(r))
        trail.setMatrixAt(i, tmpM)
        tmpC.setScalar(0.02 + 0.3 * k * k)
        trail.setColorAt(i, tmpC)
      }
      trail.instanceMatrix.needsUpdate = true
      if (trail.instanceColor) trail.instanceColor.needsUpdate = true
      trail.visible = true
    } else {
      hideTrail(trail, tmpM)
      for (const v of history.current) v.copy(ball.position)
    }
  })

  return (
    <group>
      <mesh ref={ballRef} visible={false} castShadow>
        <sphereGeometry args={[BALL_RADIUS_FT, 20, 16]} />
        <meshStandardMaterial map={tex} roughness={0.42} emissive="#ffffff" emissiveIntensity={0.06} />
      </mesh>
      <instancedMesh ref={trailRef} args={[undefined, undefined, TRAIL_N]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}

function hideTrail(trail: THREE.InstancedMesh, m: THREE.Matrix4): void {
  if (!trail.visible) return
  trail.visible = false
  m.makeScale(0, 0, 0)
  for (let i = 0; i < TRAIL_N; i++) trail.setMatrixAt(i, m)
  trail.instanceMatrix.needsUpdate = true
}
