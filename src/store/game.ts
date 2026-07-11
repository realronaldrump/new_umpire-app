import { create } from 'zustand'
import { audio } from '../audio/engine'
import { decideSwing, resolveSwing, type SwingOutcome, type SwingPlan } from '../game/batter'
import { DIFFICULTY, TIMING } from '../game/constants'
import {
  applyCalledPitch, applyHbp, applySwing, createScenario, leverageOf, nextBatter,
  type PlayEvent, type Situation,
} from '../game/engine'
import {
  battedTrajectory, generatePitch, posAt, velAt,
  type PitchDescriptor, type Trajectory, type Vec3,
} from '../game/physics'
import type { PitchTypeKey } from '../game/pitchTypes'
import { computeReport, type CallRecord, type ReportCard } from '../game/report'
import { createRng, randomSeedText, type RNG } from '../game/rng'
import { generateCloser, generateLineup, type BatterDef, type PitcherDef } from '../game/roster'
import { describeTake, zoneFor } from '../game/strikeZone'
import { effectiveCallWindowMs, effectiveTimeScale, useSettings } from './settings'
import type { RoomSnapshot } from '../multiplayer/protocol'

export type GameMode = 'single' | 'multiplayer'

export type Phase =
  | 'menu'
  | 'newBatter'
  | 'prePitch'
  | 'windup'
  | 'flight'
  | 'call'
  | 'reveal'
  | 'swingResult'
  | 'inningOver'

export interface ForcedPitch {
  typeKey: PitchTypeKey
  loc: 'center' | 'edge' | 'chase' | 'wild'
  forceTake: boolean
}

export interface ActivePitch {
  pitch: PitchDescriptor
  plan: SwingPlan
  outcome: SwingOutcome | null
  batter: BatterDef
  timeScale: number
  /** ms timestamps (performance.now domain); shifted when the game pauses. */
  flightStartMs: number
  flightDurMs: number
  hitTraj: Trajectory | null
  hitStartMs: number
  /** Visual-only mitt/receive shift the catcher uses to sell the pitch (ft). */
  framing: { x: number; z: number }
  /** Where the ball naturally arrives at the mitt plane (before framing). */
  catchPos: Vec3
}

export interface Banner {
  key: number
  title: string
  sub?: string
  tone: 'neutral' | 'good' | 'bad' | 'gold'
}

export interface TakeReveal {
  record: CallRecord
  headline: string
  atBatOver: boolean
  batterHand: 'R' | 'L'
}

export interface TickerItem {
  id: number
  text: string
  kind: PlayEvent['kind']
}

interface GameState {
  mode: GameMode
  phase: Phase
  phaseStart: number
  phaseDur: number
  paused: boolean
  pausedAt: number
  pauseMenuOpen: boolean

  seedText: string
  intro: string
  sit: Situation
  lineup: BatterDef[]
  pitcher: PitcherDef
  gameNo: number

  active: ActivePitch | null
  reveal: TakeReveal | null
  banner: Banner | null
  ticker: TickerItem[]
  calls: CallRecord[]
  callDeadline: number | null
  report: ReportCard | null
  pendingAtBatOver: boolean

  debugOpen: boolean
  slowMo: boolean
  autoCall: boolean
  orbit: boolean
  forced: ForcedPitch | null

  newGame: (seed?: string) => void
  playBall: () => void
  tick: (now: number) => void
  makeCall: (call: 'ball' | 'strike') => void
  hurry: () => void
  setPaused: (p: boolean, menu?: boolean) => void
  toggleDebug: () => void
  setDebug: (patch: Partial<Pick<GameState, 'slowMo' | 'autoCall' | 'orbit' | 'forced'>>) => void
  hydrateRemote: (snapshot: RoomSnapshot, serverNow: number) => void
}

let bannerKey = 1
let tickerId = 1
const now = () => performance.now()

/** internal, non-reactive */
let rng: RNG = createRng('boot')

const batterOf = (s: Pick<GameState, 'lineup' | 'sit'>): BatterDef => s.lineup[s.sit.batterIdx]

