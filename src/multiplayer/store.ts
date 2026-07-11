import { create } from 'zustand'
import { audio } from '../audio/engine'
import type { Difficulty } from '../game/constants'
import type { PitchTypeKey } from '../game/pitchTypes'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import {
  PROTOCOL_VERSION, ROOM_CODE_RE, roomCode,
  type ClientMessage, type MultiplayerRole, type RoomSnapshot, type ServerMessage,
} from './protocol'

type WithoutProtocol<T> = T extends unknown ? Omit<T, 'protocolVersion'> : never
type ClientPayload = WithoutProtocol<ClientMessage>

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

interface MultiplayerState {
  open: boolean
  connection: ConnectionStatus
  roomCode: string
  name: string
  playerId: string | null
  snapshot: RoomSnapshot | null
  error: string | null
  revision: number
  serverOffsetMs: number
  latencyMs: number | null
  openEntry: (code?: string) => void
  createRoom: (name: string, difficulty: Difficulty) => void
  joinRoom: (code: string, name: string) => void
  configure: (difficulty: Difficulty) => void
  ready: () => void
  resumeReady: () => void
  choosePitch: (typeKey: PitchTypeKey, targetIndex: number) => void
  release: (commandQuality: number) => void
  call: (call: 'ball' | 'strike') => void
  challenge: () => void
  clearError: () => void
  leave: () => void
}

let socket: WebSocket | null = null
let heartbeat: number | null = null
let reconnectTimer: number | null = null
let reconnectAttempt = 0
let manualClose = false
let pendingDifficulty: Difficulty | null = null
let connectionGeneration = 0

const savedName = (): string => {
  try { return localStorage.getItem('umpire-multiplayer-name') ?? '' } catch { return '' }
}

export const useMultiplayer = create<MultiplayerState>()((set, get) => ({
  open: false,
  connection: 'idle',
  roomCode: '',
  name: savedName(),
  playerId: null,
  snapshot: null,
  error: null,
  revision: -1,
  serverOffsetMs: 0,
  latencyMs: null,

  openEntry: (code = '') => {
    const normalized = code.trim().toUpperCase()
    set({ open: true, roomCode: ROOM_CODE_RE.test(normalized) ? normalized : '', error: null })
  },
  createRoom: (name, difficulty) => {
    audio.init()
    audio.uiClick()
    pendingDifficulty = difficulty
    connectToRoom(roomCode(), name.trim() || 'Player 1', set, get)
  },
  joinRoom: (code, name) => {
    audio.init()
    audio.uiClick()
    pendingDifficulty = null
    const normalized = code.trim().toUpperCase()
    if (!ROOM_CODE_RE.test(normalized)) return set({ error: 'Enter a valid six-character room code.' })
    connectToRoom(normalized, name.trim() || 'Player 2', set, get)
  },
  configure: (difficulty) => send({ type: 'configure', difficulty }),
  ready: () => send({ type: 'ready' }),
  resumeReady: () => send({ type: 'resumeReady' }),
  choosePitch: (typeKey, targetIndex) => send({ type: 'pitchIntent', intent: { typeKey, targetIndex } }),
  release: (commandQuality) => send({ type: 'release', commandQuality: Math.max(0, Math.min(1, commandQuality)) }),
  call: (call) => send({ type: 'umpCall', call }),
  challenge: () => send({ type: 'pitcherChallenge' }),
  clearError: () => set({ error: null }),
  leave: () => leaveRoom(set),
}))

export function multiplayerRole(snapshot: RoomSnapshot | null, playerId: string | null): MultiplayerRole | null {
  if (!snapshot || !playerId) return null
  if (snapshot.pitcherId === playerId) return 'pitcher'
  if (snapshot.umpireId === playerId) return 'umpire'
  return null
}

function connectToRoom(
  code: string,
  name: string,
  set: (patch: Partial<MultiplayerState>) => void,
  get: () => MultiplayerState,
): void {
  manualClose = false
  connectionGeneration++
  const generation = connectionGeneration
  if (socket) socket.close(1000, 'Switching rooms')
  clearReconnect()
  persistName(name)
  const token = tokenFor(code)
  const endpoint = multiplayerEndpoint(code)
  if (!endpoint) {
    set({ open: true, connection: 'closed', roomCode: code, name, error: 'Multiplayer server is not configured for this deployment.' })
    return
  }
  updateInviteUrl(code)
  set({ open: true, connection: get().snapshot ? 'reconnecting' : 'connecting', roomCode: code, name, error: null })
  const ws = new WebSocket(endpoint)
  socket = ws
  ws.addEventListener('open', () => {
    if (generation !== connectionGeneration) return
    reconnectAttempt = 0
    sendRaw(ws, { type: 'join', roomCode: code, playerToken: token, name })
  })
  ws.addEventListener('message', (event) => {
    if (generation !== connectionGeneration) return
    let message: ServerMessage
    try { message = JSON.parse(String(event.data)) as ServerMessage } catch { return }
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      set({ error: 'This room uses an incompatible game version.', connection: 'closed' })
      return
    }
    const state = get()
    const offset = message.serverNow - Date.now()
    if (message.type === 'pong') {
      set({ latencyMs: Math.max(0, Math.round((Date.now() - message.sentAt) / 2)), serverOffsetMs: offset })
      return
    }
    if (message.type === 'error') {
      set({ error: message.message, connection: message.code === 'ROOM_FULL' ? 'closed' : state.connection })
      return
    }
    if (message.revision < state.revision && message.type !== 'welcome') return
    const snapshot = 'snapshot' in message ? message.snapshot : null
    if (message.type === 'welcome') {
      playRemoteAudio(state.snapshot, message.snapshot)
      set({ playerId: message.playerId, connection: 'connected', revision: message.revision, serverOffsetMs: offset, snapshot: message.snapshot, error: null })
      useGame.getState().hydrateRemote(message.snapshot, message.serverNow)
      startHeartbeat()
      if (pendingDifficulty && message.snapshot.hostId === message.playerId && message.snapshot.status === 'lobby') {
        send({ type: 'configure', difficulty: pendingDifficulty })
        pendingDifficulty = null
      }
    } else if (snapshot) {
      playRemoteAudio(state.snapshot, snapshot)
      set({ connection: 'connected', revision: message.revision, serverOffsetMs: offset, snapshot, error: null })
      useGame.getState().hydrateRemote(snapshot, message.serverNow)
    }
  })
  ws.addEventListener('close', () => {
    if (generation !== connectionGeneration) return
    stopHeartbeat()
    if (manualClose || !get().open) return set({ connection: 'closed' })
    set({ connection: 'reconnecting', error: 'Connection lost — trying to rejoin…' })
    reconnectAttempt++
    reconnectTimer = window.setTimeout(
      () => connectToRoom(code, name, set, get),
      Math.min(10_000, 600 * 2 ** Math.min(5, reconnectAttempt)),
    )
  })
  ws.addEventListener('error', () => {
    if (generation === connectionGeneration) set({ error: 'Could not reach the multiplayer room server.' })
  })
}

