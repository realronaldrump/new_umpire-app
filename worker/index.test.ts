import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, type ServerMessage } from '../src/multiplayer/protocol'
import { zoneFor } from '../src/game/strikeZone'
import worker, { type Env } from './index'

const sockets: WebSocket[] = []

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close(1000, 'test complete')
})

async function connect(code: string): Promise<WebSocket> {
  const response = await worker.fetch(new Request(`https://rooms.test/room/${code}`, {
    headers: { Upgrade: 'websocket' },
  }), env as Env)
  expect(response.status).toBe(101)
  if (!response.webSocket) throw new Error('Worker did not return a WebSocket')
  response.webSocket.accept()
  sockets.push(response.webSocket)
  return response.webSocket
}

function waitFor(socket: WebSocket, type: ServerMessage['type']): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2_000)
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage
      if (message.type !== type) return
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      resolve(message)
    }
    socket.addEventListener('message', onMessage)
  })
}

function join(socket: WebSocket, roomCode: string, token: string, name: string): void {
  socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: 'join', roomCode, playerToken: token, leaderboardId: crypto.randomUUID(), name }))
}

function action(socket: WebSocket, message: Record<string, unknown>): void {
  socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...message }))
}

describe('room worker', () => {
  it('serves a public health endpoint', async () => {
    const response = await worker.fetch(new Request('https://rooms.test/health'), env as Env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, protocolVersion: PROTOCOL_VERSION })
  })

  it('seats two players and rejects a third', async () => {
    const room = 'TEST23'
    const first = await connect(room)
    const second = await connect(room)
    const third = await connect(room)

    const firstWelcome = waitFor(first, 'welcome')
    join(first, room, 'token-first', 'Pitcher')
    expect((await firstWelcome).type).toBe('welcome')

    const secondWelcome = waitFor(second, 'welcome')
    join(second, room, 'token-second', 'Blue')
    const secondMessage = await secondWelcome
    expect(secondMessage.type === 'welcome' && secondMessage.snapshot.players.filter(Boolean)).toHaveLength(2)

    const roomFull = waitFor(third, 'error')
    join(third, room, 'token-third', 'Bench')
    const error = await roomFull
    expect(error.type === 'error' && error.code).toBe('ROOM_FULL')
  })

  it('assigns opposite roles and enforces pitcher-only actions', async () => {
    const room = 'RALE23'
    const first = await connect(room)
    const second = await connect(room)
    const firstWelcomePromise = waitFor(first, 'welcome')
    join(first, room, 'role-first', 'First')
    const firstWelcome = await firstWelcomePromise
    const secondWelcomePromise = waitFor(second, 'welcome')
    join(second, room, 'role-second', 'Second')
    const secondWelcome = await secondWelcomePromise
    if (firstWelcome.type !== 'welcome' || secondWelcome.type !== 'welcome') throw new Error('Expected welcomes')

    const firstReady = waitFor(first, 'phaseChanged')
    action(first, { type: 'ready' })
    await firstReady
    const roundIntro = waitFor(second, 'phaseChanged')
    action(second, { type: 'ready' })
    const started = await roundIntro
    if (started.type !== 'phaseChanged') throw new Error('Expected round intro')
    expect(started.snapshot.status).toBe('playing')
    expect(started.snapshot.pitcherId).not.toBe(started.snapshot.umpireId)

    const pitcherIsFirst = started.snapshot.pitcherId === firstWelcome.playerId
    const pitcherSocket = pitcherIsFirst ? first : second
    const umpireSocket = pitcherIsFirst ? second : first
    const pitchSelect = waitFor(pitcherSocket, 'phaseChanged')
    const selection = await pitchSelect
    if (selection.type !== 'phaseChanged') throw new Error('Expected pitch selection')
    expect(selection.phase).toBe('pitchSelect')

    const earlyChallenge = waitFor(pitcherSocket, 'error')
    action(pitcherSocket, { type: 'pitcherChallenge' })
    const challengeDenied = await earlyChallenge
    expect(challengeDenied.type === 'error' && challengeDenied.code).toBe('BAD_CHALLENGE')

    const unauthorized = waitFor(umpireSocket, 'error')
    action(umpireSocket, { type: 'pitchIntent', intent: { typeKey: selection.snapshot.pitcher.arsenal[0][0], target: { u: 0.13, v: -0.27 } } })
    const denied = await unauthorized
    expect(denied.type === 'error' && denied.code).toBe('NOT_PITCHER')

    const command = waitFor(pitcherSocket, 'phaseChanged')
    action(pitcherSocket, { type: 'pitchIntent', intent: { typeKey: 'knuckleball', target: { u: 0.13, v: -0.27 } } })
    const commandStarted = await command
    expect(commandStarted.type).toBe('phaseChanged')
    expect(commandStarted.type === 'phaseChanged' && commandStarted.snapshot.specialPitchesUsed).toContain('knuckleball')
    const prepared = waitFor(pitcherSocket, 'pitchPrepared')
    action(pitcherSocket, { type: 'release', execution: { quality: 0.8, miss: { u: 0.05, v: -0.03 } } })
    const pitch = await prepared
    expect(pitch.type === 'pitchPrepared' && pitch.snapshot.commandQuality).toBe(0.8)
    expect(pitch.type === 'pitchPrepared' && pitch.snapshot.active).not.toBeNull()
    if (pitch.type === 'pitchPrepared' && pitch.snapshot.active) {
      expect(pitch.snapshot.active.pitch.typeKey).toBe('knuckleball')
      const zone = zoneFor(pitch.snapshot.active.batter)
      expect(pitch.snapshot.active.pitch.intended.x).toBeCloseTo(0.13 * zone.halfWidthFt)
      expect(pitch.snapshot.active.pitch.intended.z).toBeCloseTo(zone.centerZFt - 0.27 * zone.halfHeightFt)
    }
  })

  it('starts Legend at the top of the eighth with alternating three-out roles', async () => {
    const room = 'LEG234'
    const first = await connect(room)
    const second = await connect(room)
    const firstWelcome = waitFor(first, 'welcome')
    join(first, room, 'legend-first', 'First')
    const firstPlayer = await firstWelcome
    if (firstPlayer.type !== 'welcome') throw new Error('Expected first welcome')
    const secondWelcome = waitFor(second, 'welcome')
    join(second, room, 'legend-second', 'Second')
    await secondWelcome

    const configured = waitFor(first, 'snapshot')
    action(first, { type: 'configure', difficulty: 'legend' })
    await configured
    const firstReady = waitFor(first, 'phaseChanged')
    action(first, { type: 'ready' })
    await firstReady
    const started = waitFor(second, 'phaseChanged')
    action(second, { type: 'ready' })
    const message = await started
    if (message.type !== 'phaseChanged') throw new Error('Expected Legend game start')

    expect(message.snapshot.sit).toMatchObject({ inning: 8, half: 'top', outs: 0, totalOuts: 0 })
    expect(message.snapshot.pitcherId).not.toBe(message.snapshot.umpireId)
    expect(message.snapshot.firstPitcherId).toBe(message.snapshot.pitcherId)
  })

  it('reclaims an existing seat without the replaced socket marking it offline', async () => {
    const room = 'RCN234'
    const original = await connect(room)
    const originalWelcome = waitFor(original, 'welcome')
    join(original, room, 'reconnect-token', 'Returning Player')
    await originalWelcome

    const replacement = await connect(room)
    const replacementWelcome = waitFor(replacement, 'welcome')
    join(replacement, room, 'reconnect-token', 'Returning Player')
    const welcomed = await replacementWelcome
    expect(welcomed.type === 'welcome' && welcomed.snapshot.players[0]?.connected).toBe(true)

    const snapshot = waitFor(replacement, 'snapshot')
    action(replacement, { type: 'requestSnapshot' })
    const latest = await snapshot
    expect(latest.type === 'snapshot' && latest.snapshot.players[0]?.connected).toBe(true)
  })
})