function pushEvents(state: GameState, events: PlayEvent[]): TickerItem[] {
  const items = events.map((e) => ({ id: tickerId++, text: e.text, kind: e.kind }))
  return [...items.reverse(), ...state.ticker].slice(0, 5)
}

function crowdReact(events: PlayEvent[]): void {
  for (const e of events) {
    if (e.kind === 'run') audio.swell(Math.min(1, 0.6 + e.runs * 0.2), 3)
    else if (e.kind === 'hit') audio.swell(0.5, 2.2)
    else if (e.kind === 'BB' || e.kind === 'HBP') audio.swell(0.35, 1.8)
    else if (e.kind === 'K' || e.kind === 'out') audio.grumble()
    else if (e.kind === 'end') {
      /* handled by stinger at inning end */
    }
  }
}

export const useGame = create<GameState>()((set, get) => {
  function enter(phase: Phase, dur: number, patch: Partial<GameState> = {}): void {
    set({ phase, phaseStart: now(), phaseDur: dur, ...patch })
  }

  function startPrePitch(): void {
    const s = get()
    const settings = useSettings.getState()
    const preset = DIFFICULTY[settings.difficulty]
    const batter = batterOf(s)
    const forced = s.forced

    const pitch = generatePitch(rng, s.pitcher, batter, {
      balls: s.sit.balls,
      strikes: s.sit.strikes,
      borderlineBias: preset.borderlineBias,
      forced: forced ? { typeKey: forced.typeKey, loc: forced.loc } : null,
    })

    let plan = decideSwing(rng, batter, pitch, s.sit)
    if (forced?.forceTake) plan = { swings: false, hbp: false, swingProb: 0 }
    const outcome = plan.swings ? resolveSwing(rng, batter, pitch, s.sit) : null

    const timeScale = effectiveTimeScale(settings) * (s.slowMo ? 0.3 : 1)
    const contactEnds = outcome !== null && outcome.kind !== 'whiff'
    const flightSec = (contactEnds ? pitch.traj.T : pitch.traj.catchT) / timeScale

    // The catcher's frame job: nudge borderline receives toward the zone.
    const catchPos = posAt(pitch.traj, pitch.traj.catchT)
    const framing = { x: 0, z: 0 }
    if (!plan.swings && !plan.hbp && pitch.metrics.edgeDistIn > -2 && pitch.metrics.edgeDistIn < 5) {
      const zone = zoneFor(batter)
      const toCenterX = -pitch.cross.x
      const toCenterZ = zone.centerZFt - pitch.cross.z
      const m = Math.hypot(toCenterX, toCenterZ) || 1
      const inches = preset.framingInches * rng.range(0.65, 1.15)
      framing.x = (toCenterX / m) * (inches / 12)
      framing.z = (toCenterZ / m) * (inches / 12)
    }

    enter('prePitch', TIMING.prePitchBaseMs + rng.range(0, TIMING.prePitchJitterMs), {
      active: {
        pitch, plan, outcome, batter, timeScale,
        flightStartMs: 0,
        flightDurMs: flightSec * 1000,
        hitTraj: null,
        hitStartMs: 0,
        framing,
        catchPos,
      },
      reveal: null,
      banner: null,
      forced: null,
      callDeadline: null,
    })
    audio.setTension(leverageOf(s.sit) / 3.6)
  }

  function openCallWindow(): void {
    const s = get()
    if (!s.active) return
    const windowMs = effectiveCallWindowMs(useSettings.getState())
    audio.stopWhoosh()
    audio.mittPop(s.active.pitch.mph)
    enter('call', windowMs, { callDeadline: now() + windowMs })
  }

  function gradeAndReveal(call: 'ball' | 'strike', hesitated: boolean): void {
    const s = get()
    if (!s.active) return
    const { pitch, batter } = s.active
    const settings = useSettings.getState()

    const truth = pitch.truthStrike
    const correct = hesitated && settings.hesitationPolicy === 'miss'
      ? false
      : (call === 'strike') === truth
    const leverage = leverageOf(s.sit)
    const countBefore = `${s.sit.balls}-${s.sit.strikes}`

    // The player's call (or the true call, after a hesitation) governs the game.
    const applied = hesitated ? (truth ? 'strike' : 'ball') : call
    const sit = structuredClone(s.sit)
    const res = applyCalledPitch(sit, applied, batter.name)

    const zone = zoneFor(batter)
    const record: CallRecord = {
      pitchNo: sit.totalPitches,
      batterName: batter.name,
      countBefore,
      playerCall: applied,
      truthStrike: truth,
      correct,
      hesitated,
      edgeDistIn: pitch.metrics.edgeDistIn,
      nearestEdge: pitch.metrics.nearestEdge,
      leverage,
      endedAtBat: res.atBatOver,
      note: hesitated
        ? 'No call before the window closed — the book scored it for you.'
        : describeTake(call === 'strike', pitch.metrics),
      cross: { x: pitch.zonePoint.x, z: pitch.zonePoint.z },
      zoneTopFt: zone.topFt,
      zoneBotFt: zone.botFt,
    }

    if (!hesitated) audio.umpCall(applied, settings.umpVoice)
    crowdReact(res.events)
    if (!correct && !hesitated && Math.abs(pitch.metrics.edgeDistIn) > 3 && applied === 'strike' && !truth) {
      audio.grumble() // the park saw that one
    }
    if (sit.over) {
      audio.stinger(sit.walkOff ? 'walkoff' : 'over')
    }

    const dur = TIMING.revealMs + (res.atBatOver ? TIMING.revealAtBatEndBonusMs : 0)
    enter('reveal', dur, {
      sit,
      pendingAtBatOver: res.atBatOver,
      calls: [...s.calls, record],
      reveal: { record, headline: res.headline, atBatOver: res.atBatOver, batterHand: batter.hand },
      ticker: pushEvents(s, res.events),
      banner: {
        key: bannerKey++,
        title: res.headline,
        sub: res.atBatOver ? undefined : `Count ${sit.balls}-${sit.strikes}`,
        tone: res.atBatOver ? 'gold' : 'neutral',
      },
      callDeadline: null,
    })
  }

  function resolveSwingResult(): void {
    const s = get()
    if (!s.active?.outcome) return
    const { pitch, outcome, batter } = s.active
    const sit = structuredClone(s.sit)
    const res = applySwing(sit, outcome, batter.name, rng)

    let hitTraj: Trajectory | null = null
    let dur: number
    if (outcome.kind === 'whiff') {
      audio.mittPop(pitch.mph)
      audio.swell(sit.strikes === 0 && res.atBatOver ? 0.45 : 0.2, 1.6)
      dur = TIMING.whiffResultMs
    } else {
      audio.stopWhoosh()
      audio.batCrack(outcome.kind === 'inPlay' ? outcome.quality : 'medium')
      const from = posAt(pitch.traj, pitch.traj.T)
      if (outcome.kind === 'foul') {
        hitTraj = battedTrajectory(from, {
          x: rng.range(-55, 55),
          y: -rng.range(35, 85),
          z: rng.range(28, 66),
        }, 1.5)
        dur = TIMING.foulResultMs
      } else {
        const style = outcome.bases === 4 ? 'deep' : outcome.outType ?? (outcome.bases >= 2 ? 'line' : 'ground')
        const v: Vec3 =
          style === 'ground' ? { x: rng.range(-32, 32), y: rng.range(60, 105), z: rng.range(5, 15) } :
          style === 'pop' ? { x: rng.range(-18, 18), y: rng.range(12, 30), z: rng.range(68, 92) } :
          style === 'fly' ? { x: rng.range(-38, 38), y: rng.range(55, 95), z: rng.range(52, 82) } :
          style === 'deep' ? { x: rng.range(-30, 30), y: rng.range(105, 140), z: rng.range(52, 72) } :
          { x: rng.range(-28, 28), y: rng.range(95, 130), z: rng.range(16, 30) }
        hitTraj = battedTrajectory(from, v, 2.6)
        dur = TIMING.inPlayResultMs
      }
      crowdReact(res.events)
    }
    if (sit.over) audio.stinger(sit.walkOff ? 'walkoff' : 'over')

    const tone: Banner['tone'] =
      res.headline.includes('HOMER') || res.headline === 'HOME RUN' || sit.walkOff ? 'gold' :
      outcome.kind === 'inPlay' && outcome.bases > 0 ? 'good' :
      res.atBatOver ? 'bad' : 'neutral'

    enter('swingResult', dur, {
      sit,
      pendingAtBatOver: res.atBatOver,
      active: { ...s.active, hitTraj, hitStartMs: now() },
      ticker: pushEvents(s, res.events),
      banner: {
        key: bannerKey++,
        title: res.headline,
        sub: res.atBatOver ? undefined : `Count ${sit.balls}-${sit.strikes}`,
        tone,
      },
    })
  }

  function resolveHbpResult(): void {
    const s = get()
    if (!s.active) return
    const { pitch, batter } = s.active
    const sit = structuredClone(s.sit)
    const res = applyHbp(sit, batter.name)
    audio.batCrack('weak')
    audio.grumble()
    crowdReact(res.events)
    if (sit.over) audio.stinger(sit.walkOff ? 'walkoff' : 'over')
    const from = posAt(pitch.traj, pitch.traj.T)
    enter('swingResult', TIMING.hbpResultMs, {
      sit,
      pendingAtBatOver: true,
      active: {
        ...s.active,
        hitTraj: battedTrajectory(from, { x: rng.range(-25, 25), y: -rng.range(8, 20), z: rng.range(10, 24) }, 1.2),
        hitStartMs: now(),
      },
      ticker: pushEvents(s, res.events),
      banner: { key: bannerKey++, title: res.headline, sub: 'Take your base', tone: 'neutral' },
    })
  }

  function afterResolution(): void {
    const s = get()
    if (s.sit.over) {
      enter('inningOver', Infinity, {
        report: computeReport(s.calls),
        banner: null,
        active: null,
      })
      return
    }
    if (s.pendingAtBatOver) {
      const sit = structuredClone(s.sit)
      nextBatter(sit)
      set({ sit })
      enterNewBatter()
    } else {
      startPrePitch()
    }
  }

  function enterNewBatter(): void {
    const s = get()
    const b = batterOf(s)
    enter('newBatter', TIMING.newBatterMs, {
      active: null,
      reveal: null,
      banner: {
        key: bannerKey++,
        title: `NOW BATTING · ${b.name.toUpperCase()}`,
        sub: `Bats ${b.hand} · ${Math.floor(b.heightIn / 12)}'${b.heightIn % 12}" · ${b.avgLabel} · ${['leadoff', '2nd', '3rd', 'cleanup', '5th', '6th', '7th', '8th', '9th'][b.order - 1]} in the order`,
        tone: 'neutral',
      },
    })
  }

  return {
    mode: 'single',
    phase: 'menu',
    phaseStart: 0,
    phaseDur: 0,
    paused: false,
    pausedAt: 0,
    pauseMenuOpen: false,

    seedText: '',
    intro: '',
    sit: {
      awayScore: 0, homeScore: 0, outs: 0, balls: 0, strikes: 0,
      bases: { first: false, second: false, third: false },
      batterIdx: 0, pitchOfAtBat: 0, totalPitches: 0, over: false, walkOff: false,
    },
    lineup: [],
    pitcher: generateCloser(createRng('boot-pitcher')),
    gameNo: 0,

    active: null,
    reveal: null,
    banner: null,
    ticker: [],
    calls: [],
    callDeadline: null,
    report: null,
    pendingAtBatOver: false,

    debugOpen: false,
    slowMo: false,
    autoCall: false,
    orbit: false,
    forced: null,

    newGame: (seed) => {
      const seedText = (seed ?? '').trim() || randomSeedText()
      rng = createRng('game:' + seedText)
      const scenario = createScenario(rng)
      set({
        mode: 'single',
        seedText,
        intro: scenario.intro,
        sit: scenario.situation,
        lineup: generateLineup(rng),
        pitcher: generateCloser(rng),
        calls: [],
        ticker: [],
        active: null,
        reveal: null,
        banner: null,
        report: null,
        callDeadline: null,
        pendingAtBatOver: false,
        phase: 'menu',
        paused: false,
        pauseMenuOpen: false,
        gameNo: get().gameNo + 1,
      })
    },

    playBall: () => {
      const s = get()
      if (s.phase !== 'menu') return
      audio.init()
      audio.uiClick()
      audio.swell(0.35, 2.5)
      enterNewBatter()
      // Lead with the scenario stakes before the batter announcement takes over.
      set({
        banner: { key: bannerKey++, title: 'BOTTOM OF THE 9TH', sub: s.intro, tone: 'gold' },
        ticker: [{ id: tickerId++, text: s.intro, kind: 'info' }],
        phaseDur: TIMING.newBatterMs + 1100,
      })
    },

    tick: (t) => {
      const s = get()
      if (s.mode === 'multiplayer') return
      if (s.paused || s.phase === 'menu' || s.phase === 'inningOver') return
      const elapsed = t - s.phaseStart

      switch (s.phase) {
        case 'newBatter':
          if (elapsed >= s.phaseDur) startPrePitch()
          break
        case 'prePitch':
          if (elapsed >= s.phaseDur) enter('windup', TIMING.windupMs)
          break
        case 'windup':
          if (elapsed >= s.phaseDur && s.active) {
            audio.whoosh(s.active.flightDurMs / 1000)
            enter('flight', s.active.flightDurMs, {
              active: { ...s.active, flightStartMs: now() },
            })
          }
          break
        case 'flight':
          if (elapsed >= s.phaseDur && s.active) {
            if (s.active.plan.hbp) resolveHbpResult()
            else if (s.active.plan.swings) resolveSwingResult()
            else openCallWindow()
          }
          break
        case 'call':
          if (s.autoCall && s.callDeadline !== null && elapsed >= TIMING.autoCallDelayMs && s.active) {
            gradeAndReveal(s.active.pitch.truthStrike ? 'strike' : 'ball', false)
          } else if (s.callDeadline !== null && t >= s.callDeadline) {
            gradeAndReveal('ball', true) // hesitation; true call is applied inside
          }
          break
        case 'reveal':
        case 'swingResult':
          if (elapsed >= s.phaseDur) afterResolution()
          break
      }
    },

    makeCall: (call) => {
      const s = get()
      if (s.mode === 'multiplayer') return
      if (s.phase !== 'call' || s.paused) return
      gradeAndReveal(call, false)
    },

    hurry: () => {
      const s = get()
      if (s.paused) return
      if (s.phase === 'newBatter' || s.phase === 'prePitch' || s.phase === 'reveal' || s.phase === 'swingResult') {
        set({ phaseStart: now() - s.phaseDur - 1 })
      }
    },

    setPaused: (p, menu = false) => {
      const s = get()
      if (p === s.paused) {
        if (p) set({ pauseMenuOpen: menu || s.pauseMenuOpen })
        return
      }
      if (p) {
        audio.suspend()
        set({ paused: true, pausedAt: now(), pauseMenuOpen: menu })
      } else {
        const delta = now() - s.pausedAt
        audio.resume()
        set({
          paused: false,
          pauseMenuOpen: false,
          phaseStart: s.phaseStart + delta,
          callDeadline: s.callDeadline !== null ? s.callDeadline + delta : null,
          active: s.active
            ? {
                ...s.active,
                flightStartMs: s.active.flightStartMs ? s.active.flightStartMs + delta : 0,
                hitStartMs: s.active.hitStartMs ? s.active.hitStartMs + delta : 0,
              }
            : null,
        })
      }
    },

    toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
    setDebug: (patch) => set(patch),
    hydrateRemote: (snapshot, serverNow) => {
      const perfNow = performance.now()
      const toPerf = (epoch: number): number => epoch ? perfNow + (epoch - serverNow) : 0
      const remotePhase: Phase =
        snapshot.phase === 'windup' ? 'windup' :
        snapshot.phase === 'flight' ? 'flight' :
        snapshot.phase === 'call' ? 'call' :
        snapshot.phase === 'reveal' ? 'reveal' :
        snapshot.phase === 'swingResult' ? 'swingResult' :
        snapshot.phase === 'seriesComplete' || snapshot.phase === 'roleSwap' || snapshot.phase === 'roundComplete' ? 'inningOver' :
        snapshot.phase === 'lobby' ? 'menu' : 'prePitch'
      const active: ActivePitch | null = snapshot.active ? {
        ...snapshot.active,
        flightStartMs: toPerf(snapshot.active.flightStartAt),
        hitStartMs: toPerf(snapshot.active.hitStartAt),
      } : null
      set({
        mode: 'multiplayer',
        phase: remotePhase,
        phaseStart: toPerf(snapshot.phaseStartedAt),
        phaseDur: snapshot.phaseDeadline === null ? Infinity : Math.max(1, snapshot.phaseDeadline - snapshot.phaseStartedAt),
        paused: snapshot.status === 'disconnectPaused',
        pausedAt: snapshot.status === 'disconnectPaused' ? perfNow : 0,
        pauseMenuOpen: false,
        seedText: snapshot.seedText,
        intro: snapshot.intro,
        sit: structuredClone(snapshot.sit),
        lineup: snapshot.lineup,
        pitcher: snapshot.pitcher,
        active,
        reveal: snapshot.reveal,
        banner: snapshot.banner,
        ticker: snapshot.ticker,
        calls: snapshot.calls,
        callDeadline: snapshot.callDeadline === null ? null : toPerf(snapshot.callDeadline),
        report: snapshot.roundSummaries[snapshot.roundSummaries.length - 1]?.umpiring ?? null,
        pendingAtBatOver: snapshot.pendingAtBatOver,
      })
    },
  }
})

