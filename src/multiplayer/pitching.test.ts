import { describe, expect, it } from 'vitest'
import { evaluatePitchGesture } from './pitching'

describe('multiplayer pitching gesture', () => {
  it('rewards a smooth load and centered release', () => {
    const execution = evaluatePitchGesture([
      { x: 0.5, y: 0.62, t: 0 },
      { x: 0.5, y: 0.84, t: 100 },
      { x: 0.5, y: 0.6, t: 150 },
      { x: 0.5, y: 0.38, t: 200 },
      { x: 0.5, y: 0.16, t: 250 },
    ])
    expect(execution?.quality).toBeGreaterThan(0.95)
    expect(execution?.miss).toEqual({ u: 0, v: 0 })
  })

  it('turns a late glove-side, low release into a matching miss', () => {
    const execution = evaluatePitchGesture([
      { x: 0.5, y: 0.62, t: 0 },
      { x: 0.5, y: 0.83, t: 100 },
      { x: 0.58, y: 0.55, t: 170 },
      { x: 0.66, y: 0.3, t: 240 },
    ])
    expect(execution?.miss.u).toBeGreaterThan(0)
    expect(execution?.miss.v).toBeLessThan(0)
    expect(execution?.quality).toBeLessThan(0.8)
  })

  it('rejects a flick that never loads the delivery', () => {
    expect(evaluatePitchGesture([
      { x: 0.5, y: 0.6, t: 0 },
      { x: 0.5, y: 0.4, t: 50 },
      { x: 0.5, y: 0.16, t: 100 },
    ])).toBeNull()
  })
})
