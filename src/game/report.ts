import { BORDERLINE_IN } from './constants'
import type { ZoneEdge } from './strikeZone'

export interface CallRecord {
  pitchNo: number
  batterName: string
  countBefore: string
  playerCall: 'ball' | 'strike'
  truthStrike: boolean
  correct: boolean
  hesitated: boolean
  edgeDistIn: number
  nearestEdge: ZoneEdge
  leverage: number
  endedAtBat: boolean
  note: string
  cross: { x: number; z: number }
  zoneTopFt: number
  zoneBotFt: number
}

export interface ReportCard {
  grade: string
  gradeScore: number
  title: string
  totalCalls: number
  correctCalls: number
  accuracyPct: number
  weightedPct: number
  borderlineTotal: number
  borderlineCorrect: number
  hesitations: number
  blownHighLeverage: CallRecord[]
  framingResisted: number
}

const GRADE_STEPS: ReadonlyArray<readonly [number, string, string]> = [
  [97, 'A+', 'Robot-ump accuracy. The league should study your tape.'],
  [93, 'A', 'Gold standard behind the dish tonight.'],
  [89, 'A-', 'Commanding night. Both dugouts trusted you.'],
  [85, 'B+', 'Sharp work with a couple of pitches to circle.'],
  [80, 'B', 'Solid night — the zone mostly held its shape.'],
  [75, 'B-', 'Serviceable, but the corners got slippery.'],
  [70, 'C+', 'The broadcast booth noticed. Twice.'],
  [64, 'C', 'An inconsistent zone kept both benches chirping.'],
  [58, 'C-', 'You heard it from the crowd, and they had a point.'],
  [50, 'D', 'A rough night. The pitching coach wants a word.'],
  [-999, 'F', 'The league office is reviewing this one.'],
]

export function computeReport(calls: CallRecord[]): ReportCard {
  const totalCalls = calls.length
  const correctCalls = calls.filter((c) => c.correct).length
  const accuracyPct = totalCalls ? (100 * correctCalls) / totalCalls : 100

  let wSum = 0
  let wCorrect = 0
  for (const c of calls) {
    wSum += c.leverage
    if (c.correct) wCorrect += c.leverage
  }
  const weightedPct = wSum ? (100 * wCorrect) / wSum : 100

  const borderline = calls.filter((c) => Math.abs(c.edgeDistIn) <= BORDERLINE_IN)
  const borderlineCorrect = borderline.filter((c) => c.correct).length
  const hesitations = calls.filter((c) => c.hesitated).length
  const blownHighLeverage = calls
    .filter((c) => !c.correct && c.leverage >= 2.1)
    .sort((a, b) => b.leverage - a.leverage)
    .slice(0, 4)

  // Correct BALL calls on borderline pitches = you resisted the catcher's framing.
  const framingResisted = borderline.filter((c) => c.correct && !c.truthStrike).length

  let gradeScore = weightedPct
  gradeScore -= hesitations * 2
  gradeScore += Math.min(6, borderlineCorrect * 1.4)
  gradeScore = Math.max(0, Math.min(100, gradeScore))

  const step = GRADE_STEPS.find(([min]) => gradeScore >= min) ?? GRADE_STEPS[GRADE_STEPS.length - 1]
  const noCalls = totalCalls === 0

  return {
    grade: noCalls ? '—' : step[1],
    gradeScore,
    title: noCalls ? 'Not a single take needed your judgment. The ninth played itself.' : step[2],
    totalCalls,
    correctCalls,
    accuracyPct,
    weightedPct,
    borderlineTotal: borderline.length,
    borderlineCorrect,
    hesitations,
    blownHighLeverage,
    framingResisted,
  }
}
