import {
  BALL_RADIUS_FT,
  BORDERLINE_IN,
  EFFECTIVE_HALF_WIDTH_FT,
  PLATE_DEPTH_FT,
  PLATE_HALF_WIDTH_FT,
} from './constants'

export interface BatterStance {
  /** Anatomical landmarks in the batter's prepared-to-swing stance. */
  shoulderTopIn: number
  pantsTopIn: number
  kneeHollowIn: number
  widthIn: number
}

export interface ZoneBatter {
  heightIn: number
  hand?: 'R' | 'L'
  stance?: BatterStance
}

export interface ZoneSpec {
  /** MLB rulebook bounds, feet above the ground. */
  topFt: number
  botFt: number
  /** Front-view conveniences. Exact truth uses the 3D pentagonal prism. */
  effTopFt: number
  effBotFt: number
  halfWidthFt: number
  effHalfWidthFt: number
  centerZFt: number
  halfHeightFt: number
}

/**
 * A neutral prepared stance for callers that only know height. Real lineup
 * batters carry measured/generated landmarks, so their individual posture wins.
 */
export function defaultStanceFor(heightIn: number): BatterStance {
  const crouchIn = heightIn * 0.12
  return {
    shoulderTopIn: heightIn * 0.82 - crouchIn,
    pantsTopIn: heightIn * 0.55 - crouchIn * 0.7,
    kneeHollowIn: heightIn * 0.275 - crouchIn * 0.14,
    widthIn: heightIn * 0.42,
  }
}

export function zoneFor(batter: number | ZoneBatter): ZoneSpec {
  const heightIn = typeof batter === 'number' ? batter : batter.heightIn
  const stance = typeof batter === 'number'
    ? defaultStanceFor(heightIn)
    : batter.stance ?? defaultStanceFor(heightIn)

  // Official Baseball Rules: upper limit is the midpoint between the top of
  // the shoulders and top of uniform pants; lower limit is the knee hollow.
  const topFt = ((stance.shoulderTopIn + stance.pantsTopIn) / 2) / 12
  const botFt = stance.kneeHollowIn / 12
  return {
    topFt,
    botFt,
    effTopFt: topFt + BALL_RADIUS_FT,
    effBotFt: botFt - BALL_RADIUS_FT,
    halfWidthFt: PLATE_HALF_WIDTH_FT,
    effHalfWidthFt: EFFECTIVE_HALF_WIDTH_FT,
    centerZFt: (topFt + botFt) / 2,
    halfHeightFt: (topFt - botFt) / 2,
  }
}

interface Point2 {
  x: number
  y: number
}

/** Home plate in game coordinates, clockwise from the pitcher's front edge. */
export const PLATE_POLYGON: readonly Point2[] = [
  { x: -PLATE_HALF_WIDTH_FT, y: 0 },
  { x: PLATE_HALF_WIDTH_FT, y: 0 },
  { x: PLATE_HALF_WIDTH_FT, y: -PLATE_HALF_WIDTH_FT },
  { x: 0, y: -PLATE_DEPTH_FT },
  { x: -PLATE_HALF_WIDTH_FT, y: -PLATE_HALF_WIDTH_FT },
]

function pointInConvexPolygon(x: number, y: number): boolean {
  let sign = 0
  for (let i = 0; i < PLATE_POLYGON.length; i++) {
    const a = PLATE_POLYGON[i]
    const b = PLATE_POLYGON[(i + 1) % PLATE_POLYGON.length]
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (Math.abs(cross) < 1e-12) continue
    const next = Math.sign(cross)
    if (sign && next !== sign) return false
    sign = next
  }
  return true
}

function pointSegmentDistance(x: number, y: number, a: Point2, b: Point2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const denom = dx * dx + dy * dy
  const t = denom ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / denom)) : 0
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t))
}

function footprintDistance(x: number, y: number): { signed: number; edgeDistance: number } {
  let edgeDistance = Infinity
  for (let i = 0; i < PLATE_POLYGON.length; i++) {
    edgeDistance = Math.min(
      edgeDistance,
      pointSegmentDistance(x, y, PLATE_POLYGON[i], PLATE_POLYGON[(i + 1) % PLATE_POLYGON.length]),
    )
  }
  return { signed: pointInConvexPolygon(x, y) ? -edgeDistance : edgeDistance, edgeDistance }
}

