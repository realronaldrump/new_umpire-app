import type { PitcherPhysique, PitchProfile } from './physics'
import { PITCH_TYPES, type PitchTypeKey } from './pitchTypes'
import { clamp, createRng, type RNG } from './rng'
import type { BatterStance } from './strikeZone'

export interface TeamDef {
  city: string
  name: string
  abbr: string
  primary: string
  accent: string
}

/** Canonical full team label for matchup and venue displays. */
export const teamFullName = (team: TeamDef): string => `${team.city} ${team.name}`


export const HOME_TEAM: TeamDef = {
  city: 'Ronald', name: 'Rumps', abbr: 'RUM',
  primary: '#123b5c', accent: '#3fd9c4',
}
export const AWAY_TEAM: TeamDef = {
  city: 'Michelle Obama', name: 'is a Mans', abbr: 'MOM',
  primary: '#3a3d47', accent: '#ff7a45',
}

/**
 * Purely cosmetic kit + mannerisms that make each hitter read as a specific
 * big-leaguer instead of a mannequin. Never consulted by game logic.
 */
export interface BatterLook {
  /** High-cuffed pants showing team socks vs. long pants over the cleats. */
  highSocks: boolean
  /** Compression sleeve under the jersey: on the lead arm, both, or none. */
  sleeve: 'none' | 'lead' | 'both'
  sleeveColor: string
  /** Protective elbow guard on the lead arm. */
  armGuard: boolean
  /** Shin guard on the lead leg. */
  legGuard: boolean
  wristbands: boolean
  /** C-flap jaw extension on the helmet. */
  jawGuard: boolean
  gloveColor: string
  beard: 'none' | 'stubble' | 'goatee' | 'full'
  hairColor: string
  eyeBlack: boolean
  chain: boolean
  batFinish: 'natural' | 'black' | 'twoTone'
  /** Lead foot pulled off the plate line (ft), 0 = square stance. */
  openStance: number
  /** Resting bat tilt offset (rad) — flat bats vs. straight-up hands. */
  batAngle: number
  /** Hands carried higher/lower than standard (ft). */
  handsHeight: number
  /** Idle bat-waggle amplitude (0 statue … 1.6 windmill) and speed (Hz). */
  waggle: number
  waggleHz: number
  nameOnBack: string
}

export interface BatterDef {
  id: number
  name: string
  hand: 'R' | 'L'
  heightIn: number
  /** Rulebook anatomical landmarks in this hitter's prepared stance. */
  stance: BatterStance
  /** Visual body variation, −1 lean … +1 stocky. */
  build: number
  skinTone: string
  number: number
  /** −1 free swinger … +1 extremely patient. */
  discipline: number
  /** −1 poor bat-to-ball … +1 elite contact. */
  contact: number
  /** −1 slap hitter … +1 big power. */
  power: number
  avgLabel: string
  order: number
  /** Optional: multiplayer rooms created before looks shipped omit it. */
  look?: BatterLook
}

export interface PitcherDef extends PitcherPhysique {
  name: string
  number: number
}

// Fictional baseball-name riffs on recognizable current U.S. political figures.
const PLAYER_NAMES = [
  'Donald Slugger Trump', 'J.D. Vance', 'Ted Cruzer', 'Marjorie Taylor Greene-Light',
  'Bernie Sand-ers', 'Alexandria Ocasio-Contact', 'Jasmine Crockett', 'Ilhan O-Mar',
  'Ron DeStrikeis', 'Gavin Newswing', 'Elizabeth Warren', 'Rand Ball',
  'Chuck Schumaker', 'Mike Johnson', 'Josh Hawley', 'Cory Booker',
  'Tom Cotton', 'Adam Shift', 'Marco Rub-IO', 'Amy Klobuchar',
  'John Fetterman', 'Kristi Noem', 'Ayanna Pressley', 'Ro Khanna',
  'Rashida Tlaib',
]

