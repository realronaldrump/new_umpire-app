import { describe, expect, it } from 'vitest'
import { legendRolesForOuts } from './legend'

describe('multiplayer Legend side switching', () => {
  it('alternates pitcher and umpire every three outs through the game', () => {
    const players = ['home', 'away']
    expect([0, 3, 6, 9].map((outs) => legendRolesForOuts('home', players, outs))).toEqual([
      { pitcherId: 'home', umpireId: 'away' },
      { pitcherId: 'away', umpireId: 'home' },
      { pitcherId: 'home', umpireId: 'away' },
      { pitcherId: 'away', umpireId: 'home' },
    ])
  })
})