function send(message: ClientPayload): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  sendRaw(socket, message)
}

function sendRaw(ws: WebSocket, message: ClientPayload): void {
  ws.send(JSON.stringify({ ...message, protocolVersion: PROTOCOL_VERSION }))
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeat = window.setInterval(() => send({ type: 'ping', sentAt: Date.now() }), 10_000)
  send({ type: 'ping', sentAt: Date.now() })
}

function stopHeartbeat(): void {
  if (heartbeat !== null) window.clearInterval(heartbeat)
  heartbeat = null
}

function clearReconnect(): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function leaveRoom(set: (patch: Partial<MultiplayerState>) => void): void {
  manualClose = true
  connectionGeneration++
  stopHeartbeat()
  clearReconnect()
  if (socket) socket.close(1000, 'Left room')
  socket = null
  pendingDifficulty = null
  history.replaceState(null, '', `${location.pathname}${location.hash}`)
  set({ open: false, connection: 'idle', roomCode: '', playerId: null, snapshot: null, error: null, revision: -1, latencyMs: null })
  useGame.getState().newGame()
}

function multiplayerEndpoint(code: string): string | null {
  const configured = import.meta.env.VITE_MULTIPLAYER_ORIGIN as string | undefined
  const origin = configured || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8787' : '')
  if (!origin) return null
  const url = new URL(origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/room/${code}`
  url.search = ''
  return url.toString()
}

function tokenFor(code: string): string {
  const key = `umpire-room-token:${code}`
  let token = sessionStorage.getItem(key)
  if (!token) {
    token = crypto.randomUUID()
    sessionStorage.setItem(key, token)
  }
  return token
}

function persistName(name: string): void {
  try { localStorage.setItem('umpire-multiplayer-name', name) } catch { /* private browsing */ }
}

function updateInviteUrl(code: string): void {
  const url = new URL(location.href)
  url.searchParams.set('mode', 'multiplayer')
  url.searchParams.set('room', code)
  history.replaceState(null, '', url)
}

function playRemoteAudio(previous: RoomSnapshot | null, next: RoomSnapshot): void {
  if (!previous || previous.phase === next.phase && previous.sit.totalPitches === next.sit.totalPitches) return
  if (next.phase === 'flight' && next.active) audio.whoosh(next.active.flightDurMs / 1000)
  if (next.phase === 'call' && next.active) {
    audio.stopWhoosh()
    audio.mittPop(next.active.pitch.mph)
  }
  if (next.phase === 'challengeWindow' && previous.phase === 'call') {
    audio.umpCall('ball', useSettings.getState().umpVoice)
  }
  if (next.phase === 'challenge' && previous.phase !== 'challenge') audio.challengeBuzz()
  if (next.phase === 'absReveal' && previous.phase !== 'absReveal') audio.absTracking()
  if (next.phase === 'reveal' && previous.phase === 'absReveal' && previous.absChallenge && !useGame.getState().absChallenge?.verdictPlayed) {
    audio.absVerdict(previous.absChallenge.overturned)
  }
  if (next.phase === 'reveal' && next.reveal && !next.reveal.record.hesitated && !next.reveal.record.challenged) {
    audio.stopWhoosh()
    audio.umpCall(next.reveal.record.playerCall, useSettings.getState().umpVoice)
  }
  if (next.phase === 'swingResult' && next.active?.outcome) {
    audio.stopWhoosh()
    if (next.active.outcome.kind === 'whiff') audio.mittPop(next.active.pitch.mph)
    else audio.batCrack(next.active.outcome.kind === 'inPlay' ? next.active.outcome.quality : 'medium')
  }
  if (next.phase === 'seriesComplete' && previous.phase !== 'seriesComplete') {
    audio.stinger(next.sit.walkOff ? 'walkoff' : 'over')
  }
}
