import {
  CATCH_PLANE_Y_FT,
  G_FTPS2,
  MPH_TO_FTPS,
} from './constants'
import { PITCH_TYPES, type PitchTypeDef, type PitchTypeKey } from './pitchTypes'
import { clamp, lerp, type RNG } from './rng'
import {
  isBorderline,
  trajectoryZoneMetrics,
  zoneFor,
  type BatterStance,
  type ZoneMetrics,
} from './strikeZone'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Constant-acceleration flight: p(t) = p0 + v0·t + ½·a·t². */
export interface Trajectory {
  p0: Vec3
  v0: Vec3
  a: Vec3
  /** Time (s) at which the ball crosses y = 0 (front edge of the plate). */
  T: number
  /** Time (s) at which the ball reaches the catcher's mitt plane. */
  catchT: number
}

export interface PitchDescriptor {
  id: number
  typeKey: PitchTypeKey
  typeName: string
  short: string
  mph: number
  releaseSpeedMph: number
  ivbIn: number
  hbIn: number
  spinRpm: number
  /** Unit spin axis in game coords, for ball rendering. */
  spinAxis: Vec3
  traj: Trajectory
  /** Ball-center crossing point at y = 0 (front edge), retained for visuals. */
  cross: { x: number; z: number }
  /** Closest ball-center position to the 3D rulebook zone over home plate. */
  zonePoint: Vec3
  /** Where the pitcher wanted it (catcher sets up here). */
  intended: { x: number; z: number }
  metrics: ZoneMetrics
  truthStrike: boolean
  borderline: boolean
  wild: boolean
}

export function posAt(traj: Trajectory, t: number): Vec3 {
  const tc = clamp(t, 0, traj.catchT)
  return {
    x: traj.p0.x + traj.v0.x * tc + 0.5 * traj.a.x * tc * tc,
    y: traj.p0.y + traj.v0.y * tc + 0.5 * traj.a.y * tc * tc,
    z: traj.p0.z + traj.v0.z * tc + 0.5 * traj.a.z * tc * tc,
  }
}

export function velAt(traj: Trajectory, t: number): Vec3 {
  const tc = clamp(t, 0, traj.catchT)
  return {
    x: traj.v0.x + traj.a.x * tc,
    y: traj.v0.y + traj.a.y * tc,
    z: traj.v0.z + traj.a.z * tc,
  }
}

const finite = (...vals: number[]) => vals.every((v) => Number.isFinite(v))

export interface PitcherPhysique {
  hand: 'R' | 'L'
  veloOffsetMph: number
  commandMult: number
  releaseSideFt: number
  releaseHeightFt: number
  releaseYFt: number
  arsenal: ReadonlyArray<readonly [PitchTypeKey, number]>
  /** Stable Statcast-style shape for each pitch; optional for older room snapshots. */
  pitchProfiles?: Partial<Record<PitchTypeKey, PitchProfile>>
}

export interface PitchProfile {
  veloMph: number
  ivbIn: number
  /** Arm-side positive; glove-side negative. */
  hbIn: number
  spinRpm: number
}

export interface BatterPhysique {
  heightIn: number
  hand: 'R' | 'L'
  stance?: BatterStance
}

export interface PitchContext {
  balls: number
  strikes: number
  borderlineBias: number
  forced?: { typeKey: PitchTypeKey; loc: 'center' | 'edge' | 'chase' | 'wild' } | null
  /** A multiplayer pitcher's committed pitch, target, and timing-meter quality. */
  player?: {
    typeKey: PitchTypeKey
    target: { u: number; v: number }
    commandQuality: number
  } | null
}

function choosePitchType(rng: RNG, pitcher: PitcherPhysique, ctx: PitchContext): PitchTypeDef {
  if (ctx.player) return PITCH_TYPES[ctx.player.typeKey]
  if (ctx.forced) return PITCH_TYPES[ctx.forced.typeKey]
  const ahead = ctx.strikes > ctx.balls || ctx.strikes === 2
  const behind = ctx.balls > ctx.strikes && ctx.balls >= 2
  const entries = pitcher.arsenal.map(([key, w]) => {
    const def = PITCH_TYPES[key]
    let weight = w
    if (ahead && def.breaking) weight *= 1.55
    if (behind && def.breaking) weight *= 0.5
    if (ctx.balls === 3 && ctx.strikes === 0 && def.breaking) weight *= 0.15
    return [def, weight] as const
  })
  return rng.weighted(entries)
}

interface AimResult {
  x: number
  z: number
  wild: boolean
}

