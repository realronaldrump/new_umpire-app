import { DurableObject } from 'cloudflare:workers'
import { decideSwing, resolveSwing } from '../src/game/batter'
import { ABS_CHALLENGES_PER_SIDE, DIFFICULTY, TIMING } from '../src/game/constants'
import {
  applyCalledPitch, applyHbp, applySwing, createScenario, leverageOf, nextBatter,
  type PlayEvent, type Situation,
} from '../src/game/engine'
import { battedTrajectory, generatePitch, posAt, type Vec3 } from '../src/game/physics'
import { computeReport, type CallRecord } from '../src/game/report'
import { clamp, createRng } from '../src/game/rng'
import { generateCloser, generateLineup } from '../src/game/roster'
import { describeTake, zoneFor } from '../src/game/strikeZone'
import {
  PROTOCOL_VERSION, ROOM_CODE_RE, parseClientMessage, targetAt,
  type ClientMessage, type MultiplayerPhase, type PitchIntent, type PlayerPublic,
  type RemoteActivePitch, type RemoteBanner, type RemoteTickerItem,
  type RoomSnapshot, type RoundSummary, type ServerMessage,
} from '../src/multiplayer/protocol'
import { computePitchingReport, computeSeriesResult } from '../src/multiplayer/scoring'

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDurableObject>
  TIMING_SCALE?: string
}

interface InternalPlayer extends PlayerPublic {
  token: string
  lastSeenAt: number
}

interface StoredRoom extends Omit<RoomSnapshot, 'players'> {
  players: Array<InternalPlayer | null>
  revision: number
  initialSituation: Situation
  initialHomeScore: number
  initialTotalPitches: number
  commandQualities: number[]
  lastActivityAt: number
  bannerKey: number
  tickerId: number
  pausedBanner: RemoteBanner | null
}

interface SocketAttachment {
  roomCode: string
  playerId: string | null
}

type WithoutServerBase<T> = T extends unknown ? Omit<T, 'protocolVersion' | 'revision' | 'serverNow'> : never
type ServerPayload = WithoutServerBase<ServerMessage>

const STATE_KEY = 'room'
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000
const RECONNECT_MS = 90_000
const HEARTBEAT_TIMEOUT_MS = 25_000
const CALL_GRACE_MS = 150
const PITCH_SELECT_MS = 12_000
const COMMAND_MS = 1_600
const ROUND_INTRO_MS = 1_800
const PRE_PITCH_MS = 900
const CHALLENGE_WINDOW_MS = 2_200

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'umpire-multiplayer', protocolVersion: PROTOCOL_VERSION }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
    const match = url.pathname.match(/^\/room\/([A-HJ-NP-Z2-9]{6})$/)
    if (!match) return new Response('Not found', { status: 404 })
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }
    const id = env.ROOMS.idFromName(match[1])
    return env.ROOMS.get(id).fetch(request)
  },
} satisfies ExportedHandler<Env>

