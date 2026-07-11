import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { multiplayerRole, useMultiplayer } from '../multiplayer/store'

declare global {
  interface Window {
    /** Debug: pin the camera anywhere — `__freecam = { pos: [x,y,z], look: [x,y,z] }`. */
    __freecam?: { pos: [number, number, number]; look: [number, number, number] } | null
  }
}

/**
 * The umpire's eyes: in the slot over the catcher's shoulder, toward the
 * batter's inside edge. Micro-sway keeps it alive between pitches and locks
 * rock-steady during the pitch and the call.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const swayAmp = useRef(1)
  const slotX = useRef(-0.8)
  const look = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const g = useGame.getState()
    if (g.orbit) return // debug OrbitControls owns the camera
    const free = window.__freecam
    if (free) {
      camera.position.set(...free.pos)
      look.current.set(...free.look)
      camera.lookAt(look.current)
      return
    }
    const s = useSettings.getState()

    if (g.mode === 'multiplayer') {
      const multiplayer = useMultiplayer.getState()
      if (multiplayerRole(multiplayer.snapshot, multiplayer.playerId) === 'pitcher') {
        if (camera.fov !== 48) {
          camera.fov = 48
          camera.updateProjectionMatrix()
        }
        const handOffset = g.pitcher.hand === 'R' ? 1.25 : -1.25
        camera.position.lerp(new THREE.Vector3(handOffset, 8.2, -75), Math.min(1, delta * 3.4))
        look.current.set(0, 2.6, 0)
        camera.lookAt(look.current)
        return
      }
    }

    if (camera.fov !== s.camFov) {
      camera.fov = s.camFov
      camera.updateProjectionMatrix()
    }

    const batter = g.active?.batter ?? g.lineup[g.sit.batterIdx]
    // Slot = toward the batter (inside corner side).
    const targetSlot = (batter?.hand === 'L' ? 1 : -1) * s.slotOffset
    slotX.current += (targetSlot - slotX.current) * Math.min(1, delta * 2.2)

    const steady = g.phase === 'flight' || g.phase === 'call' || g.phase === 'windup'
    const targetAmp = steady ? 0 : 1
    swayAmp.current += (targetAmp - swayAmp.current) * Math.min(1, delta * (steady ? 6 : 1.4))

    const t = performance.now() / 1000
    const amp = swayAmp.current
    const sx = (Math.sin(t * 0.61) * 0.028 + Math.sin(t * 1.31 + 1.7) * 0.014) * amp
    const sy = (Math.sin(t * 0.83 + 0.6) * 0.02 + Math.sin(t * 1.7) * 0.009) * amp
    const sz = Math.sin(t * 0.47 + 2.1) * 0.012 * amp

    camera.position.set(slotX.current + sx, s.camHeight + sy, s.camBack + sz)
    look.current.set(slotX.current * 0.55 + sx * 0.4, s.camHeight - 3.0 + sy * 0.5, -10)
    camera.lookAt(look.current)
  })

  return null
}