const SKIN_TONES = ['#59371f', '#6f452f', '#8b5b3d', '#a96f50', '#c58e6d', '#dfb08d', '#eec39e']
const HAIR_COLORS = ['#151210', '#241a12', '#33241a', '#4a3320', '#6b4a2a', '#8a6740']
const GLOVE_COLORS = ['#f4f6f8', '#8f2637', '#15181d', '#f5b942']

/** Jersey nameplate: last name token, hyphens preserved ("GREENE-LIGHT"). */
export const nameOnBack = (name: string): string =>
  (name.trim().split(/\s+/).pop() ?? name).toUpperCase()

/**
 * Cosmetic look for one hitter. Uses its own seeded stream so game-affecting
 * rolls (stance, ratings, pitch sequences) are untouched for existing seeds.
 */
function generateLook(rng: RNG, name: string): BatterLook {
  return {
    highSocks: rng.chance(0.45),
    sleeve: rng.weighted([['none', 0.4], ['lead', 0.35], ['both', 0.25]] as const),
    sleeveColor: rng.weighted([[HOME_TEAM.primary, 0.45], [HOME_TEAM.accent, 0.3], ['#14171c', 0.25]] as const),
    armGuard: rng.chance(0.55),
    legGuard: rng.chance(0.3),
    wristbands: rng.chance(0.5),
    jawGuard: rng.chance(0.28),
    gloveColor: rng.pick(GLOVE_COLORS),
    beard: rng.weighted([['none', 0.33], ['stubble', 0.26], ['goatee', 0.16], ['full', 0.25]] as const),
    hairColor: rng.pick(HAIR_COLORS),
    eyeBlack: rng.chance(0.36),
    chain: rng.chance(0.42),
    batFinish: rng.weighted([['natural', 0.45], ['black', 0.3], ['twoTone', 0.25]] as const),
    openStance: rng.chance(0.3) ? rng.range(0.08, 0.24) : 0,
    batAngle: rng.range(-0.22, 0.3),
    handsHeight: rng.range(-0.09, 0.13),
    waggle: rng.range(0.25, 1.5),
    waggleHz: rng.range(0.55, 1.15),
    nameOnBack: nameOnBack(name),
  }
}

/** Deterministic stand-in for lineups serialized before looks existed. */
export function lookFor(batter: Pick<BatterDef, 'look' | 'name' | 'number'>): BatterLook {
  return batter.look ?? generateLook(createRng(`look-fallback:${batter.name}:${batter.number}`), batter.name)
}

function uniqueName(rng: RNG, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const name = rng.pick(PLAYER_NAMES)
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  const fallback = `${rng.pick(PLAYER_NAMES)} Jr.`
  used.add(fallback)
  return fallback
}

export function generateLineup(rng: RNG): BatterDef[] {
  const used = new Set<string>()
  const lineup: BatterDef[] = []
  for (let i = 0; i < 9; i++) {
    const heightIn = Math.round(clamp(rng.gauss(73, 2.1), 68, 77))
    const avg = clamp(rng.gauss(0.258, 0.028), 0.185, 0.33)
    const crouchIn = clamp(rng.gauss(8.9, 1.05), 6.7, 11.4)
    const stance: BatterStance = {
      // These ground-relative landmarks are the source of truth for both the
      // rendered body and the zone. They deliberately vary beyond raw height.
      shoulderTopIn: heightIn * 0.82 - crouchIn,
      pantsTopIn: heightIn * 0.55 - crouchIn * 0.7,
      kneeHollowIn: heightIn * 0.275 - crouchIn * 0.14,
      widthIn: clamp(rng.gauss(30.5, 4.6), 22, 42),
    }
    const name = uniqueName(rng, used)
    const hand: 'R' | 'L' = rng.chance(0.62) ? 'R' : 'L'
    lineup.push({
      id: i,
      name,
      hand,
      heightIn,
      stance,
      build: clamp(rng.gauss(0, 0.55), -1, 1),
      skinTone: rng.pick(SKIN_TONES),
      number: 1 + rng.int(98),
      discipline: clamp(rng.gauss(0, 0.5), -1, 1),
      contact: clamp(rng.gauss(0, 0.5), -1, 1),
      power: clamp(rng.gauss(0, 0.55), -1, 1),
      avgLabel: avg.toFixed(3).replace(/^0/, ''),
      order: i + 1,
      look: generateLook(rng.fork(`look:${i}`), name),
    })
  }
  return lineup
}

