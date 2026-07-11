import type { PitchDescriptor } from './physics'
import { PITCH_TYPES } from './pitchTypes'
import { clamp, plerp, type RNG } from './rng'
import type { BatterDef } from './roster'

export interface SwingPlan {
  swings: boolean
  hbp: boolean
  swingProb: number
}

export interface Count {
  balls: number
  strikes: number
}

export type ContactQuality = 'weak' | 'medium' | 'hard'
export type OutType = 'ground' | 'fly' | 'line' | 'pop'

export type SwingOutcome =
  | { kind: 'whiff' }
  | { kind: 'foul' }
  | {
      kind: 'inPlay'
      quality: ContactQuality
      bases: 0 | 1 | 2 | 3 | 4
      outType?: OutType
      text: string
    }

const SWING_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.78],
  [0.45, 0.74],
  [1.0, 0.55],
  [1.15, 0.34],
  [1.45, 0.14],
  [1.8, 0.05],
  [2.4, 0.025],
]

export function decideSwing(
  rng: RNG,
  batter: BatterDef,
  pitch: PitchDescriptor,
  count: Count,
): SwingPlan {
  // Hit-by-pitch: only pitches that run well onto the batter's side.
  const batterSideX = batter.hand === 'R' ? -1 : 1
  const towardBatter = pitch.cross.x * batterSideX
  if (towardBatter > 1.95 && pitch.cross.z > 0.8 && pitch.cross.z < 5.6) {
    return { swings: false, hbp: rng.chance(0.72), swingProb: 0 }
  }

  const d = pitch.metrics.normDist
  let p = plerp(SWING_CURVE, d)

  if (count.balls === 0 && count.strikes === 0) p *= 0.7
  if (count.strikes === 2) {
    if (d < 1.3) p = p + (1 - p) * 0.5
    else if (d < 1.55) p += 0.22
  }
  if (count.balls === 3 && count.strikes === 0) p *= d < 0.4 ? 0.4 : 0.06
  else if ((count.balls === 2 && count.strikes === 0) || (count.balls === 3 && count.strikes === 1)) {
    if (d > 0.75) p *= 0.5
  }

  const def = PITCH_TYPES[pitch.typeKey]
  if (def.breaking && d > 0.95 && d < 1.5) p += 0.09
  if (d > 1) p *= 1 - 0.32 * batter.discipline
  if (d < 0.6 && batter.discipline < 0) p += 0.05 * -batter.discipline

  p = clamp(p, 0.02, 0.97)
  return { swings: rng.chance(p), hbp: false, swingProb: p }
}

const WHIFF_BASE: Record<string, number> = {
  fourseam: 0.19, sinker: 0.14, cutter: 0.2, slider: 0.32,
  sweeper: 0.34, slurve: 0.32, curveball: 0.3, knucklecurve: 0.33,
  changeup: 0.28, splitter: 0.34,
}

const FIELD_SPOTS = ['short', 'second', 'third', 'first'] as const
const OUTFIELD = ['left', 'center', 'right'] as const

export function resolveSwing(
  rng: RNG,
  batter: BatterDef,
  pitch: PitchDescriptor,
  count: Count,
): SwingOutcome {
  const d = pitch.metrics.normDist
  const def = PITCH_TYPES[pitch.typeKey]

  let whiff = WHIFF_BASE[pitch.typeKey] ?? 0.22
  whiff += (pitch.mph - (def.velo[0] + def.velo[1]) / 2) * 0.008
  if (d < 0.5) whiff *= 0.6
  else if (d > 1.4) whiff *= 2.0
  else if (d > 1.0) whiff *= 1.6
  whiff *= 1 - 0.3 * batter.contact
  if (rng.chance(clamp(whiff, 0.05, 0.78))) return { kind: 'whiff' }

  let foulP = 0.44
  if (d > 0.9) foulP += 0.12
  if (count.strikes === 2) foulP += 0.06
  if (rng.chance(clamp(foulP, 0.2, 0.64))) return { kind: 'foul' }

  // Fair ball: grade the contact.
  let hardP = 0.18 + (d < 0.4 ? 0.2 : 0) + 0.13 * batter.power - (def.breaking ? 0.06 : 0)
  let weakP = 0.3 + (d > 0.9 ? 0.16 : 0) - 0.08 * batter.contact
  hardP = clamp(hardP, 0.05, 0.6)
  weakP = clamp(weakP, 0.08, 0.6)
  const roll = rng.next()
  const quality: ContactQuality = roll < hardP ? 'hard' : roll < hardP + weakP ? 'weak' : 'medium'

  return battedBall(rng, batter, quality)
}

