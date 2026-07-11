import type { PitcherPhysique } from './physics'
import type { PitchTypeKey } from './pitchTypes'
import { clamp, type RNG } from './rng'
import type { BatterStance } from './strikeZone'

export interface TeamDef {
  city: string
  name: string
  abbr: string
  primary: string
  accent: string
}


export const HOME_TEAM: TeamDef = {
  city: 'Ronald', name: 'Rumps', abbr: 'RUM',
  primary: '#123b5c', accent: '#3fd9c4',
}
export const AWAY_TEAM: TeamDef = {
  city: 'Michelle Obama', name: 'is a Mans', abbr: 'MOM',
  primary: '#3a3d47', accent: '#ff7a45',
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
    lineup.push({
      id: i,
      name: uniqueName(rng, used),
      hand: rng.chance(0.62) ? 'R' : 'L',
      heightIn,
      stance,
      build: clamp(rng.gauss(0, 0.55), -1, 1),
      skinTone: rng.pick(['#6f452f', '#8b5b3d', '#a96f50', '#c58e6d', '#dfb08d']),
      number: 1 + rng.int(98),
      discipline: clamp(rng.gauss(0, 0.5), -1, 1),
      contact: clamp(rng.gauss(0, 0.5), -1, 1),
      power: clamp(rng.gauss(0, 0.55), -1, 1),
      avgLabel: avg.toFixed(3).replace(/^0/, ''),
      order: i + 1,
    })
  }
  return lineup
}

export function generateCloser(rng: RNG): PitcherDef {
  const used = new Set<string>()
  const hand: 'R' | 'L' = rng.chance(0.72) ? 'R' : 'L'
  const primary: PitchTypeKey = rng.chance(0.68) ? 'fourseam' : 'sinker'
  const secondary = rng.pick(['slider', 'cutter', 'sweeper'] as const)
  const tertiary = rng.pick(['curveball', 'changeup', 'splitter'] as const)
  const arsenal: Array<readonly [PitchTypeKey, number]> = [
    [primary, 0.48],
    [secondary, 0.32],
    [tertiary, 0.2],
  ]
  if (rng.chance(0.35)) {
    const fourth = rng.pick(['changeup', 'curveball', 'splitter', 'sweeper'] as const)
    if (!arsenal.some(([k]) => k === fourth)) arsenal.push([fourth, 0.09])
  }
  return {
    name: uniqueName(rng, used),
    number: 11 + rng.int(88),
    hand,
    veloOffsetMph: clamp(rng.gauss(0.8, 1.1), -2, 3.2), // closers run hot
    commandMult: rng.range(0.9, 1.22),
    releaseSideFt: rng.range(1.3, 2.15),
    releaseHeightFt: rng.range(5.3, 6.3),
    releaseYFt: rng.range(53.2, 54.2),
    arsenal,
  }
}

export const heightLabel = (heightIn: number): string =>
  `${Math.floor(heightIn / 12)}'${heightIn % 12}"`