export function generateCloser(rng: RNG): PitcherDef {
  const used = new Set<string>()
  const hand: 'R' | 'L' = rng.chance(0.72) ? 'R' : 'L'
  const primary = rng.weighted([
    ['fourseam', 0.56], ['sinker', 0.33], ['cutter', 0.11],
  ] as const)
  const secondFastball = rng.weighted(
    (['fourseam', 'sinker', 'cutter'] as const)
      .filter((key) => key !== primary)
      .map((key) => [key, key === 'fourseam' ? 0.55 : key === 'sinker' ? 0.48 : 0.38] as const),
  )
  const primaryBreaker = rng.weighted([
    ['slider', 0.42], ['sweeper', 0.24], ['curveball', 0.17],
    ['slurve', 0.1], ['knucklecurve', 0.07],
  ] as const)
  const offspeed = rng.weighted([['changeup', 0.7], ['splitter', 0.3]] as const)
  const keys: PitchTypeKey[] = [primary, primaryBreaker, secondFastball, offspeed]

  const hasFive = rng.chance(0.55)
  if (hasFive) {
    const curveFamily = new Set<PitchTypeKey>(['curveball', 'knucklecurve'])
    const breakingCandidates = ([
      ['slider', 0.34], ['sweeper', 0.26], ['curveball', 0.18],
      ['slurve', 0.14], ['knucklecurve', 0.08],
    ] as const).filter(([key]) => (
      !keys.includes(key) &&
      !(curveFamily.has(primaryBreaker) && curveFamily.has(key))
    ))
    keys.push(rng.weighted(breakingCandidates))
  }

  // Modern pitch mixes are broader and more balanced, while the primary
  // fastball remains the most frequent offering.
  const weights = hasFive ? [0.34, 0.22, 0.18, 0.15, 0.11] : [0.38, 0.25, 0.21, 0.16]
  const arsenal: Array<readonly [PitchTypeKey, number]> = keys.map((key, i) => [key, weights[i]])
  const pitchProfiles: Partial<Record<PitchTypeKey, PitchProfile>> = {}
  for (const key of keys) {
    const def = PITCH_TYPES[key]
    const sampleBand = (band: readonly [number, number]): number => {
      const middle = (band[0] + band[1]) / 2
      return clamp(rng.gauss(middle, (band[1] - band[0]) / 5.5), band[0], band[1])
    }
    pitchProfiles[key] = {
      veloMph: sampleBand(def.velo),
      ivbIn: sampleBand(def.ivb),
      hbIn: sampleBand(def.hb),
      spinRpm: sampleBand(def.spinRpm),
    }
  }
  const veloOffsetMph = clamp(rng.gauss(0.8, 1.1), -2, 3.2)
  const specialtyPitch = rng.weighted([
    ['knuckleball', 0.28], ['eephus', 0.22], [null, 0.5],
  ] as const)
  return {
    name: uniqueName(rng, used),
    number: 11 + rng.int(88),
    hand,
    veloOffsetMph, // closers run hot
    commandMult: rng.range(0.9, 1.22),
    releaseSideFt: rng.range(1.3, 2.15),
    releaseHeightFt: rng.range(5.3, 6.3),
    releaseYFt: rng.range(53.2, 54.2),
    arsenal,
    specialtyPitch,
    pitchProfiles,
  }
}

export const heightLabel = (heightIn: number): string =>
  `${Math.floor(heightIn / 12)}'${heightIn % 12}"`
