import type { SwingOutcome } from './batter'
import type { RNG } from './rng'
import { AWAY_TEAM, HOME_TEAM } from './roster'

export interface Bases {
  first: boolean
  second: boolean
  third: boolean
}

export interface Situation {
  awayScore: number
  homeScore: number
  outs: number
  balls: number
  strikes: number
  bases: Bases
  batterIdx: number
  pitchOfAtBat: number
  totalPitches: number
  over: boolean
  walkOff: boolean
}

export type EventKind = 'K' | 'BB' | 'hit' | 'out' | 'run' | 'HBP' | 'info' | 'end'

export interface PlayEvent {
  kind: EventKind
  text: string
  runs: number
}

export interface Scenario {
  situation: Situation
  intro: string
}

const runnersOn = (b: Bases): number => (b.first ? 1 : 0) + (b.second ? 1 : 0) + (b.third ? 1 : 0)

export function createScenario(rng: RNG): Scenario {
  const deficit = rng.weighted([
    [1, 0.32], [2, 0.2], [3, 0.13], [0, 0.35],
  ] as const)
  const homeScore = rng.int(5)
  const awayScore = homeScore + deficit
  const outs = rng.weighted([[0, 0.62], [1, 0.24], [2, 0.14]] as const)
  const basesKey = rng.weighted([
    ['empty', 0.6], ['first', 0.15], ['second', 0.09],
    ['firstSecond', 0.07], ['third', 0.05], ['loaded', 0.04],
  ] as const)
  const bases: Bases = {
    first: basesKey === 'first' || basesKey === 'firstSecond' || basesKey === 'loaded',
    second: basesKey === 'second' || basesKey === 'firstSecond' || basesKey === 'loaded',
    third: basesKey === 'third' || basesKey === 'loaded',
  }

  const situation: Situation = {
    awayScore, homeScore, outs,
    balls: 0, strikes: 0,
    bases,
    batterIdx: rng.int(9),
    pitchOfAtBat: 0,
    totalPitches: 0,
    over: false,
    walkOff: false,
  }

  const stakes =
    deficit === 0 ? 'Tie game — a single run walks it off.' :
    deficit === 1 ? 'Down one. The tying run steps in.' :
    deficit === 2 ? 'Down two, but this crowd believes.' :
    'Down three — they need baserunners in a hurry.'
  const table =
    outs === 0 && runnersOn(bases) === 0 ? 'Clean slate to start the ninth.' :
    `You pick it up with ${outs} out${outs === 1 ? '' : 's'}${runnersOn(bases) ? ' and traffic on the bases' : ''}.`

  return { situation, intro: `${stakes} ${table}` }
}

function checkWalkOff(sit: Situation, events: PlayEvent[]): void {
  if (sit.homeScore > sit.awayScore) {
    sit.over = true
    sit.walkOff = true
    events.push({ kind: 'end', text: `WALK-OFF! The ${HOME_TEAM.name} take it!`, runs: 0 })
  }
}

function checkThreeOuts(sit: Situation, events: PlayEvent[]): void {
  if (sit.outs >= 3) {
    sit.over = true
    events.push({
      kind: 'end',
      text: sit.awayScore === sit.homeScore
        ? 'Three away — this one is headed for extras.'
        : `Three away. Ballgame — the ${AWAY_TEAM.name} hold on.`,
      runs: 0,
    })
  }
}

function scoreRuns(sit: Situation, runs: number, events: PlayEvent[], why: string): void {
  if (runs <= 0) return
  sit.homeScore += runs
  events.push({ kind: 'run', text: `${runs === 1 ? 'A run' : `${runs} runs`} score${runs === 1 ? 's' : ''} on the ${why}!`, runs })
}

function forceAdvance(sit: Situation): number {
  const b = sit.bases
  let runs = 0
  if (b.first && b.second && b.third) runs = 1
  else if (b.first && b.second) b.third = true
  else if (b.first) b.second = true
  b.first = true
  return runs
}

export interface ApplyResult {
  atBatOver: boolean
  events: PlayEvent[]
  headline: string
}

/** Apply the umpire's call on a taken pitch. The CALL governs the game, right or wrong. */
export function applyCalledPitch(sit: Situation, call: 'ball' | 'strike', batterName: string): ApplyResult {
  const events: PlayEvent[] = []
  sit.pitchOfAtBat++
  sit.totalPitches++
  let atBatOver = false
  let headline: string

  if (call === 'strike') {
    sit.strikes++
    if (sit.strikes >= 3) {
      sit.outs++
      atBatOver = true
      headline = 'STRUCK HIM OUT LOOKING'
      events.push({ kind: 'K', text: `${batterName} goes down looking.`, runs: 0 })
      checkThreeOuts(sit, events)
    } else {
      headline = 'STRIKE'
    }
  } else {
    sit.balls++
    if (sit.balls >= 4) {
      atBatOver = true
      headline = 'BALL FOUR'
      const runs = forceAdvance(sit)
      events.push({ kind: 'BB', text: `${batterName} works the walk.`, runs: 0 })
      scoreRuns(sit, runs, events, 'bases-loaded walk')
      checkWalkOff(sit, events)
    } else {
      headline = 'BALL'
    }
  }
  return { atBatOver, events, headline }
}

