/**
 * Ballpark layout, in game coordinates (feet): home plate at the origin, +y
 * toward the mound, +x toward first base. Bearings φ are measured from
 * straightaway center field, positive toward right field.
 */
export const DEG = Math.PI / 180
export const FOUL_ANGLE = 45 * DEG
export const BASE_DIST = 90
export const FIRST_BASE = { x: 63.64, y: 63.64 }
export const SECOND_BASE = { x: 0, y: 127.28 }
export const THIRD_BASE = { x: -63.64, y: 63.64 }
/** Batter's-eye half width (no seats straight away center). */
export const BATTERS_EYE_HALF = 9 * DEG

/** Normalize an angle into (−π, π]. */
export const wrap = (a: number): number => {
  let v = a % (Math.PI * 2)
  if (v <= -Math.PI) v += Math.PI * 2
  if (v > Math.PI) v -= Math.PI * 2
  return v
}

/** Outfield fence distance on bearing φ: 330 down the lines, 400 to center. */
export function wallR(phi: number): number {
  const a = Math.min(1, Math.abs(wrap(phi)) / FOUL_ANGLE)
  return 400 - 70 * Math.pow(a, 1.6)
}

/** Fence height: tall in center, shorter down the lines. */
export function wallH(phi: number): number {
  const a = Math.min(1, Math.abs(wrap(phi)) / FOUL_ANGLE)
  return 11 - 3 * a
}

/** Front-row (field-facing) edge of the lower seating bowl on bearing φ. */
export function standR(phi: number): number {
  const a = Math.abs(wrap(phi))
  if (a <= FOUL_ANGLE) return wallR(phi) + 12
  const offLine = Math.sin(Math.min(Math.PI - 0.02, a - FOUL_ANGLE))
  let r = Math.min(wallR(FOUL_ANGLE) + 12, 58 / Math.max(0.02, offLine))
  // Tuck the seats in behind home: ~64 ft back to the backstop wall.
  if (a > 140 * DEG) r = Math.min(r, 64 + (180 * DEG - a) * 22)
  return r
}

/** Smoothed standR so the bowl has no kinks where the curves meet. */
export function standRSmooth(phi: number): number {
  const k = 3 * DEG
  return (standR(phi - 2 * k) + standR(phi - k) * 2 + standR(phi) * 3 + standR(phi + k) * 2 + standR(phi + 2 * k)) / 9
}

export const polarXY = (phi: number, r: number): { x: number; y: number } => ({
  x: r * Math.sin(phi),
  y: r * Math.cos(phi),
})

/** Scene-space [x, y, z] for bearing φ, radius r, height h. */
export const polarScene = (phi: number, r: number, h: number): [number, number, number] => [
  r * Math.sin(phi),
  h,
  -r * Math.cos(phi),
]

/** Standard defensive alignment (game coords, ft) — away team in the field. */
export const FIELDER_SPOTS: ReadonlyArray<{ key: string; x: number; y: number }> = [
  { key: '1B', x: 72, y: 84 },
  { key: '2B', x: 44, y: 142 },
  { key: 'SS', x: -44, y: 140 },
  { key: '3B', x: -74, y: 82 },
  { key: 'LF', x: -176, y: 262 },
  { key: 'CF', x: 0, y: 318 },
  { key: 'RF', x: 176, y: 262 },
]
