import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, type ServerMessage } from '../src/multiplayer/protocol'
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
  socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: 'join', roomCode, playerToken: token, name }))
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

    const unauthorized = waitFor(umpireSocket, 'error')
    action(umpireSocket, { type: 'pitchIntent', intent: { typeKey: selection.snapshot.pitcher.arsenal[0][0], targetIndex: 12 } })
    const denied = await unauthorized
    expect(denied.type === 'error' && denied.code).toBe('NOT_PITCHER')

    const command = waitFor(pitcherSocket, 'phaseChanged')
    action(pitcherSocket, { type: 'pitchIntent', intent: { typeKey: selection.snapshot.pitcher.arsenal[0][0], targetIndex: 12 } })
    expect((await command).type).toBe('phaseChanged')
    const prepared = waitFor(pitcherSocket, 'pitchPrepared')
    action(pitcherSocket, { type: 'release', commandQuality: 0.8 })
    const pitch = await prepared
    expect(pitch.type === 'pitchPrepared' && pitch.snapshot.commandQuality).toBe(0.8)
    expect(pitch.type === 'pitchPrepared' && pitch.snapshot.active).not.toBeNull()
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
