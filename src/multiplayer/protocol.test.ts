import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, parseClientMessage } from './protocol'

describe('multiplayer protocol', () => {
  it('accepts valid messages and rejects malformed or out-of-range actions', () => {
    expect(parseClientMessage({
      protocolVersion: PROTOCOL_VERSION, type: 'join', roomCode: 'ABC234',
      playerToken: '12345678', name: 'Blue',
    })?.type).toBe('join')
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'join', roomCode: 'OOPS!!', playerToken: '12345678', name: 'Blue' })).toBeNull()
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'release', execution: { quality: 1.1, miss: { u: 0, v: 0 } } })).toBeNull()
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'pitchIntent', intent: { typeKey: 'slider', target: { u: 1.51, v: 0 } } })).toBeNull()
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'pitchIntent', intent: { typeKey: 'slider', target: { u: 0.137, v: -0.924 } } })?.type).toBe('pitchIntent')
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'release', execution: { quality: 0.84, miss: { u: -0.13, v: 0.08 } } })?.type).toBe('release')
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'pitcherChallenge' })?.type).toBe('pitcherChallenge')
  })
})
