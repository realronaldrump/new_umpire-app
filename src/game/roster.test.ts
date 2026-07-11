import { describe, expect, it } from 'vitest'
import { generatePitch } from './physics'
import { PITCH_TYPES, type PitchTypeKey } from './pitchTypes'
import { createRng } from './rng'
import { AWAY_TEAM, generateCloser, HOME_TEAM, teamFullName } from './roster'

const FASTBALLS = new Set<PitchTypeKey>(['fourseam', 'sinker', 'cutter'])
const BREAKERS = new Set<PitchTypeKey>([
  'slider', 'sweeper', 'slurve', 'curveball', 'knucklecurve',
])
const OFFSPEED = new Set<PitchTypeKey>(['changeup', 'splitter'])

describe('team labels', () => {
  it('builds full display names from the roster definition', () => {
    expect(teamFullName(AWAY_TEAM)).toBe(`${AWAY_TEAM.city} ${AWAY_TEAM.name}`)
    expect(teamFullName(HOME_TEAM)).toBe(`${HOME_TEAM.city} ${HOME_TEAM.name}`)
  })
})

describe('modern pitcher arsenals', () => {
  it('gives every generated closer four or five distinct, balanced pitches', () => {
    let fourPitch = 0
    let fivePitch = 0
    for (let i = 0; i < 400; i++) {
      const closer = generateCloser(createRng(`arsenal-${i}`))
      const keys = closer.arsenal.map(([key]) => key)

      expect([4, 5]).toContain(keys.length)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.filter((key) => FASTBALLS.has(key))).toHaveLength(2)
      expect(keys.some((key) => BREAKERS.has(key))).toBe(true)
      expect(keys.some((key) => OFFSPEED.has(key))).toBe(true)
      expect(closer.arsenal.reduce((sum, [, weight]) => sum + weight, 0)).toBeCloseTo(1, 10)
      expect(closer.arsenal[0][1]).toBe(Math.max(...closer.arsenal.map(([, weight]) => weight)))

      if (keys.length === 4) fourPitch++
      else fivePitch++
    }
    expect(fourPitch).toBeGreaterThan(100)
    expect(fivePitch).toBeGreaterThan(100)
  })

  it('creates one stable Statcast-style profile for every pitch in the arsenal', () => {
    for (let i = 0; i < 100; i++) {
      const closer = generateCloser(createRng(`profiles-${i}`))
      for (const [key] of closer.arsenal) {
        const profile = closer.pitchProfiles?.[key]
        const def = PITCH_TYPES[key]
        expect(profile).toBeDefined()
        expect(profile!.veloMph).toBeGreaterThanOrEqual(def.velo[0])
        expect(profile!.veloMph).toBeLessThanOrEqual(def.velo[1])
        expect(profile!.ivbIn).toBeGreaterThanOrEqual(def.ivb[0])
        expect(profile!.ivbIn).toBeLessThanOrEqual(def.ivb[1])
        expect(profile!.hbIn).toBeGreaterThanOrEqual(def.hb[0])
        expect(profile!.hbIn).toBeLessThanOrEqual(def.hb[1])
        expect(profile!.spinRpm).toBeGreaterThanOrEqual(def.spinRpm[0])
        expect(profile!.spinRpm).toBeLessThanOrEqual(def.spinRpm[1])
      }
    }
  })

  it('keeps repeated offerings clustered around that pitcher’s own shape', () => {
    const closer = generateCloser(createRng('repeatable-shapes'))
    const batter = { heightIn: 73, hand: 'R' as const }
    for (const [key] of closer.arsenal) {
      const rng = createRng(`repeat-${key}`)
      const speeds: number[] = []
      for (let i = 0; i < 80; i++) {
        const pitch = generatePitch(rng, closer, batter, {
          balls: 1,
          strikes: 1,
          borderlineBias: 0,
          player: { typeKey: key, target: { u: 0, v: 0 }, commandQuality: 1 },
        })
        speeds.push(pitch.mph)
        expect(pitch.ivbIn).toBeGreaterThanOrEqual(PITCH_TYPES[key].ivb[0])
        expect(pitch.ivbIn).toBeLessThanOrEqual(PITCH_TYPES[key].ivb[1])
        const armSideBreak = (closer.hand === 'R' ? -1 : 1) * pitch.hbIn
        expect(armSideBreak).toBeGreaterThanOrEqual(PITCH_TYPES[key].hb[0])
        expect(armSideBreak).toBeLessThanOrEqual(PITCH_TYPES[key].hb[1])
      }
      const mean = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length
      const variance = speeds.reduce((sum, speed) => sum + (speed - mean) ** 2, 0) / speeds.length
      expect(Math.sqrt(variance)).toBeLessThan(0.9)
      expect(mean).toBeCloseTo(closer.pitchProfiles![key]!.veloMph + closer.veloOffsetMph, 0)
    }
  })

  it('separates modern pitch shapes by speed and movement', () => {
    const midpoint = (band: readonly [number, number]) => (band[0] + band[1]) / 2
    expect(midpoint(PITCH_TYPES.fourseam.velo)).toBeGreaterThan(midpoint(PITCH_TYPES.slider.velo))
    expect(midpoint(PITCH_TYPES.slider.velo)).toBeGreaterThan(midpoint(PITCH_TYPES.sweeper.velo))
    expect(Math.abs(midpoint(PITCH_TYPES.sweeper.hb))).toBeGreaterThan(Math.abs(midpoint(PITCH_TYPES.slider.hb)))
    expect(Math.abs(midpoint(PITCH_TYPES.slider.hb))).toBeGreaterThan(Math.abs(midpoint(PITCH_TYPES.cutter.hb)))
    expect(midpoint(PITCH_TYPES.curveball.ivb)).toBeLessThan(midpoint(PITCH_TYPES.slurve.ivb))
    expect(midpoint(PITCH_TYPES.slurve.ivb)).toBeLessThan(midpoint(PITCH_TYPES.slider.ivb))
    expect(midpoint(PITCH_TYPES.sinker.hb)).toBeGreaterThan(0)
    expect(midpoint(PITCH_TYPES.changeup.hb)).toBeGreaterThan(0)
    expect(midpoint(PITCH_TYPES.splitter.spinRpm)).toBeLessThan(midpoint(PITCH_TYPES.fourseam.spinRpm))
  })
})
