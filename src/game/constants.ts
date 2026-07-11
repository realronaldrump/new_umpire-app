// All distances in feet unless suffixed otherwise. Coordinate system:
// origin = center of the FRONT edge of home plate at ground level,
// +y toward the pitcher's mound, +x to the umpire's right, +z up.
// Calls evaluate the complete trajectory over the pentagonal plate footprint.

export const G_FTPS2 = 32.174
export const MPH_TO_FTPS = 1.4667

export const BALL_RADIUS_IN = 1.45
export const BALL_RADIUS_FT = BALL_RADIUS_IN / 12
export const PLATE_HALF_WIDTH_FT = 8.5 / 12
export const EFFECTIVE_HALF_WIDTH_FT = PLATE_HALF_WIDTH_FT + BALL_RADIUS_FT // 0.829 ft
export const PLATE_DEPTH_FT = 17 / 12

/** Pitching rubber, measured from our origin (60.5 ft from the plate's back point). */
export const RUBBER_Y_FT = 60.5 - PLATE_DEPTH_FT
export const MOUND_CENTER_Y_FT = 59 - PLATE_DEPTH_FT
export const MOUND_RADIUS_FT = 9
export const MOUND_HEIGHT_FT = 10 / 12

/** Plane (y) where the catcher's mitt receives the ball, behind the plate. */
export const CATCH_PLANE_Y_FT = -2.7

export type Difficulty = 'rookie' | 'pro' | 'legend'

export interface DifficultyPreset {
  key: Difficulty
  label: string
  tagline: string
  zoneVisibleDuringPitch: boolean
  callWindowMs: number
  /** Multiplier on real pitch flight time (1 = full MLB speed). */
  timeScale: number
  /** Probability a pitch is steered to paint a zone edge. */
  borderlineBias: number
  /** Max visual mitt-shift the catcher uses to steal borderline calls. */
  framingInches: number
  /** ABS challenges the batting side gets per game (single-player only). */
  absChallenges: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyPreset> = {
  rookie: {
    key: 'rookie',
    label: 'Rookie',
    tagline: 'Zone ghost stays visible · unhurried pitches · roomy call window',
    zoneVisibleDuringPitch: true,
    callWindowMs: 2200,
    timeScale: 0.72,
    borderlineBias: 0.17,
    framingInches: 0.4,
    absChallenges: 0,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    tagline: 'Broadcast rules — the zone is revealed only after your call',
    zoneVisibleDuringPitch: false,
    callWindowMs: 1400,
    timeScale: 0.85,
    borderlineBias: 0.3,
    framingInches: 1.8,
    absChallenges: 0,
  },
  legend: {
    key: 'legend',
    label: 'Legend',
    tagline: 'Full speed · razor margins · hitters can challenge your calls with ABS',
    zoneVisibleDuringPitch: false,
    callWindowMs: 975,
    timeScale: 1.0,
    borderlineBias: 0.46,
    framingInches: 3.4,
    absChallenges: 2,
  },
}

/** Phase durations (ms of real time). */
export const TIMING = {
  newBatterMs: 2500,
  prePitchBaseMs: 1700,
  prePitchJitterMs: 950,
  windupMs: 1080,
  revealMs: 2500,
  revealAtBatEndBonusMs: 950,
  whiffResultMs: 1750,
  foulResultMs: 2100,
  inPlayResultMs: 3000,
  hbpResultMs: 2400,
  inningOverDelayMs: 1600,
  autoCallDelayMs: 260,
  /** ABS challenge beats: helmet tap → tracking graphic → verdict hold. */
  challengeMs: 1900,
  absTrackMs: 2700,
  absVerdictMs: 2300,
} as const

/** A call is "borderline" when ball-to-zone clearance is within this of an edge. */
export const BORDERLINE_IN = 2.5