export function applyHbp(sit: Situation, batterName: string): ApplyResult {
  const events: PlayEvent[] = []
  sit.pitchOfAtBat++
  sit.totalPitches++
  const runs = forceAdvance(sit)
  events.push({ kind: 'HBP', text: `${batterName} wears one — takes his base.`, runs: 0 })
  scoreRuns(sit, runs, events, 'hit-by-pitch')
  checkWalkOff(sit, events)
  return { atBatOver: true, events, headline: 'HIT BY PITCH' }
}

export function applySwing(
  sit: Situation,
  outcome: SwingOutcome,
  batterName: string,
  rng: RNG,
): ApplyResult {
  const events: PlayEvent[] = []
  sit.pitchOfAtBat++
  sit.totalPitches++

  if (outcome.kind === 'whiff') {
    sit.strikes++
    if (sit.strikes >= 3) {
      sit.outs++
      events.push({ kind: 'K', text: `${batterName} strikes out swinging.`, runs: 0 })
      checkThreeOuts(sit, events)
      return { atBatOver: true, events, headline: 'STRIKEOUT SWINGING' }
    }
    return { atBatOver: false, events, headline: 'SWINGING STRIKE' }
  }

  if (outcome.kind === 'foul') {
    if (sit.strikes < 2) sit.strikes++
    return { atBatOver: false, events, headline: 'FOUL BALL' }
  }

  // Ball in play.
  const b = sit.bases
  if (outcome.bases === 0) {
    sit.outs++
    let text = `${batterName} ${outcome.text}.`
    let runs = 0

    if (outcome.outType === 'ground' && b.first && sit.outs <= 2 && rng.chance(0.38)) {
      // Double play (only if two outs are actually available).
      sit.outs++
      b.first = false
      text = `${batterName} ${outcome.text} — they turn two!`
      if (sit.outs < 3) {
        if (b.second && rng.chance(0.5)) { b.second = false; b.third = true }
      }
    } else if ((outcome.outType === 'fly' || outcome.outType === 'line') && b.third && sit.outs <= 2) {
      if (sit.outs < 3 && rng.chance(0.62)) {
        b.third = false
        runs = 1
        text = `${batterName} lifts a sacrifice fly — the runner tags and scores!`
      }
    } else if (outcome.outType === 'ground' && sit.outs < 3) {
      // Runners move up on a groundout sometimes.
      if (b.second && !b.third && rng.chance(0.4)) { b.second = false; b.third = true }
    }

    events.push({ kind: 'out', text, runs: 0 })
    scoreRuns(sit, runs, events, 'sac fly')
    checkWalkOff(sit, events)
    if (!sit.over) checkThreeOuts(sit, events)
    return { atBatOver: true, events, headline: outcomeHeadline(outcome, runs) }
  }

  // A hit.
  let runs = 0
  const hitBases = outcome.bases
  if (hitBases === 4) {
    runs = 1 + runnersOn(b)
    b.first = b.second = b.third = false
  } else {
    if (b.third) { b.third = false; runs++ }
    if (b.second) {
      b.second = false
      if (hitBases >= 2 || rng.chance(0.62)) runs++
      else b.third = true
    }
    if (b.first) {
      b.first = false
      if (hitBases >= 3) runs++
      else if (hitBases === 2) { if (rng.chance(0.4)) runs++; else b.third = true }
      else if (rng.chance(0.28) && !b.third) b.third = true
      else b.second = true
    }
    if (hitBases === 1) b.first = true
    else if (hitBases === 2) b.second = true
    else b.third = true

    // Rulebook: on anything but a homer, the game ends the instant the
    // winning run scores — trailing runners don't count.
    const needed = sit.awayScore + 1 - sit.homeScore
    if (needed > 0 && runs > needed) runs = needed
  }

  events.push({ kind: 'hit', text: `${batterName} ${outcome.text}.`, runs: 0 })
  scoreRuns(sit, runs, events, hitBases === 4 ? 'home run' : 'hit')
  checkWalkOff(sit, events)
  return { atBatOver: true, events, headline: outcomeHeadline(outcome, runs) }
}

function outcomeHeadline(outcome: Extract<SwingOutcome, { kind: 'inPlay' }>, runs: number): string {
  if (outcome.bases === 4) return runs > 1 ? `${runs}-RUN HOMER` : 'HOME RUN'
  if (outcome.bases === 3) return 'TRIPLE'
  if (outcome.bases === 2) return 'DOUBLE'
  if (outcome.bases === 1) return 'BASE HIT'
  return runs > 0 ? 'SAC FLY' : 'OUT'
}

export function nextBatter(sit: Situation): void {
  sit.balls = 0
  sit.strikes = 0
  sit.pitchOfAtBat = 0
  sit.batterIdx = (sit.batterIdx + 1) % 9
}

/** How much this call matters right now (for grading + report). */
export function leverageOf(sit: Situation): number {
  let lev = 1
  if (sit.balls === 3) lev += 0.55
  if (sit.strikes === 2) lev += 0.55
  lev += 0.3 * runnersOn(sit.bases)
  if (sit.bases.third || sit.bases.second) lev += 0.2
  if (sit.outs === 2) lev += 0.35
  const diff = sit.awayScore - sit.homeScore
  if (diff <= 0) lev += 0.4
  else if (diff === 1) lev += 0.3
  return Math.min(3.6, lev)
}

export const countText = (sit: Situation): string => `${sit.balls}-${sit.strikes}`
