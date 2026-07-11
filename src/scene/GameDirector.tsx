import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useGame } from '../store/game'

declare global {
  interface Window {
    __scene?: unknown
    __cam?: unknown
  }
}

/** Drives the game clock from the render loop; all logic lives in the store. */
export function GameDirector() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    window.__scene = scene
    window.__cam = camera
  }, [scene, camera])
  useFrame(() => {
    useGame.getState().tick(performance.now())
  })
  return null
}
