import { clamp } from '../game/rng'
import type { PitchExecution } from './protocol'

export interface GesturePoint {
  /** Pointer coordinates normalized to the gesture surface. */
  x: number
  y: number
  t: number
}

export const GESTURE_START = { x: 0.5, y: 0.62 } as const
export const GESTURE_LOAD_Y = 0.8
export const GESTURE_RELEASE = { x: 0.5, y: 0.16 } as const

/**
 * Scores a load-then-drive delivery. Endpoint error becomes a directional
 * miss; path wobble and backtracking widen the pitch's random command error.
 */
export function evaluatePitchGesture(points: readonly GesturePoint[]): PitchExecution | null {
  if (points.length < 3) return null

  let loadIndex = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].y > points[loadIndex].y) loadIndex = i
  }
  if (points[loadIndex].y < GESTURE_LOAD_Y || loadIndex >= points.length - 1) return null

  const drive = points.slice(loadIndex)
  const release = drive[drive.length - 1]
  if (release.y > 0.42) return null

  const load = drive[0]
  const dx = release.x - load.x
  const dy = release.y - load.y
  const pathLength = Math.hypot(dx, dy) || 1
  let deviation = 0
  let backtrack = 0

  for (let i = 1; i < drive.length; i++) {
    const p = drive[i]
    // Perpendicular distance from the ideal straight line between load/release.
    deviation += Math.abs(dy * (p.x - load.x) - dx * (p.y - load.y)) / pathLength
    backtrack += Math.max(0, p.y - drive[i - 1].y)
  }

  const samples = Math.max(1, drive.length - 1)
  const smoothness = clamp(1 - deviation / samples * 4.2 - backtrack * 2.4, 0.12, 1)
  const endpointError = Math.hypot(
    (release.x - GESTURE_RELEASE.x) / 0.38,
    (release.y - GESTURE_RELEASE.y) / 0.34,
  )
  const endpointQuality = clamp(1 - endpointError, 0.08, 1)
  const quality = clamp(endpointQuality * (0.55 + 0.45 * smoothness), 0.05, 1)

  return {
    quality,
    miss: {
      u: clamp((release.x - GESTURE_RELEASE.x) * 1.55, -0.7, 0.7),
      v: clamp((GESTURE_RELEASE.y - release.y) * 1.55, -0.7, 0.7),
    },
  }
}

export function normalizedPointer(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): GesturePoint {
  return {
    x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    t: performance.now(),
  }
}
