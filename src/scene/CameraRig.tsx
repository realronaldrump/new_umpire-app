import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { ballStateAt, useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { multiplayerRole, useMultiplayer } from '../multiplayer/store'
import { shakeAt } from './fx'

declare global {
  interface Window {
    /** Debug: pin the camera anywhere — `__freecam = { pos: [x,y,z], look: [x,y,z] }`. */
    __freecam?: { pos: [number, number, number]; look: [number, number, number] } | null
  }
}

type ShotKind = 'menu' | 'pov' | 'pitcher' | 'final'

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * The camera director. Behind the title screen it flies a slow orbit of the
 * park; on PLAY BALL it swoops down into the umpire's eyes (in the slot over
 * the catcher's shoulder); after the last out it drifts up for the wide shot.
 * Every change of shot is a smooth eased blend from wherever the camera is.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const swayAmp = useRef(1)
  const slotX = useRef(-0.8)
  const follow = useRef(0)
  const shot = useRef<ShotKind | null>(null)
  const blend = useRef({ start: 0, dur: 1, fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), fromFov: 55 })
  const cur = useRef({ pos: new THREE.Vector3(0, 120, 300), look: new THREE.Vector3(0, 10, -120), fov: 42 })
  const tgt = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55 })
  const tmp = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const g = useGame.getState()
    if (g.orbit) return // debug OrbitControls owns the camera
    const free = window.__freecam
    if (free) {
      camera.position.set(...free.pos)
      camera.lookAt(...free.look)
      return
    }
    const s = useSettings.getState()
    const now = performance.now()
    const t = now / 1000
    const dt = Math.min(0.05, delta)

    // Which shot does the game want?
    let kind: ShotKind = 'pov'
    const mp = useMultiplayer.getState()
    if (g.mode === 'multiplayer') {
      if (mp.open && (!mp.snapshot || mp.snapshot.status === 'lobby')) kind = 'menu'
      else if (multiplayerRole(mp.snapshot, mp.playerId) === 'pitcher') kind = 'pitcher'
    } else if (g.phase === 'menu') kind = 'menu'
    else if (g.phase === 'inningOver') kind = 'final'
    if (g.mode === 'single' && mp.open) kind = 'menu'

    const target = tgt.current
    if (kind === 'menu') {
      // Slow orbit around the park, gently rising and falling.
      // Stays inside the bowl: centred on the infield, radius clears the stands.
      const a = t * 0.045 + 0.6
      const r = 205 + Math.sin(t * 0.07) * 18
      target.pos.set(Math.sin(a) * r, 78 + Math.sin(t * 0.11) * 26, -150 + Math.cos(a) * r)
      target.look.set(Math.sin(a + Math.PI) * 60, 22, -150 + Math.cos(a + Math.PI) * 60)
      target.fov = 44
    } else if (kind === 'final') {
      const a = t * 0.03
      target.pos.set(Math.sin(a) * 60, 42 + Math.sin(t * 0.2) * 3, 70 + Math.cos(a) * 20)
      target.look.set(0, 8, -160)
      target.fov = 48
    } else if (kind === 'pitcher') {
      const handOffset = g.pitcher.hand === 'R' ? 1.25 : -1.25
      target.pos.set(handOffset, 8.2, -75)
      target.look.set(0, 2.6, 0)
      target.fov = 48
    } else {
      const batter = g.active?.batter ?? g.lineup[g.sit.batterIdx]
      const targetSlot = (batter?.hand === 'L' ? 1 : -1) * s.slotOffset
      slotX.current += (targetSlot - slotX.current) * Math.min(1, dt * 2.2)

      const steady = g.phase === 'flight' || g.phase === 'call' || g.phase === 'windup'
      const targetAmp = steady ? 0 : 1
      swayAmp.current += (targetAmp - swayAmp.current) * Math.min(1, dt * (steady ? 6 : 1.4))
      const amp = swayAmp.current
      const sx = (Math.sin(t * 0.61) * 0.028 + Math.sin(t * 1.31 + 1.7) * 0.014) * amp
      const sy = (Math.sin(t * 0.83 + 0.6) * 0.02 + Math.sin(t * 1.7) * 0.009) * amp
      const sz = Math.sin(t * 0.47 + 2.1) * 0.012 * amp
      target.pos.set(slotX.current + sx, s.camHeight + sy, s.camBack + sz)
      target.look.set(slotX.current * 0.55 + sx * 0.4, s.camHeight - 3.0 + sy * 0.5, -10)
      target.fov = s.camFov

      // The umpire's head turns to follow a ball put in play.
      let want = 0
      if (g.phase === 'swingResult' && g.active?.hitTraj) {
        const b = ballStateAt(now)
        if (b && b.visible) {
          const bz = -b.pos.y
          if (bz < target.pos.z - 6) {
            want = 0.62
            tmp.current.set(b.pos.x, b.pos.z, bz)
          }
        }
      }
      follow.current += (want - follow.current) * Math.min(1, dt * (want > 0 ? 3.2 : 1.6))
      if (follow.current > 0.001) {
        target.look.lerp(tmp.current, follow.current)
      }
    }

    // Start a new blend whenever the shot changes.
    if (shot.current !== kind) {
      const b = blend.current
      b.start = now
      b.dur = shot.current === null ? 1 : shot.current === 'menu' && kind === 'pov' ? 2600 : 1800
      b.fromPos.copy(shot.current === null ? target.pos : cur.current.pos)
      b.fromLook.copy(shot.current === null ? target.look : cur.current.look)
      b.fromFov = shot.current === null ? target.fov : cur.current.fov
      shot.current = kind
    }
    const b = blend.current
    const k = easeInOut(Math.min(1, (now - b.start) / b.dur))
    const c = cur.current
    if (k < 1) {
      // Arc the path upward mid-flight so shot changes feel like a crane move.
      c.pos.lerpVectors(b.fromPos, target.pos, k)
      c.pos.y += Math.sin(k * Math.PI) * Math.min(40, b.fromPos.distanceTo(target.pos) * 0.08)
      c.look.lerpVectors(b.fromLook, target.look, k)
      c.fov = b.fromFov + (target.fov - b.fromFov) * k
    } else {
      c.pos.copy(target.pos)
      c.look.copy(target.look)
      c.fov = target.fov
    }

    camera.position.copy(c.pos)
    // Impact shake (mitt pop, bat crack) — subtle, and optional.
    if (s.cameraShake && kind === 'pov') {
      const amp = shakeAt(now)
      if (amp > 0.0005) {
        camera.position.x += Math.sin(now * 0.09) * amp
        camera.position.y += Math.sin(now * 0.113 + 1.3) * amp * 0.8
      }
    }
    if (Math.abs(camera.fov - c.fov) > 0.01) {
      camera.fov = c.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(c.look)
  })

  return null
}