/** Pick a target, add command error, optionally steer toward an edge. */
function chooseCrossingPoint(
  rng: RNG,
  def: PitchTypeDef,
  pitcher: PitcherPhysique,
  batter: BatterPhysique,
  ctx: PitchContext,
): AimResult & { intended: { x: number; z: number } } {
  const zone = zoneFor(batter)
  const awaySign = batter.hand === 'R' ? 1 : -1
  const ahead = ctx.strikes > ctx.balls || ctx.strikes === 2
  const behind = ctx.balls > ctx.strikes

  // Intended target in normalized zone units (u horizontal, v vertical; ±1 = zone edge).
  let u: number
  let v: number
  if (ctx.player) {
    u = clamp(ctx.player.target.u, -1.5, 1.5)
    v = clamp(ctx.player.target.v, -1.5, 1.5)
  } else if (ctx.forced) {
    const loc = ctx.forced.loc
    if (loc === 'center') { u = 0; v = 0 }
    else if (loc === 'edge') { u = rng.pick([-0.95, 0.95]); v = rng.range(-0.9, 0.6) }
    else if (loc === 'chase') { u = awaySign * 1.35; v = -1.3 }
    else { u = awaySign * 2.2; v = rng.range(-0.5, 0.5) }
  } else if (behind && ctx.balls >= 2) {
    u = rng.gauss(0, 0.38)
    v = rng.gauss(-0.05, 0.4)
  } else if (ahead) {
    // Work the edges / bury breaking stuff.
    if (def.breaking && rng.chance(0.62)) {
      u = awaySign * rng.range(0.55, 1.25)
      v = rng.range(-1.5, -0.55)
    } else {
      u = rng.pick([awaySign, -awaySign]) * rng.range(0.7, 1.05)
      v = rng.pick([rng.range(0.55, 1.05), rng.range(-1.05, -0.5)])
    }
  } else {
    u = rng.gauss(0, 0.62)
    v = rng.gauss(-0.08, 0.58)
  }

  const intended = {
    x: u * zone.halfWidthFt,
    z: zone.centerZFt + v * zone.halfHeightFt,
  }

  const quality = clamp(ctx.player?.commandQuality ?? 1, 0, 1)
  const wild = ctx.player
    ? quality < 0.12 && rng.chance(0.35)
    : !ctx.forced && rng.chance(0.04)
  const commandScale = ctx.player ? lerp(2.4, 0.45, quality) : 1
  const sigma = 0.21 * def.wildness * pitcher.commandMult * commandScale * (wild ? 3.2 : 1)
  let x = intended.x + rng.gauss(0, sigma)
  let z = intended.z + rng.gauss(0, sigma * 1.1)

  // Steer a share of pitches right onto an edge so calls stay interesting.
  if (!wild && !ctx.forced && !ctx.player && rng.chance(ctx.borderlineBias)) {
    const edge = rng.weighted([
      ['low', 0.34],
      ['away', 0.27],
      ['in', 0.21],
      ['high', 0.18],
    ] as const)
    const off = rng.gauss(0, 1.9 / 12) // hug the boundary within ~2 inches
    if (edge === 'low') {
      z = zone.effBotFt + off
      x = rng.range(-0.7, 0.7) * zone.halfWidthFt
    } else if (edge === 'high') {
      z = zone.effTopFt + off
      x = rng.range(-0.7, 0.7) * zone.halfWidthFt
    } else {
      const sideSign = edge === 'away' ? awaySign : -awaySign
      x = sideSign * (zone.effHalfWidthFt + off)
      z = zone.centerZFt + rng.range(-0.75, 0.75) * zone.halfHeightFt
    }
  }

  const xLimit = wild ? 2.9 : 1.8
  x = clamp(x, -xLimit, xLimit)
  z = clamp(z, 0.35, wild ? 5.4 : 4.7)
  return { x, z, wild, intended }
}

let nextPitchId = 1

