export type PitchTypeKey =
  | 'fourseam'
  | 'sinker'
  | 'cutter'
  | 'slider'
  | 'sweeper'
  | 'slurve'
  | 'curveball'
  | 'knucklecurve'
  | 'changeup'
  | 'splitter'
  | 'knuckleball'
  | 'eephus'

export type SpinStyle = 'back' | 'top' | 'gyro' | 'side' | 'flutter'

export interface PitchTypeDef {
  key: PitchTypeKey
  name: string
  short: string
  /** Release velocity band, mph. */
  velo: readonly [number, number]
  /** Induced vertical break, inches (positive = fights gravity). */
  ivb: readonly [number, number]
  /** Horizontal break, inches, arm-side positive (sign flips with pitcher hand). */
  hb: readonly [number, number]
  spinRpm: readonly [number, number]
  spin: SpinStyle
  /** Command-noise multiplier (breaking stuff is harder to locate). */
  wildness: number
  /** Considered offspeed/breaking for batter-deception logic. */
  breaking: boolean
}

/**
 * Velocity/IVB/HB bands use pitch-count-weighted 10th–90th percentile pitcher
 * averages from Baseball Savant's 2025 Pitch Movement leaderboard (minimum 50
 * thrown). Knuckle curves follow MLB's spike-curve description because Savant
 * did not publish a qualifying KC row in that leaderboard.
 * Horizontal signs are expressed from the pitcher's perspective here:
 * arm-side positive, glove-side negative.
 */
export const PITCH_TYPES: Record<PitchTypeKey, PitchTypeDef> = {
  fourseam: {
    key: 'fourseam', name: 'Four-Seam Fastball', short: 'FF',
    velo: [91.8, 97.4], ivb: [12.6, 18.5], hb: [3.4, 12.1], spinRpm: [2100, 2600],
    spin: 'back', wildness: 1.0, breaking: false,
  },
  sinker: {
    key: 'sinker', name: 'Sinker', short: 'SI',
    velo: [90.7, 97], ivb: [2.9, 12.9], hb: [12.9, 17.7], spinRpm: [1900, 2450],
    spin: 'back', wildness: 1.05, breaking: false,
  },
  cutter: {
    key: 'cutter', name: 'Cutter', short: 'FC',
    velo: [86.5, 92.8], ivb: [4.3, 12.2], hb: [-4.8, -0.6], spinRpm: [2200, 2750],
    spin: 'gyro', wildness: 1.1, breaking: false,
  },
  slider: {
    key: 'slider', name: 'Slider', short: 'SL',
    velo: [83.5, 89.1], ivb: [-2.1, 6], hb: [-7.4, -1.2], spinRpm: [2200, 2900],
    spin: 'gyro', wildness: 1.3, breaking: true,
  },
  sweeper: {
    key: 'sweeper', name: 'Sweeper', short: 'ST',
    velo: [78.7, 86.1], ivb: [-3.2, 5.2], hb: [-16.9, -10.1], spinRpm: [2300, 3000],
    spin: 'side', wildness: 1.38, breaking: true,
  },
  slurve: {
    key: 'slurve', name: 'Slurve', short: 'SV',
    velo: [79, 84], ivb: [-8.3, -0.8], hb: [-16.6, -7.1], spinRpm: [2300, 2950],
    spin: 'top', wildness: 1.4, breaking: true,
  },
  curveball: {
    key: 'curveball', name: 'Curveball', short: 'CU',
    velo: [75.9, 85], ivb: [-15.8, -4.2], hb: [-14.8, -3.2], spinRpm: [2350, 3100],
    spin: 'top', wildness: 1.42, breaking: true,
  },
  knucklecurve: {
    key: 'knucklecurve', name: 'Knuckle Curve', short: 'KC',
    velo: [76, 83], ivb: [-17, -8], hb: [-11, -2.5], spinRpm: [2250, 3000],
    spin: 'top', wildness: 1.46, breaking: true,
  },
  changeup: {
    key: 'changeup', name: 'Changeup', short: 'CH',
    velo: [80.3, 89.8], ivb: [-0.2, 9.8], hb: [11.3, 17.1], spinRpm: [1450, 2150],
    spin: 'back', wildness: 1.22, breaking: true,
  },
  splitter: {
    key: 'splitter', name: 'Splitter', short: 'FS',
    velo: [83, 90.9], ivb: [-0.9, 8.9], hb: [7.4, 14.9], spinRpm: [950, 1750],
    spin: 'back', wildness: 1.32, breaking: true,
  },
  knuckleball: {
    key: 'knuckleball', name: 'Knuckleball', short: 'KN',
    velo: [66, 76], ivb: [-2, 7], hb: [-3.5, 3.5], spinRpm: [80, 420],
    spin: 'flutter', wildness: 1.52, breaking: true,
  },
  eephus: {
    key: 'eephus', name: 'Eephus', short: 'EP',
    velo: [46, 57], ivb: [-18, -8], hb: [-2.5, 2.5], spinRpm: [900, 1700],
    spin: 'top', wildness: 1.3, breaking: true,
  },
}

export const ALL_PITCH_KEYS = Object.keys(PITCH_TYPES) as PitchTypeKey[]
