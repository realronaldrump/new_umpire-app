// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from './game'
import { useSettings } from './settings'

/**
 * Drives the real phase state machine (menu → pitches → calls → inningOver)
 * on fake clocks — the same tick() the render loop calls.
 */

function drive(opts: { makeCalls: boolean; maxSimMs?: number }): void {
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
      after.makeCall(after.active.pitch.truthStrike ? 'strike' : 'ball')
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