function battedBall(rng: RNG, batter: BatterDef, quality: ContactQuality): SwingOutcome {
  const spot = rng.pick(FIELD_SPOTS)
  const of = rng.pick(OUTFIELD)

  if (quality === 'weak') {
    if (rng.chance(0.76)) {
      const ground = rng.chance(0.7)
      return {
        kind: 'inPlay', quality, bases: 0,
        outType: ground ? 'ground' : 'pop',
        text: ground ? `chopped to ${spot}` : `popped up on the infield`,
      }
    }
    return { kind: 'inPlay', quality, bases: 1, text: `bleeds a soft single into ${of}` }
  }

  if (quality === 'medium') {
    const r = rng.next()
    if (r < 0.56) {
      const style = rng.weighted([['ground', 0.45], ['fly', 0.35], ['line', 0.2]] as const)
      const text =
        style === 'ground' ? `grounded to ${spot}` :
        style === 'fly' ? `flied out to ${of}` : `lined out to ${spot}`
      return { kind: 'inPlay', quality, bases: 0, outType: style, text }
    }
    if (r < 0.88) return { kind: 'inPlay', quality, bases: 1, text: `singles to ${of}` }
    return { kind: 'inPlay', quality, bases: 2, text: `doubles into the ${of === 'center' ? 'gap' : of + '-field corner'}` }
  }

  // hard
  const hrP = clamp(0.11 + 0.13 * batter.power, 0.06, 0.3)
  const r = rng.next()
  if (r < hrP) return { kind: 'inPlay', quality, bases: 4, text: `CRUSHES one over the ${of}-field wall` }
  if (r < hrP + 0.26) {
    const style = rng.chance(0.6) ? 'line' : 'fly'
    return {
      kind: 'inPlay', quality, bases: 0, outType: style,
      text: style === 'line' ? `smoked, but right at ${spot}` : `drives ${of} to the track — caught`,
    }
  }
  if (r < hrP + 0.26 + 0.33) return { kind: 'inPlay', quality, bases: 1, text: `rips a single through ${spot === 'short' || spot === 'third' ? 'the left side' : 'the right side'}` }
  if (r < hrP + 0.26 + 0.33 + 0.22) return { kind: 'inPlay', quality, bases: 2, text: `laces a double down the ${of === 'center' ? 'gap' : of + ' line'}` }
  return { kind: 'inPlay', quality, bases: 3, text: `splits the outfielders — he's in with a triple` }
}

/**
 * ABS challenge (single-player Legend): after the umpire rings up a called
 * strike, does this hitter tap his helmet? He knows roughly where the pitch
 * was, not exactly — egregious misses are near-automatic challenges, close
 * balls likely ones, and close true strikes tempt desperate wasted taps.
 * Ball calls are never challenged; they already favor the batting side.
 */
export function decideChallenge(
  rng: RNG,
  batter: BatterDef,
  pitch: PitchDescriptor,
  count: Count,
  challengesLeft: number,
): boolean {
  if (challengesLeft <= 0) return false
  const edge = pitch.metrics.edgeDistIn // >0: ball by that many inches; <0: strike overlap
  const wouldBeK = count.strikes === 2

  if (!pitch.truthStrike) {
    // The umpire missed. Confidence scales with how badly.
    let p = edge > 3 ? 0.96 : 0.5 + edge * 0.14
    p += 0.22 * Math.max(0, batter.discipline)
    if (wouldBeK) p += 0.18
    return rng.chance(clamp(p, 0.35, 0.985))
  }

  // Correct strike call: only pitches that shaved the zone tempt a challenge.
  if (edge < -2.2) return false
  let p = 0.1 + (1 + edge / 2.2) * 0.15
  p += 0.15 * Math.max(0, -batter.discipline)
  if (wouldBeK) p += 0.2
  return rng.chance(clamp(p, 0, 0.5))
}

/**
 * ABS challenge (single-player Legend): after a called ball, does the battery
 * ask for the robot zone? The catcher and pitcher read obvious missed strikes
 * well, can be tempted by a pitch just off the edge, and get more aggressive
 * when ball four is at stake.
 */
export function decideBatteryChallenge(
  rng: RNG,
  pitch: PitchDescriptor,
  count: Count,
  challengesLeft: number,
): boolean {
  if (challengesLeft <= 0) return false
  const edge = pitch.metrics.edgeDistIn // >0: ball by that many inches; <0: strike overlap
  const wouldBeWalk = count.balls === 3

  if (pitch.truthStrike) {
    let p = 0.58 + Math.min(0.34, Math.max(0, -edge) * 0.11)
    if (wouldBeWalk) p += 0.16
    return rng.chance(clamp(p, 0.5, 0.985))
  }

  // A close miss can still look like a strike from the mound or the crouch.
  if (edge > 2.4) return false
  let p = 0.08 + (1 - Math.max(0, edge) / 2.4) * 0.2
  if (wouldBeWalk) p += 0.12
  return rng.chance(clamp(p, 0, 0.42))
}