describe('solo leaderboard', () => {
  const submit = (body: Record<string, unknown>) => worker.fetch(new Request('https://rooms.test/leaderboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env as Env)

  it('ranks each browser best by score and keeps the better result', async () => {
    const difficulty = 'legend'
    const firstId = crypto.randomUUID()
    const secondId = crypto.randomUUID()
    const result = (playerId: string, name: string, score: number) => ({
      playerId, name, difficulty, score, accuracyPct: score, weightedPct: score, totalCalls: 12, seed: 'TESTSEED',
    })
    expect((await submit(result(firstId, 'Blue One', 88))).status).toBe(200)
    expect((await submit(result(secondId, 'Blue Two', 94))).status).toBe(200)
    expect((await submit(result(firstId, 'Blue One', 70))).status).toBe(200)

    const response = await worker.fetch(new Request(`https://rooms.test/leaderboard?difficulty=${difficulty}`), env as Env)
    const body = await response.json() as { entries: Array<{ playerId: string; score: number; rank: number }> }
    const relevant = body.entries.filter((entry) => entry.playerId === firstId || entry.playerId === secondId)
    expect(relevant).toEqual([
      expect.objectContaining({ playerId: secondId, score: 94 }),
      expect.objectContaining({ playerId: firstId, score: 88 }),
    ])
    expect(relevant[0].rank).toBeLessThan(relevant[1].rank)
  })

  it('rejects malformed or non-qualifying results', async () => {
    const response = await submit({ playerId: 'fake', name: '', difficulty: 'pro', score: 101, totalCalls: 0 })
    expect(response.status).toBe(400)
  })
})

describe('head-to-head leaderboard', () => {
  it('tracks wins, losses, draws and ignores a duplicate room result', async () => {
    const firstId = crypto.randomUUID()
    const secondId = crypto.randomUUID()
    const leaderboard = env.LEADERBOARD.get(env.LEADERBOARD.idFromName('global'))
    const submit = (matchId: string, winnerIds: string[]) => leaderboard.fetch(new Request('https://leaderboard.test/head-to-head-result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        mode: 'head-to-head', matchId, winnerIds,
        players: [
          { playerId: firstId, name: 'First Blue', score: 91.5 },
          { playerId: secondId, name: 'Second Blue', score: 84 },
        ],
      }),
    }), env as Env)

    expect((await submit('H2H234', [firstId])).status).toBe(200)
    expect((await submit('H2H234', [firstId])).status).toBe(200)
    expect((await submit('DRAW23', [firstId, secondId])).status).toBe(200)

    const spoofed = await worker.fetch(new Request('https://rooms.test/leaderboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'head-to-head' }),
    }), env as Env)
    expect(spoofed.status).toBe(403)

    const response = await worker.fetch(new Request('https://rooms.test/leaderboard?mode=head-to-head'), env as Env)
    const body = await response.json() as { entries: Array<{ playerId: string; wins: number; losses: number; draws: number; seriesPlayed: number }> }
    expect(body.entries.find((entry) => entry.playerId === firstId)).toMatchObject({ wins: 1, losses: 0, draws: 1, seriesPlayed: 2 })
    expect(body.entries.find((entry) => entry.playerId === secondId)).toMatchObject({ wins: 0, losses: 1, draws: 1, seriesPlayed: 2 })
  })
})
