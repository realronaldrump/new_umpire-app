export type PitchTypeKey =
  | 'fourseam'
  | 'sinker'
  | 'cutter'
  | 'slider'
  | 'sweeper'
  | 'curveball'
  | 'changeup'
  | 'splitter'

export type SpinStyle = 'back' | 'top' | 'gyro' | 'side'

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

export const PITCH_TYPES: Record<PitchTypeKey, PitchTypeDef> = {
  fourseam: {
    key: 'fourseam', name: 'Four-Seam Fastball', short: 'FF',
    velo: [93, 96.5], ivb: [15, 18], hb: [6, 10], spinRpm: [2200, 2500],
    spin: 'back', wildness: 1.0, breaking: false,
  },
  sinker: {
    key: 'sinker', name: 'Sinker', short: 'SI',
    velo: [91, 94.5], ivb: [8, 12], hb: [14, 18], spinRpm: [2000, 2300],
    spin: 'back', wildness: 1.05, breaking: false,
  },
  cutter: {
    key: 'cutter', name: 'Cutter', short: 'FC',
    velo: [88, 91.5], ivb: [6, 10], hb: [-4, -1], spinRpm: [2300, 2600],
    spin: 'gyro', wildness: 1.1, breaking: false,
  },
  slider: {
    key: 'slider', name: 'Slider', short: 'SL',
    velo: [83, 87], ivb: [1, 4], hb: [-14, -6], spinRpm: [2400, 2700],
    spin: 'gyro', wildness: 1.3, breaking: true,
  },
  sweeper: {
    key: 'sweeper', name: 'Sweeper', short: 'ST',
    velo: [80, 84], ivb: [0, 3], hb: [-18, -12], spinRpm: [2500, 2800],
    spin: 'side', wildness: 1.38, breaking: true,
  },
  curveball: {
    key: 'curveball', name: 'Curveball', short: 'CU',
    velo: [78, 82], ivb: [-14, -8], hb: [4, 10], spinRpm: [2500, 2900],
    spin: 'top', wildness: 1.42, breaking: true,
  },
  changeup: {
    key: 'changeup', name: 'Changeup', short: 'CH',
    velo: [83, 87], ivb: [4, 8], hb: [12, 17], spinRpm: [1600, 1900],
    spin: 'back', wildness: 1.22, breaking: true,
  },
  splitter: {
    key: 'splitter', name: 'Splitter', short: 'FS',
    velo: [84, 88], ivb: [-2, 4], hb: [6, 12], spinRpm: [1200, 1500],
    spin: 'back', wildness: 1.32, breaking: true,
  },
}

export const ALL_PITCH_KEYS = Object.keys(PITCH_TYPES) as PitchTypeKey[]
