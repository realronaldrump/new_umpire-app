import { clamp } from '../game/rng'
import type { PlayerSeriesScore, PitchingReport, RoundSummary, SeriesResult } from './protocol'

export function computePitchingReport(input: {
  startOuts: number
  finalOuts: number
  runsAllowed: number
  pitchesThrown: number
  commandQualities: number[]
}): PitchingReport {
  const outsRequired = Math.max(1, 3 - input.startOuts)
  const outsRecorded = clamp(input.finalOuts - input.startOuts, 0, outsRequired)
  const averageCommand = input.commandQualities.length
    ? input.commandQualities.reduce((sum, value) => sum + value, 0) / input.commandQualities.length
    : 0
  const runPrevention = clamp(100 - 30 * input.runsAllowed, 0, 100)
  const outCompletion = 100 * outsRecorded / outsRequired
  const efficiency = clamp(100 - 4 * Math.max(0, input.pitchesThrown - 4 * outsRequired), 0, 100)
  const score = 0.55 * runPrevention + 0.3 * outCompletion + 0.1 * (100 * averageCommand) + 0.05 * efficiency
  return {
    score: round1(score), runsAllowed: input.runsAllowed, outsRecorded, outsRequired,
    pitchesThrown: input.pitchesThrown, averageCommand: round3(averageCommand),
    runPrevention: round1(runPrevention), outCompletion: round1(outCompletion), efficiency: round1(efficiency),
  }
}

export function computeSeriesResult(players: string[], rounds: RoundSummary[]): SeriesResult {
  const scores: PlayerSeriesScore[] = players.map((playerId) => {
    const pitching = rounds.find((round) => round.pitcherId === playerId)?.pitching.score ?? 0
    const umpiring = rounds.find((round) => round.umpireId === playerId)?.umpiring.gradeScore ?? 0
    return { playerId, pitchScore: pitching, umpScore: round1(umpiring), overallScore: round1((pitching + umpiring) / 2) }
  })
  return {
    scores,
    pitchingChampionIds: champions(scores, (score) => score.pitchScore),
    umpiringChampionIds: champions(scores, (score) => score.umpScore),
    overallChampionIds: champions(scores, (score) => score.overallScore),
  }
}

function champions(scores: PlayerSeriesScore[], value: (score: PlayerSeriesScore) => number): string[] {
  const best = Math.max(...scores.map(value))
  return scores.filter((score) => value(score) === best).map((score) => score.playerId)
}

const round1 = (value: number) => Math.round(value * 10) / 10
const round3 = (value: number) => Math.round(value * 1000) / 1000
