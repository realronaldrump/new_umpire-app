import { describe, expect, it } from 'vitest'
import { EFFECTIVE_HALF_WIDTH_FT, G_FTPS2 } from './constants'
import { generatePitch, posAt, type PitcherPhysique } from './physics'
import { createRng } from './rng'
import { generateCloser, generateLineup } from './roster'

const testPitcher = (hand: 'R' | 'L'): PitcherPhysique => ({
  hand,
  veloOffsetMph: 0,
  commandMult: 1,
  releaseSideFt: 1.8,
  releaseHeightFt: 5.8,
  releaseYFt: 53.8,
  arsenal: [
    ['fourseam', 0.4], ['slider', 0.3], ['curveball', 0.15], ['sinker', 0.15],
  ],
})

describe('pitch physics', () => {
  it('crosses exactly at the generated crossing point at y=0', () => {
    const rng = createRng('physics-cross')
    const batter = { heightIn: 74, hand: 'R' as const }
    for (let i = 0; i < 300; i++) {
      const p = generatePitch(rng, testPitcher('R'), batter, {
        balls: rng.int(4), strikes: rng.int(3), borderlineBias: 0.3,
      })
      const at = posAt(p.traj, p.traj.T)
      expect(Math.abs(at.y)).toBeLessThan(1e-9)
      expect(Math.abs(at.x - p.cross.x)).toBeLessThan(1e-9)
      expect(Math.abs(at.z - p.cross.z)).toBeLessThan(1e-9)
    }
  })

  it('produces realistic flight times and release speeds', () => {
    const rng = createRng('physics-speed')
    const batter = { heightIn: 72, hand: 'L' as const }
    for (let i = 0; i < 300; i++) {
      const p = generatePitch(rng, testPitcher('R'), batter, {
        balls: 1, strikes: 1, borderlineBias: 0.3,
      })
      expect(p.traj.T).toBeGreaterThan(0.34)
      expect(p.traj.T).toBeLessThan(0.62)
      expect(p.traj.catchT).toBeGreaterThan(p.traj.T)
      // Endpoint-solved launch speed should stay near the nominal pitch speed.
      expect(p.releaseSpeedMph).toBeGreaterThan(p.mph * 0.85)
      expect(p.releaseSpeedMph).toBeLessThan(p.mph * 1.12)
      const mid = posAt(p.traj, p.traj.T / 2)
      expect(Number.isFinite(mid.x + mid.y + mid.z)).toBe(true)
    }
  })

  it('moves like the pitch type says (breaks and gravity)', () => {
    const rng = createRng('physics-shape')
    const batter = { heightIn: 74, hand: 'R' as const }
    const curve = generatePitch(rng, testPitcher('R'), batter, {
      balls: 0, strikes: 0, borderlineBias: 0, forced: { typeKey: 'curveball', loc: 'center' },
    })
    // Curveball falls harder than gravity alone.
    expect(curve.traj.a.z).toBeLessThan(-G_FTPS2)

    const four = generatePitch(rng, testPitcher('R'), batter, {
      balls: 0, strikes: 0, borderlineBias: 0, forced: { typeKey: 'fourseam', loc: 'center' },
    })
    expect(four.traj.a.z).toBeGreaterThan(-G_FTPS2 + 10)

    // RHP slider breaks glove-side (+x, toward catcher's right); sinker runs arm-side (−x).
    const slider = generatePitch(rng, testPitcher('R'), batter, {
      balls: 0, strikes: 0, borderlineBias: 0, forced: { typeKey: 'slider', loc: 'center' },
    })
    expect(slider.traj.a.x).toBeGreaterThan(0)
    const sinker = generatePitch(rng, testPitcher('R'), batter, {
      balls: 0, strikes: 0, borderlineBias: 0, forced: { typeKey: 'sinker', loc: 'center' },
    })
    expect(sinker.traj.a.x).toBeLessThan(0)

    // Lefty arm-side run flips sign.
    const lhpSinker = generatePitch(rng, testPitcher('L'), batter, {
      balls: 0, strikes: 0, borderlineBias: 0, forced: { typeKey: 'sinker', loc: 'center' },
    })
    expect(lhpSinker.traj.a.x).toBeGreaterThan(0)
  })

  it('keeps crossing points within playable bounds', () => {
    const rng = createRng('physics-bounds')
    const batter = { heightIn: 77, hand: 'R' as const }
    for (let i = 0; i < 400; i++) {
      const p = generatePitch(rng, testPitcher(rng.chance(0.5) ? 'R' : 'L'), batter, {
        balls: rng.int(4), strikes: rng.int(3), borderlineBias: 0.46,
      })
      expect(Math.abs(p.cross.x)).toBeLessThanOrEqual(2.9)
      expect(p.cross.z).toBeGreaterThanOrEqual(0.3)
      expect(p.cross.z).toBeLessThanOrEqual(5.4)
    }
  })

  it('is deterministic for a given seed', () => {
    const mk = () => {
      const rng = createRng('determinism')
      const lineup = generateLineup(rng)
      const closer = generateCloser(rng)
      const p = generatePitch(rng, closer, { heightIn: lineup[0].heightIn, hand: lineup[0].hand }, {
        balls: 0, strikes: 0, borderlineBias: 0.3,
      })
      return { lineup, closer, p }
    }
    const a = mk()
    const b = mk()
    expect(a.lineup.map((x) => x.name)).toEqual(b.lineup.map((x) => x.name))
    expect(a.closer.name).toBe(b.closer.name)
    expect(a.p.cross).toEqual(b.p.cross)
    expect(a.p.typeKey).toBe(b.p.typeKey)
  })

  it('steers a healthy share of pitches to the borderline', () => {
    const rng = createRng('borderline-share')
    const batter = { heightIn: 73, hand: 'R' as const }
    let borderline = 0
    const N = 500
    for (let i = 0; i < N; i++) {
      const p = generatePitch(rng, testPitcher('R'), batter, {
        balls: 1, strikes: 1, borderlineBias: 0.46,
      })
      if (p.borderline) borderline++
    }
    expect(borderline / N).toBeGreaterThan(0.3)
    expect(Math.abs(EFFECTIVE_HALF_WIDTH_FT - 0.8292) < 0.001).toBe(true)
  })

  it('uses multiplayer command quality to tighten a chosen target', () => {
    const batter = { heightIn: 73, hand: 'R' as const }
    const averageMiss = (quality: number): number => {
      let total = 0
      for (let i = 0; i < 250; i++) {
        const pitch = generatePitch(createRng(`command-${quality}-${i}`), testPitcher('R'), batter, {
          balls: 1, strikes: 1, borderlineBias: 0,
          player: { typeKey: 'slider', target: { u: 0, v: 0 }, commandQuality: quality },
        })
        total += Math.hypot(pitch.cross.x - pitch.intended.x, pitch.cross.z - pitch.intended.z)
      }
      return total / 250
    }
    expect(averageMiss(1)).toBeLessThan(averageMiss(0.25) * 0.5)
  })
})
