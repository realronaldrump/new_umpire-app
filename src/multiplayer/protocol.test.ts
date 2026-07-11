import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, parseClientMessage, targetAt } from './protocol'

describe('multiplayer protocol', () => {
  it('maps all target cells into the planned five-by-five grid', () => {
    expect(targetAt(0)).toEqual({ u: -1.5, v: 1.5 })
    expect(targetAt(12)).toEqual({ u: 0, v: 0 })
    expect(targetAt(24)).toEqual({ u: 1.5, v: -1.5 })
  })

  it('accepts valid messages and rejects malformed or out-of-range actions', () => {
    expect(parseClientMessage({
      protocolVersion: PROTOCOL_VERSION, type: 'join', roomCode: 'ABC234',
      playerToken: '12345678', name: 'Blue',
    })?.type).toBe('join')
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'join', roomCode: 'OOPS!!', playerToken: '12345678', name: 'Blue' })).toBeNull()
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'release', commandQuality: 1.1 })).toBeNull()
    expect(parseClientMessage({ protocolVersion: PROTOCOL_VERSION, type: 'pitchIntent', intent: { typeKey: 'slider', targetIndex: 25 } })).toBeNull()
  })
})
