import { describe, expect, it } from 'vitest'
import type { RoundSummary } from './protocol'
import { computePitchingReport, computeSeriesResult } from './scoring'

describe('multiplayer scoring', () => {
  it('gives a clean, efficient, well-commanded inning a perfect score', () => {
    const report = computePitchingReport({
      startOuts: 0, finalOuts: 3, runsAllowed: 0, pitchesThrown: 12,
      commandQualities: [1, 1, 1],
    })
    expect(report.score).toBe(100)
  })

  it('combines each player pitching and umpiring round equally', () => {
    const base = {
      round: 1 as const,
      finalSituation: {} as RoundSummary['finalSituation'], calls: [],
    }
    const rounds = [
      { ...base, pitcherId: 'a', umpireId: 'b', pitching: { score: 80 } as RoundSummary['pitching'], umpiring: { gradeScore: 90 } as RoundSummary['umpiring'] },
      { ...base, round: 2 as const, pitcherId: 'b', umpireId: 'a', pitching: { score: 70 } as RoundSummary['pitching'], umpiring: { gradeScore: 100 } as RoundSummary['umpiring'] },
    ]
    const result = computeSeriesResult(['a', 'b'], rounds)
    expect(result.scores).toEqual([
      { playerId: 'a', pitchScore: 80, umpScore: 100, overallScore: 90 },
      { playerId: 'b', pitchScore: 70, umpScore: 90, overallScore: 80 },
    ])
    expect(result.overallChampionIds).toEqual(['a'])
  })
})