export class RoomDurableObject extends DurableObject<Env> {
  private timingScale: number

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.timingScale = clamp(Number(env.TIMING_SCALE ?? '1') || 1, 0.02, 1)
  }

  async fetch(request: Request): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/room\/([A-HJ-NP-Z2-9]{6})$/)
    if (!match || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    const attachment: SocketAttachment = { roomCode: match[1], playerId: null }
    server.serializeAttachment(attachment)
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.handleWebSocketMessage(ws, raw))
  }

  private async handleWebSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return this.sendError(ws, null, 'BAD_MESSAGE', 'Only JSON text messages are supported.')
    let value: unknown
    try { value = JSON.parse(raw) } catch { return this.sendError(ws, null, 'BAD_JSON', 'Message was not valid JSON.') }
    const message = parseClientMessage(value)
    if (!message) return this.sendError(ws, null, 'BAD_MESSAGE', 'Message failed protocol validation.')
    const attachment = ws.deserializeAttachment() as SocketAttachment

    if (message.type === 'join') {
      await this.join(ws, attachment, message)
      return
    }

    const state = await this.loadRoom()
    if (!state || !attachment.playerId) return this.sendError(ws, state, 'NOT_JOINED', 'Join the room before sending actions.')
    const player = state.players.find((candidate) => candidate?.id === attachment.playerId)
    if (!player) return this.sendError(ws, state, 'NOT_SEATED', 'This player no longer has a seat.')
    const wasDisconnected = !player.connected
    player.connected = true
    player.lastSeenAt = Date.now()

    if (message.type === 'ping') {
      if (wasDisconnected) await this.commit(state, 'presenceChanged')
      else {
        await this.ctx.storage.put(STATE_KEY, state)
        await this.scheduleNextAlarm(state)
      }
      this.send(ws, state, { type: 'pong', sentAt: message.sentAt })
      return
    }

    switch (message.type) {
      case 'configure':
        if (state.status !== 'lobby' || state.hostId !== player.id) return this.sendError(ws, state, 'NOT_HOST', 'Only the host can configure a waiting room.')
        state.difficulty = message.difficulty
        if (message.name) player.name = message.name.trim()
        await this.commit(state, 'snapshot')
        break
      case 'ready':
        await this.handleReady(ws, state, player)
        break
      case 'pitchIntent':
        await this.handlePitchIntent(ws, state, player, message.intent)
        break
      case 'release':
        await this.handleRelease(ws, state, player, message.commandQuality)
        break
      case 'umpCall':
        await this.handleUmpCall(ws, state, player, message.call)
        break
      case 'pitcherChallenge':
        await this.handlePitcherChallenge(ws, state, player)
        break
      case 'resumeReady':
        await this.handleResumeReady(ws, state, player)
        break
      case 'requestSnapshot':
        this.send(ws, state, { type: 'snapshot', snapshot: this.snapshot(state) })
        break
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.handleWebSocketClose(ws))
  }

  private async handleWebSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null
    const state = await this.loadRoom()
    if (!state || !attachment?.playerId) return
    const player = state.players.find((candidate) => candidate?.id === attachment.playerId)
    if (!player) return
    const replacementConnected = this.ctx.getWebSockets().some((other) => {
      if (other === ws) return false
      const otherAttachment = other.deserializeAttachment() as SocketAttachment | null
      return otherAttachment?.playerId === player.id
    })
    if (replacementConnected) return
    player.connected = false
    player.ready = false
    if (state.status === 'playing') this.pauseForDisconnect(state)
    await this.commit(state, 'presenceChanged')
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.handleWebSocketClose(ws))
  }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.handleAlarm())
  }

  private async handleAlarm(): Promise<void> {
    const state = await this.loadRoom()
    if (!state) return
    const now = Date.now()

    if (now - state.lastActivityAt >= ROOM_IDLE_MS) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1001, 'Room expired')
      await this.ctx.storage.deleteAlarm()
      await this.ctx.storage.deleteAll()
      return
    }

    if (state.status === 'disconnectPaused' && state.disconnectDeadline !== null && now >= state.disconnectDeadline) {
      state.status = 'abandoned'
      state.disconnectDeadline = null
      state.phaseDeadline = null
      state.banner = { key: state.bannerKey++, title: 'SERIES ABANDONED', sub: 'A player did not reconnect in time.', tone: 'bad' }
      await this.commit(state, 'phaseChanged')
      return
    }

    if (state.status === 'playing') {
      const stale = state.players.find((player) => player?.connected && now - player.lastSeenAt >= HEARTBEAT_TIMEOUT_MS)
      if (stale) {
        stale.connected = false
        stale.ready = false
        this.pauseForDisconnect(state)
        await this.commit(state, 'presenceChanged')
        return
      }
      if (state.phaseDeadline !== null && now >= state.phaseDeadline) {
        await this.advancePhase(state)
        await this.commit(state, state.phase === 'roundComplete' || state.phase === 'roleSwap' ? 'roundComplete' : 'phaseChanged')
        return
      }
    }

    await this.scheduleNextAlarm(state)
  }

  private async join(ws: WebSocket, attachment: SocketAttachment, message: Extract<ClientMessage, { type: 'join' }>): Promise<void> {
    if (message.roomCode !== attachment.roomCode || !ROOM_CODE_RE.test(message.roomCode)) {
      return this.sendError(ws, null, 'ROOM_MISMATCH', 'Invite code does not match this connection.')
    }
    const state = await this.loadOrCreate(message.roomCode)
    let player = state.players.find((candidate) => candidate?.token === message.playerToken) ?? null
    if (!player) {
      const seat = state.players.findIndex((candidate) => candidate === null)
      if (seat < 0) return this.sendError(ws, state, 'ROOM_FULL', 'This room already has two players.')
      player = {
        id: crypto.randomUUID(), token: message.playerToken, name: message.name.trim(),
        connected: true, ready: false, lastSeenAt: Date.now(),
      }
      state.players[seat] = player
      if (!state.hostId) state.hostId = player.id
    } else {
      player.name = message.name.trim()
      player.connected = true
      player.ready = false
      player.lastSeenAt = Date.now()
    }
    attachment.playerId = player.id
    ws.serializeAttachment(attachment)
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue
      const otherAttachment = other.deserializeAttachment() as SocketAttachment | null
      if (otherAttachment?.playerId === player.id) other.close(4001, 'Reconnected elsewhere')
    }
    state.revision++
    state.lastActivityAt = Date.now()
    await this.ctx.storage.put(STATE_KEY, state)
    await this.scheduleNextAlarm(state)
    this.send(ws, state, { type: 'welcome', playerId: player.id, snapshot: this.snapshot(state) })
    this.broadcast(state, { type: 'presenceChanged', snapshot: this.snapshot(state) }, ws)
  }

  private async handleReady(ws: WebSocket, state: StoredRoom, player: InternalPlayer): Promise<void> {
    if (state.status !== 'lobby' && state.status !== 'betweenRounds') return this.sendError(ws, state, 'BAD_PHASE', 'Ready is not available right now.')
    player.ready = true
    const seated = state.players.filter((candidate): candidate is InternalPlayer => Boolean(candidate))
    if (seated.length === 2 && seated.every((candidate) => candidate.connected && candidate.ready)) {
      if (state.status === 'lobby') this.startSeries(state)
      else this.startRoundTwo(state)
    }
    await this.commit(state, 'phaseChanged')
  }

  private async handlePitchIntent(ws: WebSocket, state: StoredRoom, player: InternalPlayer, intent: PitchIntent): Promise<void> {
    if (state.status !== 'playing' || state.phase !== 'pitchSelect' || state.pitcherId !== player.id) {
      return this.sendError(ws, state, 'NOT_PITCHER', 'Only the active pitcher can choose a pitch.')
    }
    if (!state.pitcher.arsenal.some(([key]) => key === intent.typeKey)) {
      return this.sendError(ws, state, 'BAD_PITCH', 'That pitch is not in this closer’s arsenal.')
    }
    state.pitchIntent = intent
    this.enter(state, 'command', COMMAND_MS)
    await this.commit(state, 'phaseChanged')
  }

  private async handleRelease(ws: WebSocket, state: StoredRoom, player: InternalPlayer, quality: number): Promise<void> {
    if (state.status !== 'playing' || state.phase !== 'command' || state.pitcherId !== player.id || !state.pitchIntent) {
      return this.sendError(ws, state, 'BAD_RELEASE', 'There is no delivery to release.')
    }
    this.preparePitch(state, clamp(quality, 0, 1))
    await this.commit(state, 'pitchPrepared')
  }

  private async handleUmpCall(ws: WebSocket, state: StoredRoom, player: InternalPlayer, call: 'ball' | 'strike'): Promise<void> {
    if (state.status !== 'playing' || state.phase !== 'call' || state.umpireId !== player.id || !state.active) {
      return this.sendError(ws, state, 'NOT_UMPIRE', 'Only the active umpire can make this call.')
    }
    if (state.callDeadline !== null && Date.now() > state.callDeadline + CALL_GRACE_MS * this.timingScale) {
      return this.sendError(ws, state, 'LATE_CALL', 'The call window has closed.')
    }
    if (call === 'ball' && state.pitcherChallengesLeft > 0) {
      state.pendingCall = 'ball'
      state.callDeadline = null
      state.banner = {
        key: state.bannerKey++, title: 'BALL — CHALLENGE WINDOW',
        sub: `${state.pitcherChallengesLeft} ABS challenge${state.pitcherChallengesLeft === 1 ? '' : 's'} available to the pitcher`, tone: 'neutral',
      }
      this.enter(state, 'challengeWindow', CHALLENGE_WINDOW_MS)
      await this.commit(state, 'phaseChanged')
      return
    }
    this.gradeCall(state, call, false)
    await this.commit(state, 'playResolved')
  }

  private async handlePitcherChallenge(ws: WebSocket, state: StoredRoom, player: InternalPlayer): Promise<void> {
    if (state.status !== 'playing' || state.phase !== 'challengeWindow' || state.pitcherId !== player.id ||
        state.pendingCall !== 'ball' || !state.active || state.pitcherChallengesLeft <= 0) {
      return this.sendError(ws, state, 'BAD_CHALLENGE', 'The active pitcher cannot challenge this call.')
    }
    this.startPitcherChallenge(state)
    await this.commit(state, 'phaseChanged')
  }

  private async handleResumeReady(ws: WebSocket, state: StoredRoom, player: InternalPlayer): Promise<void> {
    if (state.status !== 'disconnectPaused') return this.sendError(ws, state, 'NOT_PAUSED', 'The series is not waiting for a reconnect.')
    player.ready = true
    const seated = state.players.filter((candidate): candidate is InternalPlayer => Boolean(candidate))
    if (seated.length === 2 && seated.every((candidate) => candidate.connected && candidate.ready) && state.pausedPhase) {
      state.status = 'playing'
      state.phase = state.pausedPhase
      state.phaseStartedAt = Date.now()
      state.phaseDeadline = state.pausedRemainingMs === null ? null : Date.now() + state.pausedRemainingMs
      if (state.phase === 'call') state.callDeadline = state.phaseDeadline
      state.pausedPhase = null
      state.pausedRemainingMs = null
      state.disconnectDeadline = null
      state.banner = state.pausedBanner
      state.pausedBanner = null
      for (const candidate of seated) candidate.ready = false
    }
    await this.commit(state, 'phaseChanged')
  }

  private startSeries(state: StoredRoom): void {
    const players = state.players.filter((candidate): candidate is InternalPlayer => Boolean(candidate))
    const first = createRng(`${state.seedText}:roles`).chance(0.5) ? players[0] : players[1]
    const second = players.find((player) => player.id !== first.id) ?? players[0]
    state.firstPitcherId = first.id
    state.pitcherId = first.id
    state.umpireId = second.id
    state.round = 1
    this.resetRound(state)
  }

  private startRoundTwo(state: StoredRoom): void {
    const players = state.players.filter((candidate): candidate is InternalPlayer => Boolean(candidate))
    const secondPitcher = players.find((player) => player.id !== state.firstPitcherId) ?? players[0]
    const secondUmpire = players.find((player) => player.id !== secondPitcher.id) ?? players[1]
    state.round = 2
    state.pitcherId = secondPitcher.id
    state.umpireId = secondUmpire.id
    this.resetRound(state)
  }

  private resetRound(state: StoredRoom): void {
    state.status = 'playing'
    state.sit = structuredClone(state.initialSituation)
    state.active = null
    state.reveal = null
    state.banner = {
      key: state.bannerKey++, title: `ROUND ${state.round} · PLAY BALL`,
      sub: state.intro, tone: 'gold',
    }
    state.ticker = [{ id: state.tickerId++, text: state.intro, kind: 'info' }]
    state.calls = []
    state.callDeadline = null
    state.pendingAtBatOver = false
    state.pitchIntent = null
    state.commandQuality = null
    state.commandQualities = []
    state.pitcherChallengesLeft = ABS_CHALLENGES_PER_SIDE
    state.pitcherChallengesMax = ABS_CHALLENGES_PER_SIDE
    state.pendingCall = null
    state.absChallenge = null
    for (const player of state.players) if (player) player.ready = false
    this.enter(state, 'roundIntro', ROUND_INTRO_MS)
  }

  private async advancePhase(state: StoredRoom): Promise<void> {
    switch (state.phase) {
      case 'roundIntro':
        this.openPitchSelection(state)
        break
      case 'pitchSelect':
        state.pitchIntent = { typeKey: state.pitcher.arsenal[0][0], targetIndex: 12 }
        this.preparePitch(state, 0.25)
        break
      case 'command':
        this.preparePitch(state, 0.25)
        break
      case 'prePitch':
        this.enter(state, 'windup', TIMING.windupMs)
        break
      case 'windup':
        if (!state.active) return this.openPitchSelection(state)
        state.active.flightStartAt = Date.now()
        this.enter(state, 'flight', state.active.flightDurMs)
        break
      case 'flight':
        if (!state.active) return this.openPitchSelection(state)
        if (state.active.plan.hbp) this.resolveHbpPlay(state)
        else if (state.active.plan.swings) this.resolveSwingPlay(state)
        else {
          const callMs = DIFFICULTY[state.difficulty].callWindowMs
          this.enter(state, 'call', callMs)
          state.callDeadline = state.phaseDeadline
        }
        break
      case 'call':
        this.gradeCall(state, 'ball', true)
        break
      case 'challengeWindow':
        state.pendingCall = null
        this.gradeCall(state, 'ball', false)
        break
      case 'challenge':
        this.enter(state, 'absReveal', TIMING.absTrackMs + TIMING.absVerdictMs)
        break
      case 'absReveal':
        this.resolvePitcherChallenge(state)
        break
      case 'reveal': case 'swingResult':
        this.afterResolution(state)
        break
      default:
        break
    }
  }

  private openPitchSelection(state: StoredRoom): void {
    const batter = state.lineup[state.sit.batterIdx]
    state.active = null
    state.reveal = null
    state.pitchIntent = null
    state.commandQuality = null
    state.callDeadline = null
    state.pendingCall = null
    state.absChallenge = null
    state.banner = {
      key: state.bannerKey++, title: `NOW BATTING · ${batter.name.toUpperCase()}`,
      sub: `ROUND ${state.round} · ${state.sit.outs} OUT${state.sit.outs === 1 ? '' : 'S'}`, tone: 'neutral',
    }
    this.enter(state, 'pitchSelect', PITCH_SELECT_MS)
  }

  private preparePitch(state: StoredRoom, commandQuality: number): void {
    const intent = state.pitchIntent ?? { typeKey: state.pitcher.arsenal[0][0], targetIndex: 12 }
    const pitchSeed = `${state.seedText}:round:${state.round}:pitch:${state.sit.totalPitches}:${intent.typeKey}:${intent.targetIndex}`
    const batter = state.lineup[state.sit.batterIdx]
    const pitch = generatePitch(createRng(`${pitchSeed}:physics`), state.pitcher, batter, {
      balls: state.sit.balls, strikes: state.sit.strikes, borderlineBias: 0,
      player: { typeKey: intent.typeKey, target: targetAt(intent.targetIndex), commandQuality },
    })
    const plan = decideSwing(createRng(`${pitchSeed}:swing`), batter, pitch, state.sit)
    const outcome = plan.swings ? resolveSwing(createRng(`${pitchSeed}:outcome`), batter, pitch, state.sit) : null
    const timeScale = DIFFICULTY[state.difficulty].timeScale
    const contactEnds = outcome !== null && outcome.kind !== 'whiff'
    const flightSec = (contactEnds ? pitch.traj.T : pitch.traj.catchT) / timeScale
    const catchPos = posAt(pitch.traj, pitch.traj.catchT)
    const framing = this.framingFor(state, pitch, batter, pitchSeed)
    state.commandQuality = commandQuality
    state.commandQualities.push(commandQuality)
    state.active = {
      pitch, plan, outcome, batter, timeScale, flightStartAt: 0,
      flightDurMs: flightSec * 1000, hitTraj: null, hitStartAt: 0, framing, catchPos,
    }
    state.reveal = null
    state.banner = null
    state.callDeadline = null
    this.enter(state, 'prePitch', PRE_PITCH_MS)
  }

  private framingFor(state: StoredRoom, pitch: RemoteActivePitch['pitch'], batter: RemoteActivePitch['batter'], seed: string): { x: number; z: number } {
    const framing = { x: 0, z: 0 }
    if (pitch.metrics.edgeDistIn <= -2 || pitch.metrics.edgeDistIn >= 5) return framing
    const zone = zoneFor(batter)
    const toCenterX = -pitch.cross.x
    const toCenterZ = zone.centerZFt - pitch.cross.z
    const magnitude = Math.hypot(toCenterX, toCenterZ) || 1
    const rng = createRng(`${seed}:framing`)
    const inches = DIFFICULTY[state.difficulty].framingInches * rng.range(0.65, 1.15)
    return { x: toCenterX / magnitude * inches / 12, z: toCenterZ / magnitude * inches / 12 }
  }

  private gradeCall(state: StoredRoom, call: 'ball' | 'strike', hesitated: boolean): void {
    if (!state.active) return
    const { pitch, batter } = state.active
    const truth = pitch.truthStrike
    const correct = hesitated ? false : (call === 'strike') === truth
    const applied = hesitated ? (truth ? 'strike' : 'ball') : call
    const countBefore = `${state.sit.balls}-${state.sit.strikes}`
    const sit = structuredClone(state.sit)
    const result = applyCalledPitch(sit, applied, batter.name)
    const zone = zoneFor(batter)
    const record: CallRecord = {
      pitchNo: sit.totalPitches, batterName: batter.name, countBefore,
      playerCall: applied, truthStrike: truth, correct, hesitated,
      edgeDistIn: pitch.metrics.edgeDistIn, nearestEdge: pitch.metrics.nearestEdge,
      leverage: leverageOf(state.sit), endedAtBat: result.atBatOver,
      note: hesitated ? 'No call before the window closed — the book scored it for you.' : describeTake(call === 'strike', pitch.metrics),
      cross: { x: pitch.zonePoint.x, z: pitch.zonePoint.z }, zoneTopFt: zone.topFt, zoneBotFt: zone.botFt,
    }
    state.sit = sit
    state.calls.push(record)
    state.pendingAtBatOver = result.atBatOver
    state.reveal = { record, headline: result.headline, atBatOver: result.atBatOver, batterHand: batter.hand }
    this.pushEvents(state, result.events)
    state.banner = {
      key: state.bannerKey++, title: result.headline,
      sub: result.atBatOver ? undefined : `Count ${sit.balls}-${sit.strikes}`,
      tone: result.atBatOver ? 'gold' : 'neutral',
    }
    state.callDeadline = null
    this.enter(state, 'reveal', TIMING.revealMs + (result.atBatOver ? TIMING.revealAtBatEndBonusMs : 0))
  }

  private startPitcherChallenge(state: StoredRoom): void {
    if (!state.active) return
    const { pitch, batter } = state.active
    const zone = zoneFor(batter)
    state.pendingCall = null
    state.absChallenge = {
      challengerLabel: 'PITCHER / CATCHER',
      challengerSide: 'defense',
      callOnField: 'ball',
      truthStrike: pitch.truthStrike,
      overturned: pitch.truthStrike,
      verdictPlayed: false,
      countBefore: `${state.sit.balls}-${state.sit.strikes}`,
      leverage: leverageOf(state.sit),
      edgeDistIn: pitch.metrics.edgeDistIn,
      cross: { x: pitch.zonePoint.x, z: pitch.zonePoint.z },
      zoneTopFt: zone.topFt,
      zoneBotFt: zone.botFt,
      challengesBefore: state.pitcherChallengesLeft,
      challengesMax: state.pitcherChallengesMax,
    }
    state.banner = {
      key: state.bannerKey++, title: 'PITCHER / CATCHER CHALLENGES THE CALL',
      sub: 'BATTERY SIGNAL — AUTOMATED BALL-STRIKE REVIEW', tone: 'bad',
    }
    this.pushEvents(state, [{ kind: 'info', text: 'The pitcher and catcher challenge the called ball — ABS review.', runs: 0 }])
    this.enter(state, 'challenge', TIMING.challengeMs)
  }

  private resolvePitcherChallenge(state: StoredRoom): void {
    if (!state.active || !state.absChallenge) return
    const challenge = state.absChallenge
    const { pitch, batter } = state.active
    const applied = pitch.truthStrike ? 'strike' : 'ball'
    const sit = structuredClone(state.sit)
    const result = applyCalledPitch(sit, applied, batter.name)
    const zone = zoneFor(batter)
    const record: CallRecord = {
      pitchNo: sit.totalPitches, batterName: batter.name, countBefore: challenge.countBefore,
      playerCall: 'ball', truthStrike: pitch.truthStrike, correct: !pitch.truthStrike, hesitated: false,
      edgeDistIn: pitch.metrics.edgeDistIn, nearestEdge: pitch.metrics.nearestEdge,
      leverage: challenge.leverage, endedAtBat: result.atBatOver,
      note: (challenge.overturned
        ? 'Pitcher/catcher challenge overturned — ABS changed the call to strike. '
        : 'Pitcher/catcher challenge confirmed the ball call. ') + describeTake(false, pitch.metrics),
      cross: { x: pitch.zonePoint.x, z: pitch.zonePoint.z }, zoneTopFt: zone.topFt, zoneBotFt: zone.botFt,
      challenged: true, overturned: challenge.overturned,
    }
    state.sit = sit
    state.calls.push(record)
    state.pendingAtBatOver = result.atBatOver
    state.pitcherChallengesLeft = challenge.overturned
      ? state.pitcherChallengesLeft
      : Math.max(0, state.pitcherChallengesLeft - 1)
    state.absChallenge = null
    state.reveal = { record, headline: result.headline, atBatOver: result.atBatOver, batterHand: batter.hand }
    this.pushEvents(state, [
      { kind: 'info', text: challenge.overturned ? 'ABS overturns ball — the pitcher keeps the challenge.' : 'ABS confirms ball — challenge lost.', runs: 0 },
      ...result.events,
    ])
    state.banner = {
      key: state.bannerKey++, title: `${challenge.overturned ? 'OVERTURNED' : 'CONFIRMED'} · ${result.headline}`,
      sub: result.atBatOver ? undefined : `Count ${sit.balls}-${sit.strikes}`,
      tone: result.atBatOver ? 'gold' : challenge.overturned ? 'bad' : 'good',
    }
    this.enter(state, 'reveal', TIMING.revealMs + (result.atBatOver ? TIMING.revealAtBatEndBonusMs : 0))
  }

  private resolveSwingPlay(state: StoredRoom): void {
    if (!state.active?.outcome) return
    const { pitch, outcome, batter } = state.active
    const sit = structuredClone(state.sit)
    const rng = createRng(`${state.seedText}:round:${state.round}:resolution:${sit.totalPitches}`)
    const result = applySwing(sit, outcome, batter.name, rng)
    let hitTraj = null
    let duration: number
    if (outcome.kind === 'whiff') duration = TIMING.whiffResultMs
    else {
      const from = posAt(pitch.traj, pitch.traj.T)
      if (outcome.kind === 'foul') {
        hitTraj = battedTrajectory(from, { x: rng.range(-55, 55), y: -rng.range(35, 85), z: rng.range(28, 66) }, 1.5)
        duration = TIMING.foulResultMs
      } else {
        const style = outcome.bases === 4 ? 'deep' : outcome.outType ?? (outcome.bases >= 2 ? 'line' : 'ground')
        const velocity: Vec3 =
          style === 'ground' ? { x: rng.range(-32, 32), y: rng.range(60, 105), z: rng.range(5, 15) } :
          style === 'pop' ? { x: rng.range(-18, 18), y: rng.range(12, 30), z: rng.range(68, 92) } :
          style === 'fly' ? { x: rng.range(-38, 38), y: rng.range(55, 95), z: rng.range(52, 82) } :
          style === 'deep' ? { x: rng.range(-30, 30), y: rng.range(105, 140), z: rng.range(52, 72) } :
          { x: rng.range(-28, 28), y: rng.range(95, 130), z: rng.range(16, 30) }
        hitTraj = battedTrajectory(from, velocity, 2.6)
        duration = TIMING.inPlayResultMs
      }
      this.pushEvents(state, result.events)
    }
    state.sit = sit
    state.pendingAtBatOver = result.atBatOver
    state.active = { ...state.active, hitTraj, hitStartAt: Date.now() }
    const tone: RemoteBanner['tone'] =
      result.headline.includes('HOMER') || result.headline === 'HOME RUN' || sit.walkOff ? 'gold' :
      outcome.kind === 'inPlay' && outcome.bases > 0 ? 'good' : result.atBatOver ? 'bad' : 'neutral'
    state.banner = { key: state.bannerKey++, title: result.headline, sub: result.atBatOver ? undefined : `Count ${sit.balls}-${sit.strikes}`, tone }
    this.enter(state, 'swingResult', duration)
  }

  private resolveHbpPlay(state: StoredRoom): void {
    if (!state.active) return
    const { pitch, batter } = state.active
    const sit = structuredClone(state.sit)
    const result = applyHbp(sit, batter.name)
    const rng = createRng(`${state.seedText}:round:${state.round}:hbp:${sit.totalPitches}`)
    const from = posAt(pitch.traj, pitch.traj.T)
    state.sit = sit
    state.pendingAtBatOver = true
    state.active = {
      ...state.active,
      hitTraj: battedTrajectory(from, { x: rng.range(-25, 25), y: -rng.range(8, 20), z: rng.range(10, 24) }, 1.2),
      hitStartAt: Date.now(),
    }
    this.pushEvents(state, result.events)
    state.banner = { key: state.bannerKey++, title: result.headline, sub: 'Take your base', tone: 'neutral' }
    this.enter(state, 'swingResult', TIMING.hbpResultMs)
  }

  private afterResolution(state: StoredRoom): void {
    if (state.sit.over) return this.completeRound(state)
    if (state.pendingAtBatOver) nextBatter(state.sit)
    state.pendingAtBatOver = false
    this.openPitchSelection(state)
  }

  private completeRound(state: StoredRoom): void {
    if (!state.pitcherId || !state.umpireId) return
    const summary: RoundSummary = {
      round: state.round,
      pitcherId: state.pitcherId,
      umpireId: state.umpireId,
      finalSituation: structuredClone(state.sit),
      pitching: computePitchingReport({
        startOuts: state.initialSituation.outs,
        finalOuts: state.sit.outs,
        runsAllowed: Math.max(0, state.sit.homeScore - state.initialHomeScore),
        pitchesThrown: state.sit.totalPitches - state.initialTotalPitches,
        commandQualities: state.commandQualities,
      }),
      umpiring: computeReport(state.calls),
      calls: structuredClone(state.calls),
    }
    state.roundSummaries.push(summary)
    state.active = null
    state.reveal = null
    state.phaseDeadline = null
    if (state.round === 1) {
      state.status = 'betweenRounds'
      state.phase = 'roleSwap'
      state.banner = { key: state.bannerKey++, title: 'ROLES SWAP', sub: 'Review the round, then ready up for the rematch.', tone: 'gold' }
      for (const player of state.players) if (player) player.ready = false
    } else {
      const ids = state.players.filter((player): player is InternalPlayer => Boolean(player)).map((player) => player.id)
      state.seriesResult = computeSeriesResult(ids, state.roundSummaries)
      state.status = 'seriesComplete'
      state.phase = 'seriesComplete'
      state.banner = null
    }
  }

  private pauseForDisconnect(state: StoredRoom): void {
    const now = Date.now()
    state.pausedPhase = state.phase
    state.pausedRemainingMs = state.phaseDeadline === null ? null : Math.max(0, state.phaseDeadline - now)
    state.phase = 'disconnectPaused'
    state.status = 'disconnectPaused'
    state.phaseStartedAt = now
    state.phaseDeadline = null
    state.callDeadline = null
    state.disconnectDeadline = now + RECONNECT_MS
    state.pausedBanner = state.banner
    state.banner = { key: state.bannerKey++, title: 'WAITING FOR PLAYER', sub: 'The series is paused for reconnect.', tone: 'neutral' }
  }

  private pushEvents(state: StoredRoom, events: PlayEvent[]): void {
    const items: RemoteTickerItem[] = events.map((event) => ({ id: state.tickerId++, text: event.text, kind: event.kind }))
    state.ticker = [...items.reverse(), ...state.ticker].slice(0, 5)
  }

  private enter(state: StoredRoom, phase: MultiplayerPhase, durationMs: number): void {
    const startedAt = Date.now()
    state.phase = phase
    state.phaseStartedAt = startedAt
    state.phaseDeadline = startedAt + durationMs * this.timingScale
  }

  private async loadRoom(): Promise<StoredRoom | null> {
    return await this.ctx.storage.get<StoredRoom>(STATE_KEY) ?? null
  }

  private async loadOrCreate(roomCode: string): Promise<StoredRoom> {
    const existing = await this.loadRoom()
    if (existing) {
      // Rooms live for up to two hours; fill fields introduced with protocol v2
      // so a rolling deploy does not strand an in-progress series.
      existing.pitcherChallengesMax ??= ABS_CHALLENGES_PER_SIDE
      existing.pitcherChallengesLeft ??= existing.pitcherChallengesMax
      existing.pendingCall ??= null
      existing.absChallenge ??= null
      return existing
    }
    const rng = createRng(`multiplayer:${roomCode}`)
    const scenario = createScenario(rng)
    const now = Date.now()
    const state: StoredRoom = {
      roomCode, status: 'lobby', phase: 'lobby', phaseStartedAt: now, phaseDeadline: null,
      pausedPhase: null, pausedRemainingMs: null, round: 1, difficulty: 'pro', hostId: null,
      players: [null, null], pitcherId: null, umpireId: null, intro: scenario.intro,
      seedText: roomCode, sit: structuredClone(scenario.situation), lineup: generateLineup(rng), pitcher: generateCloser(rng),
      active: null, reveal: null, banner: null, ticker: [], calls: [], callDeadline: null,
      pendingAtBatOver: false, pitchIntent: null, commandQuality: null, roundSummaries: [],
      pitcherChallengesLeft: ABS_CHALLENGES_PER_SIDE, pitcherChallengesMax: ABS_CHALLENGES_PER_SIDE,
      pendingCall: null, absChallenge: null,
      seriesResult: null, disconnectDeadline: null, revision: 0,
      initialSituation: structuredClone(scenario.situation), initialHomeScore: scenario.situation.homeScore,
      initialTotalPitches: scenario.situation.totalPitches, commandQualities: [], firstPitcherId: null,
      lastActivityAt: now, bannerKey: 1, tickerId: 1,
      pausedBanner: null,
    }
    await this.ctx.storage.put(STATE_KEY, state)
    await this.scheduleNextAlarm(state)
    return state
  }

  private snapshot(state: StoredRoom): RoomSnapshot {
    return {
      ...state,
      players: state.players.map((player) => player ? {
        id: player.id, name: player.name, connected: player.connected, ready: player.ready,
      } : null),
    }
  }

  private async commit(state: StoredRoom, type: ServerMessage['type']): Promise<void> {
    state.revision++
    state.lastActivityAt = Date.now()
    await this.ctx.storage.put(STATE_KEY, state)
    await this.scheduleNextAlarm(state)
    const snapshot = this.snapshot(state)
    if (type === 'roundComplete') {
      const summary = state.roundSummaries[state.roundSummaries.length - 1]
      if (summary) return this.broadcast(state, { type, summary, snapshot })
    }
    if (type === 'seriesComplete' && state.seriesResult) return this.broadcast(state, { type, result: state.seriesResult, snapshot })
    if (type === 'phaseChanged') return this.broadcast(state, { type, phase: state.phase, snapshot })
    if (type === 'presenceChanged') return this.broadcast(state, { type, snapshot })
    if (type === 'pitchPrepared') return this.broadcast(state, { type, snapshot })
    if (type === 'playResolved') return this.broadcast(state, { type, snapshot })
    this.broadcast(state, { type: 'snapshot', snapshot })
  }

  private async scheduleNextAlarm(state: StoredRoom): Promise<void> {
    const candidates = [state.lastActivityAt + ROOM_IDLE_MS]
    if (state.phaseDeadline !== null) candidates.push(state.phaseDeadline)
    if (state.disconnectDeadline !== null) candidates.push(state.disconnectDeadline)
    if (state.status === 'playing') {
      for (const player of state.players) if (player?.connected) candidates.push(player.lastSeenAt + HEARTBEAT_TIMEOUT_MS)
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...candidates)))
  }

  private broadcast(state: StoredRoom, partial: ServerPayload, except?: WebSocket): void {
    const message = JSON.stringify({ ...partial, protocolVersion: PROTOCOL_VERSION, revision: state.revision, serverNow: Date.now() })
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (!attachment?.playerId) continue
      try { socket.send(message) } catch { /* reconnect loop will recover */ }
    }
  }

  private send(ws: WebSocket, state: StoredRoom, partial: ServerPayload): void {
    ws.send(JSON.stringify({ ...partial, protocolVersion: PROTOCOL_VERSION, revision: state.revision, serverNow: Date.now() }))
  }

  private sendError(ws: WebSocket, state: StoredRoom | null, code: string, message: string): void {
    ws.send(JSON.stringify({
      type: 'error', code, message, protocolVersion: PROTOCOL_VERSION,
      revision: state?.revision ?? 0, serverNow: Date.now(),
    } satisfies ServerMessage))
  }
}