/** Ball world position for the current frame (game coords). Called from useFrame. */
export function ballStateAt(t: number): { pos: Vec3; vel: Vec3; visible: boolean; trailing: boolean; spinT: number } | null {
  const s = useGame.getState()
  const a = s.active
  if (!a) return null
  const ts = a.timeScale

  if (s.phase === 'flight' && a.flightStartMs) {
    const ft = Math.max(0, (t - a.flightStartMs) / 1000) * ts
    const pos = posAt(a.pitch.traj, ft)
    // Blend in the catcher's framing shift over the last stretch of flight.
    const frac = ft / a.pitch.traj.catchT
    if (frac > 0.93 && !a.plan.swings) {
      const k = (frac - 0.93) / 0.07
      const e = k * k * (3 - 2 * k)
      pos.x += a.framing.x * e
      pos.z += a.framing.z * e
    }
    return { pos, vel: velAt(a.pitch.traj, ft), visible: true, trailing: true, spinT: ft }
  }

  if (s.phase === 'call' || (s.phase === 'reveal' && !a.hitTraj)) {
    const pos = posAt(a.pitch.traj, a.pitch.traj.catchT)
    if (!a.plan.swings) {
      pos.x += a.framing.x
      pos.z += a.framing.z
    }
    return { pos, vel: { x: 0, y: 0, z: 0 }, visible: true, trailing: false, spinT: a.pitch.traj.catchT }
  }

  if (s.phase === 'swingResult') {
    if (a.hitTraj) {
      const ht = Math.max(0, (t - a.hitStartMs) / 1000)
      if (ht > a.hitTraj.T) return { pos: posAt(a.hitTraj, a.hitTraj.T), vel: { x: 0, y: 0, z: 0 }, visible: false, trailing: false, spinT: 0 }
      const pos = posAt(a.hitTraj, ht)
      if (pos.z < 0.12) pos.z = 0.12
      return { pos, vel: velAt(a.hitTraj, ht), visible: true, trailing: true, spinT: ht * 3 }
    }
    // Whiff: ball sits in the mitt.
    const pos = posAt(a.pitch.traj, a.pitch.traj.catchT)
    return { pos, vel: { x: 0, y: 0, z: 0 }, visible: true, trailing: false, spinT: a.pitch.traj.catchT }
  }

  return null
}