/** Signed distance from a ball center to the unexpanded rulebook zone volume. */
function signedDistanceToZone(x: number, y: number, z: number, zone: ZoneSpec): number {
  const footprint = footprintDistance(x, y)
  const outsideHorizontal = Math.max(footprint.signed, 0)
  const outsideVertical = z > zone.topFt ? z - zone.topFt : z < zone.botFt ? zone.botFt - z : 0

  if (outsideHorizontal > 0 || outsideVertical > 0) {
    return Math.hypot(outsideHorizontal, outsideVertical)
  }

  const verticalMargin = Math.min(zone.topFt - z, z - zone.botFt)
  return -Math.min(footprint.edgeDistance, verticalMargin)
}

export type ZoneEdge = 'inside' | 'outside' | 'high' | 'low'

export interface ZoneMetrics {
  /** Signed ball-to-zone clearance in inches. Negative means overlap/strike. */
  edgeDistIn: number
  /** Chebyshev-normalized location used by swing-decision simulation. */
  normDist: number
  nearestEdge: ZoneEdge
  strike: boolean
  /** Ball-center location at its closest approach to the 3D rulebook volume. */
  point: { x: number; y: number; z: number }
}

function edgeFor(x: number, y: number, z: number, zone: ZoneSpec, hand: 'R' | 'L'): ZoneEdge {
  const high = z - zone.topFt
  const low = zone.botFt - z
  const horizontal = footprintDistance(x, y).signed
  if (Math.max(high, low) > horizontal) return high >= low ? 'high' : 'low'
  const batterSideX = hand === 'R' ? -1 : 1
  return Math.sign(x || batterSideX) === batterSideX ? 'inside' : 'outside'
}

export function pointZoneMetrics(
  x: number,
  y: number,
  z: number,
  batter: ZoneBatter,
): ZoneMetrics {
  const zone = zoneFor(batter)
  const centerDistance = signedDistanceToZone(x, y, z, zone)
  const edgeDistIn = (centerDistance - BALL_RADIUS_FT) * 12
  const nx = Math.abs(x) / zone.effHalfWidthFt
  const nz = Math.abs(z - zone.centerZFt) / (zone.halfHeightFt + BALL_RADIUS_FT)
  return {
    edgeDistIn,
    normDist: Math.max(nx, nz),
    nearestEdge: edgeFor(x, y, z, zone, batter.hand ?? 'R'),
    strike: edgeDistIn <= 1e-8,
    point: { x, y, z },
  }
}

/** Exact sphere-vs-rulebook-volume test at a ball-center location. */
export function isStrike(x: number, y: number, z: number, batter: ZoneBatter): boolean {
  return pointZoneMetrics(x, y, z, batter).strike
}

interface ZoneTrajectory {
  p0: { x: number; y: number; z: number }
  v0: { x: number; y: number; z: number }
  a: { x: number; y: number; z: number }
  T: number
  catchT: number
}

const atTime = (traj: ZoneTrajectory, t: number) => ({
  x: traj.p0.x + traj.v0.x * t + 0.5 * traj.a.x * t * t,
  y: traj.p0.y + traj.v0.y * t + 0.5 * traj.a.y * t * t,
  z: traj.p0.z + traj.v0.z * t + 0.5 * traj.a.z * t * t,
})

function timeAtY(traj: ZoneTrajectory, targetY: number, fallback: number): number {
  const A = 0.5 * traj.a.y
  const B = traj.v0.y
  const C = traj.p0.y - targetY
  if (Math.abs(A) < 1e-10) return Math.max(0, Math.min(traj.catchT, -C / B))
  const disc = B * B - 4 * A * C
  if (disc < 0) return fallback
  const root = Math.sqrt(disc)
  const candidates = [(-B - root) / (2 * A), (-B + root) / (2 * A)]
    .filter((t) => t >= 0 && t <= traj.catchT)
  if (!candidates.length) return fallback
  return candidates.reduce((best, t) => Math.abs(t - fallback) < Math.abs(best - fallback) ? t : best)
}

