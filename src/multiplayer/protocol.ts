import type { SwingOutcome, SwingPlan } from '../game/batter'
import type { Difficulty } from '../game/constants'
import type { PlayEvent, Situation } from '../game/engine'
import type { PitchDescriptor, Trajectory, Vec3 } from '../game/physics'
import type { PitchTypeKey } from '../game/pitchTypes'
import type { CallRecord, ReportCard } from '../game/report'
import type { BatterDef, PitcherDef } from '../game/roster'

export const PROTOCOL_VERSION = 2
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/
export const TARGET_VALUES = [-1.5, -0.75, 0, 0.75, 1.5] as const

export type MultiplayerRole = 'pitcher' | 'umpire'
export type RoomStatus = 'lobby' | 'playing' | 'betweenRounds' | 'seriesComplete' | 'disconnectPaused' | 'abandoned'
export type MultiplayerPhase =
  | 'lobby'
  | 'roundIntro'
  | 'pitchSelect'
  | 'command'
  | 'prePitch'
  | 'windup'
  | 'flight'
  | 'call'
  | 'challengeWindow'
  | 'challenge'
  | 'absReveal'
  | 'reveal'
  | 'swingResult'
  | 'roundComplete'
  | 'roleSwap'
  | 'seriesComplete'
  | 'disconnectPaused'

export interface PlayerPublic {
  id: string
  name: string
  connected: boolean
  ready: boolean
}

export interface RemoteActivePitch {
  pitch: PitchDescriptor
  plan: SwingPlan
  outcome: SwingOutcome | null
  batter: BatterDef
  timeScale: number
  flightStartAt: number
  flightDurMs: number
  hitTraj: Trajectory | null
  hitStartAt: number
  framing: { x: number; z: number }
  catchPos: Vec3
}

export interface RemoteReveal {
  record: CallRecord
  headline: string
  atBatOver: boolean
  batterHand: 'R' | 'L'
}

export interface RemoteBanner {
  key: number
  title: string
  sub?: string
  tone: 'neutral' | 'good' | 'bad' | 'gold'
}

export interface RemoteTickerItem {
  id: number
  text: string
  kind: PlayEvent['kind']
}

export interface AbsChallengeState {
  challengerLabel: string
  challengerSide: 'offense' | 'defense'
  callOnField: 'ball' | 'strike'
  truthStrike: boolean
  overturned: boolean
  verdictPlayed: boolean
  countBefore: string
  leverage: number
  edgeDistIn: number
  cross: { x: number; z: number }
  zoneTopFt: number
  zoneBotFt: number
  challengesBefore: number
  challengesMax: number
}

export interface PitchIntent {
  typeKey: PitchTypeKey
  targetIndex: number
}

export interface PitchingReport {
  score: number
  runsAllowed: number
  outsRecorded: number
  outsRequired: number
  pitchesThrown: number
  averageCommand: number
  runPrevention: number
  outCompletion: number
  efficiency: number
}

export interface RoundSummary {
  round: 1 | 2
  pitcherId: string
  umpireId: string
  finalSituation: Situation
  pitching: PitchingReport
  umpiring: ReportCard
  calls: CallRecord[]
}

export interface PlayerSeriesScore {
  playerId: string
  pitchScore: number
  umpScore: number
  overallScore: number
}

export interface SeriesResult {
  scores: PlayerSeriesScore[]
  pitchingChampionIds: string[]
  umpiringChampionIds: string[]
  overallChampionIds: string[]
}

export interface RoomSnapshot {
  roomCode: string
  status: RoomStatus
  phase: MultiplayerPhase
  phaseStartedAt: number
  phaseDeadline: number | null
  pausedPhase: MultiplayerPhase | null
  pausedRemainingMs: number | null
  round: 1 | 2
  difficulty: Difficulty
  hostId: string | null
  players: Array<PlayerPublic | null>
  pitcherId: string | null
  umpireId: string | null
  firstPitcherId: string | null
  intro: string
  seedText: string
  sit: Situation
  lineup: BatterDef[]
  pitcher: PitcherDef
  active: RemoteActivePitch | null
  reveal: RemoteReveal | null
  banner: RemoteBanner | null
  ticker: RemoteTickerItem[]
  calls: CallRecord[]
  callDeadline: number | null
  pendingAtBatOver: boolean
  pitchIntent: PitchIntent | null
  commandQuality: number | null
  pitcherChallengesLeft: number
  pitcherChallengesMax: number
  pendingCall: 'ball' | null
  absChallenge: AbsChallengeState | null
  roundSummaries: RoundSummary[]
  seriesResult: SeriesResult | null
  disconnectDeadline: number | null
}

