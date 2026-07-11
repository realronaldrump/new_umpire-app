// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from './game'
import { useSettings } from './settings'

/**
 * Drives the real phase state machine (menu → pitches → calls → inningOver)
 * on fake clocks — the same tick() the render loop calls.
 */

function drive(opts: { makeCalls: boolean; maxSimMs?: number; callWith?: (truthStrike: boolean) => 'ball' | 'strike' }): void {
  const maxSimMs = opts.maxSimMs ?? 15 * 60 * 1000
  const step = 50
  let simulated = 0
  while (simulated < maxSimMs) {
    vi.advanceTimersByTime(step)
    simulated += step
    const g = useGame.getState()
    g.tick(performance.now())
    const after = useGame.getState()
    if (after.phase === 'call' && opts.makeCalls && after.active) {
      const truth = after.active.pitch.truthStrike
      after.makeCall(opts.callWith ? opts.callWith(truth) : truth ? 'strike' : 'ball')
    }
    if (after.phase === 'inningOver') return
  }
}

describe('game store state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays a full inning to the report card with a perfect umpire', () => {
    useSettings.setState({ difficulty: 'pro', callWindow: 'auto', pitchSpeed: 'auto' })
    for (const seed of ['SMOKE1', 'SMOKE2', 'SMOKE3']) {
      const g = useGame.getState()
      g.newGame(seed)
      useGame.getState().playBall()
      drive({ makeCalls: true })

      const end = useGame.getState()
      expect(end.phase).toBe('inningOver')
      expect(end.sit.over).toBe(true)
      expect(end.report).not.toBeNull()
      expect(Number.isFinite(end.sit.homeScore + end.sit.awayScore)).toBe(true)
      // A perfect umpire never misses.
      expect(end.calls.every((c) => c.correct)).toBe(true)
      if (end.calls.length > 0) expect(end.report?.accuracyPct).toBe(100)
    }
  })

  it('survives a fully absent umpire (every take hesitates) and still ends', () => {
    useSettings.setState({ hesitationPolicy: 'miss' })
    const g = useGame.getState()
    g.newGame('AFKUMP')
    useGame.getState().playBall()
    drive({ makeCalls: false })

    const end = useGame.getState()
    expect(end.phase).toBe('inningOver')
    const takes = end.calls.length
    if (takes > 0) {
      expect(end.calls.every((c) => c.hesitated)).toBe(true)
      expect(end.calls.every((c) => !c.correct)).toBe(true)
    }
  })

  it('runs ABS challenges on legend: the robot zone rules, the economy holds', () => {
    useSettings.setState({ difficulty: 'legend', callWindow: 'auto', pitchSpeed: 'auto', hesitationPolicy: 'miss' })
    useGame.getState().newGame('ABSNINE')
    useGame.getState().setDebug({ forceChallenge: true })
    useGame.getState().playBall()
    expect(useGame.getState().challengesMax).toBe(2)
    // An umpire who rings up every take — bait for helmet taps.
    drive({ makeCalls: true, callWith: () => 'strike' })

    const end = useGame.getState()
    expect(end.phase).toBe('inningOver')
    expect(end.sit.over).toBe(true)

    const challenged = end.calls.filter((c) => c.challenged)
    expect(challenged.length).toBeGreaterThan(0)
    for (const c of challenged) {
      // Only strike calls are challengeable, ABS applies physics truth,
      // and the umpire is graded on the original call.
      expect(c.playerCall).toBe('strike')
      expect(c.overturned).toBe(!c.truthStrike)
      expect(c.correct).toBe(c.truthStrike)
      expect(c.hesitated).toBe(false)
    }
    // Lost challenges burn the budget; overturns are retained.
    const confirmed = challenged.filter((c) => !c.overturned).length
    expect(end.challengesLeft).toBe(Math.max(0, 2 - confirmed))
    expect(end.report?.overturned).toBe(challenged.filter((c) => c.overturned).length)

    useGame.getState().setDebug({ forceChallenge: false })
    useSettings.setState({ difficulty: 'pro' })
  })

  it('lets the pitcher/catcher challenge called balls and retain successful challenges', () => {
    useSettings.setState({ difficulty: 'legend', callWindow: 'auto', pitchSpeed: 'auto', hesitationPolicy: 'miss' })
    useGame.getState().setDebug({ forceChallenge: false })
    const challenged = []

    for (const seed of ['BATTERY1', 'BATTERY2', 'BATTERY3']) {
      useGame.getState().newGame(seed)
      useGame.getState().playBall()
      expect(useGame.getState().defensiveChallengesMax).toBe(2)
      drive({ makeCalls: true, callWith: () => 'ball' })

      const end = useGame.getState()
      const defensive = end.calls.filter((call) => call.challenged && call.playerCall === 'ball')
      challenged.push(...defensive)
      expect(end.defensiveChallengesLeft).toBe(Math.max(0, 2 - defensive.filter((call) => !call.overturned).length))
      for (const call of defensive) {
        expect(call.overturned).toBe(call.truthStrike)
        expect(call.correct).toBe(!call.truthStrike)
      }
    }

    expect(challenged.length).toBeGreaterThan(0)
    useSettings.setState({ difficulty: 'pro' })
  })

  it('never challenges outside legend', () => {
    useSettings.setState({ difficulty: 'pro', callWindow: 'auto', pitchSpeed: 'auto' })
    useGame.getState().newGame('NOABS1')
    useGame.getState().playBall()
    expect(useGame.getState().challengesMax).toBe(0)
    expect(useGame.getState().defensiveChallengesMax).toBe(0)
    drive({ makeCalls: true, callWith: () => 'strike' })
    const end = useGame.getState()
    expect(end.phase).toBe('inningOver')
    expect(end.calls.every((c) => !c.challenged)).toBe(true)
  })

  it('is seed-reproducible at the store level', () => {
    const run = (): string => {
      useGame.getState().newGame('REPRO')
      useGame.getState().playBall()
      drive({ makeCalls: true })
      const end = useGame.getState()
      return JSON.stringify({
        score: [end.sit.awayScore, end.sit.homeScore],
        pitches: end.sit.totalPitches,
        calls: end.calls.map((c) => [c.pitchNo, c.playerCall, c.truthStrike]),
        walkOff: end.sit.walkOff,
      })
    }
    const a = run()
    const b = run()
    expect(a).toBe(b)
  })
})