/**
 * Evaluate the entire pitch over home plate. Dense bracketing plus local
 * minimization is sub-thousandth-inch stable for the app's trajectories.
 */
export function trajectoryZoneMetrics(traj: ZoneTrajectory, batter: ZoneBatter): ZoneMetrics {
  const zone = zoneFor(batter)
  let start = timeAtY(traj, BALL_RADIUS_FT, Math.max(0, traj.T - 0.03))
  let end = timeAtY(traj, -PLATE_DEPTH_FT - BALL_RADIUS_FT, Math.min(traj.catchT, traj.T + 0.04))
  if (end < start) [start, end] = [end, start]

  const clearance = (t: number) => {
    const p = atTime(traj, t)
    return signedDistanceToZone(p.x, p.y, p.z, zone) - BALL_RADIUS_FT
  }

  const samples = 96
  const step = (end - start) / samples
  let bestT = start
  let best = clearance(start)
  for (let i = 1; i <= samples; i++) {
    const t = start + step * i
    const d = clearance(t)
    if (d < best) {
      best = d
      bestT = t
    }
  }

  // Refine the best bracket. Distance to a convex prism along this tiny,
  // smooth trajectory segment is locally unimodal.
  let left = Math.max(start, bestT - step)
  let right = Math.min(end, bestT + step)
  for (let i = 0; i < 36; i++) {
    const a = left + (right - left) / 3
    const b = right - (right - left) / 3
    if (clearance(a) <= clearance(b)) right = b
    else left = a
  }
  bestT = (left + right) / 2
  const point = atTime(traj, bestT)
  best = clearance(bestT)

  const nx = Math.abs(point.x) / zone.effHalfWidthFt
  const nz = Math.abs(point.z - zone.centerZFt) / (zone.halfHeightFt + BALL_RADIUS_FT)
  return {
    edgeDistIn: best * 12,
    normDist: Math.max(nx, nz),
    nearestEdge: edgeFor(point.x, point.y, point.z, zone, batter.hand ?? 'R'),
    strike: best <= 1e-8,
    point,
  }
}

export const isBorderline = (edgeDistIn: number): boolean =>
  Math.abs(edgeDistIn) <= BORDERLINE_IN

const EDGE_WORD: Record<ZoneEdge, string> = {
  inside: 'inside',
  outside: 'off the outside edge',
  high: 'above the zone',
  low: 'below the knees',
}

/** One-line broadcast note for the replay card. */
export function describeTake(playerCalledStrike: boolean, metrics: ZoneMetrics): string {
  const d = Math.abs(metrics.edgeDistIn)
  const dTxt = `${d.toFixed(1)}\"`
  const correct = playerCalledStrike === metrics.strike
  if (correct) {
    if (metrics.strike) {
      if (isBorderline(metrics.edgeDistIn)) return `Caught the ${metrics.nearestEdge === 'high' || metrics.nearestEdge === 'low' ? metrics.nearestEdge + ' rail' : metrics.nearestEdge + ' corner'} by ${dTxt}. Elite call.`
      return 'Right through the zone. Too easy.'
    }
    if (isBorderline(metrics.edgeDistIn)) return `Held firm — that missed ${EDGE_WORD[metrics.nearestEdge]} by ${dTxt}.`
    return `Comfortably ${EDGE_WORD[metrics.nearestEdge]}. Easy take.`
  }
  if (metrics.strike) {
    if (isBorderline(metrics.edgeDistIn)) return `That clipped the zone by ${dTxt} — it should have been rung up.`
    return `That caught the plate by ${dTxt}. The pitcher wants that one back.`
  }
  if (isBorderline(metrics.edgeDistIn)) return `Just missed ${EDGE_WORD[metrics.nearestEdge]} by ${dTxt} — you expanded the zone.`
  return `That was ${dTxt} ${EDGE_WORD[metrics.nearestEdge]}. The dugout knows it.`
}
