import { describe, expect, it } from 'vitest'
import { BALL_RADIUS_FT, PLATE_DEPTH_FT, PLATE_HALF_WIDTH_FT } from './constants'
import { createRng } from './rng'
import { generateLineup } from './roster'
import {
  isStrike,
  trajectoryZoneMetrics,
  zoneFor,
  type ZoneBatter,
} from './strikeZone'

const batter = (over: Partial<ZoneBatter> = {}): ZoneBatter => ({
  heightIn: 74,
  hand: 'R',
  stance: {
    shoulderTopIn: 52,
    pantsTopIn: 34,
    kneeHollowIn: 19,
    widthIn: 31,
  },
  ...over,
})

describe('MLB rulebook strike-zone ground truth', () => {
  it('derives the vertical limits from the prepared stance landmarks', () => {
    const zone = zoneFor(batter())
    expect(zone.topFt).toBe((52 + 34) / 2 / 12)
    expect(zone.botFt).toBe(19 / 12)

    const crouched = batter({
      stance: { shoulderTopIn: 49, pantsTopIn: 32, kneeHollowIn: 18.5, widthIn: 36 },
    })
    expect(zoneFor(crouched).topFt).toBeLessThan(zone.topFt)
    expect(zoneFor(crouched).botFt).toBeLessThan(zone.botFt)
  })

  it('lets any part of the baseball clip the rulebook zone', () => {
    const b = batter()
    const zone = zoneFor(b)
    expect(isStrike(PLATE_HALF_WIDTH_FT + BALL_RADIUS_FT - 0.001, 0, zone.centerZFt, b)).toBe(true)
    expect(isStrike(PLATE_HALF_WIDTH_FT + BALL_RADIUS_FT + 0.001, 0, zone.centerZFt, b)).toBe(false)
    expect(isStrike(0, 0, zone.topFt + BALL_RADIUS_FT - 0.001, b)).toBe(true)
    expect(isStrike(0, 0, zone.topFt + BALL_RADIUS_FT + 0.001, b)).toBe(false)
  })

  it('uses spherical contact at corners rather than a box-expanded shortcut', () => {
    const b = batter()
    const zone = zoneFor(b)
    const diagonalMiss = BALL_RADIUS_FT * 0.8
    expect(isStrike(
      PLATE_HALF_WIDTH_FT + diagonalMiss,
      0,
      zone.topFt + diagonalMiss,
      b,
    )).toBe(false)

    const diagonalClip = BALL_RADIUS_FT * 0.6
    expect(isStrike(
      PLATE_HALF_WIDTH_FT + diagonalClip,
      0,
      zone.topFt + diagonalClip,
      b,
    )).toBe(true)
  })

  it('covers the pentagonal depth of home plate, including the back point', () => {
    const b = batter()
    const zone = zoneFor(b)
    expect(isStrike(0, -PLATE_DEPTH_FT - BALL_RADIUS_FT * 0.9, zone.centerZFt, b)).toBe(true)
    expect(isStrike(0, -PLATE_DEPTH_FT - BALL_RADIUS_FT * 1.1, zone.centerZFt, b)).toBe(false)

    // The plate narrows toward the catcher; this would be inside a rectangular slab,
    // but it is well outside the actual pentagonal footprint.
    expect(isStrike(PLATE_HALF_WIDTH_FT, -PLATE_DEPTH_FT, zone.centerZFt, b)).toBe(false)
  })

  it('calls a pitch that misses the front plane but bends over the back of the plate', () => {
    const b = batter()
    const zone = zoneFor(b)
    const traj = {
      p0: { x: 1.5, y: 1, z: zone.centerZFt },
      v0: { x: -1, y: -2, z: 0 },
      a: { x: 0, y: 0, z: 0 },
      T: 0.5,
      catchT: 1.3,
    }

    expect(isStrike(1, 0, zone.centerZFt, b)).toBe(false)
    const result = trajectoryZoneMetrics(traj, b)
    expect(result.strike).toBe(true)
    expect(result.point.y).toBeLessThan(0)
  })

  it('changes zone dimensions across a varied lineup', () => {
    const shortUpright = batter({
      heightIn: 68,
      stance: { shoulderTopIn: 49, pantsTopIn: 32, kneeHollowIn: 18, widthIn: 27 },
    })
    const tallCrouched = batter({
      heightIn: 77,
      stance: { shoulderTopIn: 54, pantsTopIn: 35, kneeHollowIn: 20, widthIn: 38 },
    })
    expect(zoneFor(shortUpright).topFt).not.toBe(zoneFor(tallCrouched).topFt)
    expect(zoneFor(shortUpright).botFt).not.toBe(zoneFor(tallCrouched).botFt)
  })

  it('gives the actual generated lineup nine stance-specific zones', () => {
    const lineup = generateLineup(createRng('rulebook-lineup'))
    const zones = lineup.map(zoneFor)
    expect(new Set(zones.map((z) => z.topFt.toFixed(4))).size).toBeGreaterThan(3)
    expect(new Set(zones.map((z) => z.botFt.toFixed(4))).size).toBeGreaterThan(3)
    for (let i = 0; i < lineup.length; i++) {
      expect(zones[i].topFt * 12).toBeCloseTo(
        (lineup[i].stance.shoulderTopIn + lineup[i].stance.pantsTopIn) / 2,
        10,
      )
      expect(zones[i].botFt * 12).toBeCloseTo(lineup[i].stance.kneeHollowIn, 10)
    }
  })
})