interface ClientBase { protocolVersion: typeof PROTOCOL_VERSION }

export type ClientMessage =
  | (ClientBase & { type: 'join'; roomCode: string; playerToken: string; name: string })
  | (ClientBase & { type: 'configure'; difficulty: Difficulty; name?: string })
  | (ClientBase & { type: 'ready' })
  | (ClientBase & { type: 'pitchIntent'; intent: PitchIntent })
  | (ClientBase & { type: 'release'; commandQuality: number })
  | (ClientBase & { type: 'umpCall'; call: 'ball' | 'strike' })
  | (ClientBase & { type: 'pitcherChallenge' })
  | (ClientBase & { type: 'resumeReady' })
  | (ClientBase & { type: 'requestSnapshot' })
  | (ClientBase & { type: 'ping'; sentAt: number })

interface ServerBase {
  protocolVersion: typeof PROTOCOL_VERSION
  revision: number
  serverNow: number
}

export type ServerMessage =
  | (ServerBase & { type: 'welcome'; playerId: string; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'snapshot'; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'phaseChanged'; phase: MultiplayerPhase; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'presenceChanged'; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'pitchPrepared'; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'playResolved'; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'roundComplete'; summary: RoundSummary; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'seriesComplete'; result: SeriesResult; snapshot: RoomSnapshot })
  | (ServerBase & { type: 'error'; code: string; message: string })
  | (ServerBase & { type: 'pong'; sentAt: number })

export function roomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function targetAt(index: number): { u: number; v: number } {
  const safe = Math.max(0, Math.min(24, Math.trunc(index)))
  return { u: TARGET_VALUES[safe % 5], v: TARGET_VALUES[4 - Math.floor(safe / 5)] }
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const msg = raw as Record<string, unknown>
  if (msg.protocolVersion !== PROTOCOL_VERSION || typeof msg.type !== 'string') return null
  switch (msg.type) {
    case 'join':
      return typeof msg.roomCode === 'string' && ROOM_CODE_RE.test(msg.roomCode) &&
        typeof msg.playerToken === 'string' && msg.playerToken.length >= 8 && msg.playerToken.length <= 100 &&
        typeof msg.name === 'string' && msg.name.trim().length >= 1 && msg.name.trim().length <= 20
        ? msg as unknown as ClientMessage : null
    case 'configure':
      return (msg.difficulty === 'rookie' || msg.difficulty === 'pro' || msg.difficulty === 'legend') &&
        (msg.name === undefined || (typeof msg.name === 'string' && msg.name.trim().length >= 1 && msg.name.trim().length <= 20))
        ? msg as unknown as ClientMessage : null
    case 'ready': case 'resumeReady': case 'requestSnapshot': case 'pitcherChallenge':
      return msg as unknown as ClientMessage
    case 'pitchIntent': {
      const intent = msg.intent as Record<string, unknown> | undefined
      return intent && typeof intent.typeKey === 'string' && Number.isInteger(intent.targetIndex) &&
        Number(intent.targetIndex) >= 0 && Number(intent.targetIndex) <= 24
        ? msg as unknown as ClientMessage : null
    }
    case 'release':
      return typeof msg.commandQuality === 'number' && Number.isFinite(msg.commandQuality) &&
        msg.commandQuality >= 0 && msg.commandQuality <= 1 ? msg as unknown as ClientMessage : null
    case 'umpCall':
      return msg.call === 'ball' || msg.call === 'strike' ? msg as unknown as ClientMessage : null
    case 'ping':
      return typeof msg.sentAt === 'number' && Number.isFinite(msg.sentAt) ? msg as unknown as ClientMessage : null
    default:
      return null
  }
}