export function generatePitch(
  rng: RNG,
  pitcher: PitcherPhysique,
  batter: BatterPhysique,
  ctx: PitchContext,
): PitchDescriptor {
  const def = choosePitchType(rng, pitcher, ctx)
  const profile = pitcher.pitchProfiles?.[def.key]
  // A pitcher's shape is stable; individual offerings vary modestly around it.
  // Legacy/test pitchers without profiles retain the original full-band sampling.
  const mph = clamp(
    (profile ? rng.gauss(profile.veloMph, 0.65) : rng.range(def.velo[0], def.velo[1])) + pitcher.veloOffsetMph,
    68,
    104,
  )
  const ivbIn = profile
    ? clamp(rng.gauss(profile.ivbIn, 0.85), def.ivb[0], def.ivb[1])
    : rng.range(def.ivb[0], def.ivb[1])
  const hbArmSideIn = profile
    ? clamp(rng.gauss(profile.hbIn, 0.95), def.hb[0], def.hb[1])
    : rng.range(def.hb[0], def.hb[1])
  // Arm-side movement points toward -x for a RHP (catcher's-view convention).
  const hbIn = (pitcher.hand === 'R' ? -1 : 1) * hbArmSideIn
  const spinRpm = profile
    ? clamp(rng.gauss(profile.spinRpm, 75), def.spinRpm[0], def.spinRpm[1])
    : rng.range(def.spinRpm[0], def.spinRpm[1])

  const aim = chooseCrossingPoint(rng, def, pitcher, batter, ctx)
  const pc: Vec3 = { x: aim.x, y: 0, z: aim.z }

  const p0: Vec3 = {
    x: (pitcher.hand === 'R' ? -1 : 1) * (pitcher.releaseSideFt + rng.gauss(0, 0.12)),
    y: pitcher.releaseYFt + rng.gauss(0, 0.2),
    z: pitcher.releaseHeightFt + rng.gauss(0, 0.09),
  }

  const v0Mag = mph * MPH_TO_FTPS
  const T = p0.y / (v0Mag * 0.93)
  const T2 = T * T

  const a: Vec3 = {
    x: (2 * (hbIn / 12)) / T2,
    y: 0.09 * v0Mag / T, // drag: opposes the (negative-y) motion
    z: -G_FTPS2 + (2 * (ivbIn / 12)) / T2,
  }

  const v0: Vec3 = {
    x: (pc.x - p0.x - 0.5 * a.x * T2) / T,
    y: (pc.y - p0.y - 0.5 * a.y * T2) / T,
    z: (pc.z - p0.z - 0.5 * a.z * T2) / T,
  }

  // Continue the flight to the mitt plane behind the plate.
  let catchT = T * 1.06
  const c = p0.y - CATCH_PLANE_Y_FT
  const disc = v0.y * v0.y - 2 * a.y * c
  if (disc > 0 && Math.abs(a.y) > 1e-6) {
    const t1 = (-v0.y - Math.sqrt(disc)) / a.y
    if (Number.isFinite(t1) && t1 > T && t1 < T * 1.5) catchT = t1
  }

  const releaseSpeedMph = Math.hypot(v0.x, v0.y, v0.z) / MPH_TO_FTPS

  const spinAxis = spinAxisFor(def, hbIn)
  const traj = { p0, v0, a, T, catchT }
  const metrics = trajectoryZoneMetrics(traj, batter)

  const pitch: PitchDescriptor = {
    id: nextPitchId++,
    typeKey: def.key,
    typeName: def.name,
    short: def.short,
    mph,
    releaseSpeedMph,
    ivbIn,
    hbIn,
    spinRpm,
    spinAxis,
    traj,
    cross: { x: pc.x, z: pc.z },
    zonePoint: metrics.point,
    intended: aim.intended,
    metrics,
    truthStrike: metrics.strike,
    borderline: isBorderline(metrics.edgeDistIn),
    wild: aim.wild,
  }

  if (
    !finite(T, catchT, p0.x, p0.y, p0.z, v0.x, v0.y, v0.z, a.x, a.y, a.z, pc.x, pc.z) ||
    T <= 0.2 || T > 1.2
  ) {
    // Never let a bad sample reach the renderer — throw a safe center fastball.
    return generatePitch(rng, pitcher, batter, {
      balls: 0, strikes: 0, borderlineBias: 0,
      forced: { typeKey: 'fourseam', loc: 'center' },
    })
  }
  return pitch
}

function spinAxisFor(def: PitchTypeDef, hbIn: number): Vec3 {
  const side = Math.sign(hbIn) || 1
  let axis: Vec3
  switch (def.spin) {
    case 'back': axis = { x: 1, y: 0, z: 0.25 * -side }; break
    case 'top': axis = { x: -1, y: 0, z: 0.2 * side }; break
    case 'gyro': axis = { x: 0.35, y: -1, z: 0.3 * -side }; break
    case 'side': axis = { x: 0.15, y: -0.35, z: -side }; break
  }
  const m = Math.hypot(axis.x, axis.y, axis.z) || 1
  return { x: axis.x / m, y: axis.y / m, z: axis.z / m }
}

/** Simple ballistic trajectory for batted / deflected balls (visual flavor only). */
export function battedTrajectory(from: Vec3, v: Vec3, seconds: number): Trajectory {
  return {
    p0: { ...from },
    v0: { ...v },
    a: { x: 0, y: -0.06 * Math.abs(v.y), z: -G_FTPS2 },
    T: seconds,
    catchT: seconds,
  }
}
