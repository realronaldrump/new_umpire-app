import { describe, expect, it } from 'vitest'
import { decideSwing, resolveSwing } from './batter'
import {
  applyCalledPitch, applyHbp, applySwing, createScenario, leverageOf, nextBatter,
  type Situation,
} from './engine'
import { generatePitch } from './physics'
import { createRng } from './rng'
import { generateCloser, generateLineup } from './roster'

const freshSit = (over: Partial<Situation> = {}): Situation => ({
  awayScore: 4, homeScore: 3, outs: 0, balls: 0, strikes: 0,
  bases: { first: false, second: false, third: false },
  batterIdx: 0, pitchOfAtBat: 0, totalPitches: 0, over: false, walkOff: false,
  ...over,
})

describe('inning engine', () => {
  it('walks in the winning run for a walk-off', () => {
    const sit = freshSit({
      awayScore: 3, homeScore: 3, balls: 3,
      bases: { first: true, second: true, third: true },
    })
    const res = applyCalledPitch(sit, 'ball', 'Test Batter')
    expect(res.atBatOver).toBe(true)
    expect(sit.homeScore).toBe(4)
    expect(sit.over).toBe(true)
    expect(sit.walkOff).toBe(true)
  })

  it('rings up strike three and ends the inning on the third out', () => {
    const sit = freshSit({ outs: 2, strikes: 2 })
    const res = applyCalledPitch(sit, 'strike', 'Test Batter')
    expect(res.atBatOver).toBe(true)
    expect(sit.outs).toBe(3)
    expect(sit.over).toBe(true)
    expect(sit.walkOff).toBe(false)
  })

  it('HBP forces runners like a walk', () => {
    const sit = freshSit({ bases: { first: true, second: false, third: false } })
    applyHbp(sit, 'Test Batter')
    expect(sit.bases.first).toBe(true)
    expect(sit.bases.second).toBe(true)
  })

  it('a home run clears the bases and can walk it off', () => {
    const sit = freshSit({ bases: { first: true, second: true, third: false } })
    const res = applySwing(
      sit,
      { kind: 'inPlay', quality: 'hard', bases: 4, text: 'CRUSHES one' },
      'Test Batter',
      createRng('hr'),
    )
    expect(sit.homeScore).toBe(6)
    expect(sit.over).toBe(true)
    expect(sit.walkOff).toBe(true)
    expect(res.atBatOver).toBe(true)
  })

  it('leverage rises with count, traffic, and late-game pressure', () => {
    const calm = leverageOf(freshSit({ awayScore: 9, homeScore: 1 }))
    const spicy = leverageOf(freshSit({
      awayScore: 4, homeScore: 4, balls: 3, strikes: 2, outs: 2,
      bases: { first: true, second: true, third: true },
    }))
    expect(spicy).toBeGreaterThan(calm + 1)
  })

  it('plays out complete, sane innings across many seeds', () => {
    for (let s = 0; s < 40; s++) {
      const rng = createRng(`sim-${s}`)
      const { situation: sit } = createScenario(rng)
      const lineup = generateLineup(rng)
      const closer = generateCloser(rng)
      let guard = 0
      while (!sit.over && guard++ < 300) {
        // Pre-pitch invariants: a live count never shows 4 balls or 3 strikes.
        expect(sit.balls).toBeLessThanOrEqual(3)
        expect(sit.strikes).toBeLessThanOrEqual(2)
        const batter = lineup[sit.batterIdx]
        const pitch = generatePitch(rng, closer, batter, {
          balls: sit.balls, strikes: sit.strikes, borderlineBias: 0.3,
        })
        const plan = decideSwing(rng, batter, pitch, { balls: sit.balls, strikes: sit.strikes })
        let atBatOver: boolean
        if (plan.hbp) {
          atBatOver = applyHbp(sit, batter.name).atBatOver
        } else if (plan.swings) {
          const outcome = resolveSwing(rng, batter, pitch, { balls: sit.balls, strikes: sit.strikes })
          atBatOver = applySwing(sit, outcome, batter.name, rng).atBatOver
        } else {
          // Perfect umpire: call the truth.
          atBatOver = applyCalledPitch(sit, pitch.truthStrike ? 'strike' : 'ball', batter.name).atBatOver
        }
        if (atBatOver && !sit.over) nextBatter(sit)
        expect(Number.isFinite(sit.homeScore + sit.awayScore + sit.outs)).toBe(true)
        expect(sit.outs).toBeLessThanOrEqual(3)
      }
      expect(sit.over).toBe(true)
      expect(guard).toBeLessThan(300)
      if (sit.walkOff) {
        // Non-homer walk-offs win by exactly one; a walk-off slam can win by up to four.
        expect(sit.homeScore).toBeGreaterThan(sit.awayScore)
        expect(sit.homeScore - sit.awayScore).toBeLessThanOrEqual(4)
      } else if (sit.outs >= 3) {
        expect(sit.homeScore).toBeLessThanOrEqual(sit.awayScore)
      }
    }
  })
})
