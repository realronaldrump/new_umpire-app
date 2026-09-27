import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BALL_RADIUS_FT } from '../game/constants'
import { posAt } from '../game/physics'
import { PITCH_COLORS } from '../game/pitchColors'
import { ballStateAt, useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { mitt } from './mitt'
import { ballTexture, glowTexture } from './textures'

const TRAIL_N = 44

const _side = new THREE.Vector3()
const _tan = new THREE.Vector3()
const _view = new THREE.Vector3()

export function Ball() {
  const ballRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Sprite>(null)
  const spinAngle = useRef(0)
  const lastSpinT = useRef(0)
  const lastPitchId = useRef(-1)
  const history = useRef<THREE.Vector3[]>(Array.from({ length: TRAIL_N }, () => new THREE.Vector3(0, -50, 0)))
  const camera = useThree((s) => s.camera)
  const tex = ballTexture()
  const spinAxisScene = useMemo(() => new THREE.Vector3(1, 0, 0), [])

  // Ribbon trail: 2 verts per history point, RGBA vertex colours for the fade.
  const trail = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(TRAIL_N * 2 * 3)
    const col = new Float32Array(TRAIL_N * 2 * 4)
    const idx: number[] = []
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage))
    geo.setIndex(idx)
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.renderOrder = 3
    return mesh
  }, [])
  useEffect(() => () => {
    trail.geometry.dispose()
    ;(trail.material as THREE.Material).dispose()
  }, [trail])

  useFrame(() => {
    const ball = ballRef.current
    const glow = glowRef.current
    if (!ball || !glow) return
    const now = performance.now()
    const state = ballStateAt(now)
    const g = useGame.getState()
    const pitch = g.active?.pitch

    if (!state || !pitch) {
      ball.visible = false
      glow.visible = false
      trail.visible = false
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
    // Once caught, the ball lives in the pocket and rides with the mitt.
    if (!state.trailing && state.visible && mitt.valid && !g.active?.hitTraj) {
      ball.position.set(mitt.pos.x, mitt.pos.y + 0.02, mitt.pos.z - 0.1)
    }
    glow.visible = state.visible && state.trailing
    glow.position.copy(ball.position)
    const night = useSettings.getState().nightGame
    ;(glow.material as THREE.SpriteMaterial).opacity = night ? 0.55 : 0.3

    const dt = Math.max(0, state.spinT - lastSpinT.current)
    lastSpinT.current = state.spinT
    spinAngle.current += dt * (pitch.spinRpm / 60) * Math.PI * 2 * 0.32
    ball.quaternion.setFromAxisAngle(spinAxisScene, spinAngle.current)

    if (state.trailing && state.visible) {
      const h = history.current
      const last = h[0]
      h.shift()
      last.copy(ball.position)
      h.push(last)
      const pos = trail.geometry.getAttribute('position') as THREE.BufferAttribute
      const col = trail.geometry.getAttribute('color') as THREE.BufferAttribute
      const tint = night ? [1, 0.97, 0.9] : [1, 1, 1]
      for (let i = 0; i < TRAIL_N; i++) {
        const p = h[i]
        const k = i / (TRAIL_N - 1)
        const prev = h[Math.max(0, i - 1)]
        const next = h[Math.min(TRAIL_N - 1, i + 1)]
        _tan.copy(next).sub(prev)
        if (_tan.lengthSq() < 1e-8) _tan.set(0, 0, 1)
        _view.copy(camera.position).sub(p)
        _side.crossVectors(_tan, _view).normalize()
        const w = BALL_RADIUS_FT * (0.15 + 1.05 * k * k)
        pos.setXYZ(i * 2, p.x + _side.x * w, p.y + _side.y * w, p.z + _side.z * w)
        pos.setXYZ(i * 2 + 1, p.x - _side.x * w, p.y - _side.y * w, p.z - _side.z * w)
        const a = Math.pow(k, 1.6) * 0.62
        for (const v of [i * 2, i * 2 + 1]) col.setXYZW(v, tint[0] * a, tint[1] * a, tint[2] * a, a)
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      trail.visible = true
    } else {
      trail.visible = false
      for (const v of history.current) v.copy(ball.position)
    }
  })

  return (
    <group>
      <mesh ref={ballRef} visible={false} castShadow>
        <sphereGeometry args={[BALL_RADIUS_FT, 28, 20]} />
        <meshStandardMaterial map={tex} roughness={0.5} emissive="#ffffff" emissiveIntensity={0.08} />
      </mesh>
      <sprite ref={glowRef} scale={[0.9, 0.9, 1]} visible={false}>
        <spriteMaterial map={glowTexture()} color="#fff4de" blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.5} toneMapped={false} />
      </sprite>
      <primitive object={trail} />
      <PitchTracer />
    </group>
  )
}

/**
 * After the call: the full flight path redrawn as a glowing broadcast
 * tracer in the pitch type's colour, plus a pulse where it crossed the zone.
 */
function PitchTracer() {
  const meshRef = useRef<THREE.Mesh>(null)
  const markRef = useRef<THREE.Mesh>(null)
  const builtFor = useRef(-1)
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const mesh = meshRef.current
    const mark = markRef.current
    if (!mesh || !mark) return
    const g = useGame.getState()
    const a = g.active
    const show = g.phase === 'reveal' && a && !a.hitTraj && g.reveal
    if (!show || !a) {
      mesh.visible = false
      mark.visible = false
      return
    }
    const pitch = a.pitch
    if (builtFor.current !== pitch.id) {
      builtFor.current = pitch.id
      // Release → the front of the plate (the zone), not into the mitt, so
      // the tracer doesn't balloon right in front of the umpire's face.
      const pts: THREE.Vector3[] = []
      const n = 40
      const endT = Math.max(0.05, pitch.traj.T - 0.012)
      for (let i = 0; i <= n; i++) {
        const p = posAt(pitch.traj, (endT * i) / n)
        pts.push(new THREE.Vector3(p.x, p.z, -p.y))
      }
      const curve = new THREE.CatmullRomCurve3(pts)
      mesh.geometry.dispose()
      mesh.geometry = new THREE.TubeGeometry(curve, 120, 0.06, 10, false)
      material.color.set(PITCH_COLORS[pitch.typeKey])
      mark.position.set(pitch.zonePoint.x, pitch.zonePoint.z, -pitch.zonePoint.y)
    }
    const since = performance.now() - g.phaseStart
    const draw = Math.min(1, since / 650)
    const eased = 1 - Math.pow(1 - draw, 3)
    const idx = mesh.geometry.getIndex()
    if (idx) mesh.geometry.setDrawRange(0, Math.floor((idx.count / 6) * eased) * 6)
    const fadeOut = Math.min(1, Math.max(0, (g.phaseDur - since) / 400))
    material.opacity = 0.85 * fadeOut
    mesh.visible = true
    mark.visible = draw > 0.95
    const pulse = 1 + Math.sin(since / 110) * 0.12
    mark.scale.setScalar(pulse)
    ;(mark.material as THREE.MeshBasicMaterial).opacity = 0.9 * fadeOut
    ;(mark.material as THREE.MeshBasicMaterial).color.set(pitch.truthStrike ? '#f5b942' : '#7fd4ff')
  })

  return (
    <group>
      <mesh ref={meshRef} material={material} visible={false} renderOrder={4} frustumCulled={false}>
        <bufferGeometry />
      </mesh>
      <mesh ref={markRef} visible={false} renderOrder={5}>
        <torusGeometry args={[BALL_RADIUS_FT * 1.9, 0.012, 8, 32]} />
        <meshBasicMaterial transparent depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
