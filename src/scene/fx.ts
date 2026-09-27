import { useGame } from '../store/game'

/**
 * Visual-event bus. The game store (single-player) and the room snapshot
 * (multiplayer) both land in `useGame`, so every scene reaction — camera
 * shake, crowd excitement, fireworks, dust — is derived from store
 * transitions here instead of being wired into the game logic.
 */
export type FxKind =
  | 'mitt'
  | 'crack'
  | 'hit'
  | 'homer'
  | 'run'
  | 'walkoff'
  | 'strikeout'
  | 'correct'
  | 'miss'
  | 'challenge'
  | 'newBatter'

interface Pulse {
  t: number
  strength: number
  id: number
}

const BASE_EXCITE = 0.12

export const fx = {
  last: {} as Partial<Record<FxKind, Pulse>>,
  shakeT: -1e9,
  shakeAmp: 0,
  exciteT: 0,
  exciteLevel: BASE_EXCITE,
  seq: 0,
}

export function emitFx(kind: FxKind, strength = 1): void {
  const t = performance.now()
  fx.last[kind] = { t, strength, id: ++fx.seq }
  const kick = (amp: number) => {
    const current = shakeAt(t)
    fx.shakeT = t
    fx.shakeAmp = Math.max(current, amp)
  }
  const cheer = (level: number) => {
    fx.exciteLevel = Math.max(excitementAt(t), level)
    fx.exciteT = t
  }
  switch (kind) {
    case 'mitt': kick(0.012 * strength); break
    case 'crack': kick(0.03 * strength); cheer(0.35); break
    case 'hit': cheer(0.7); break
    case 'run': cheer(0.95); break
    case 'homer': kick(0.04); cheer(1); break
    case 'walkoff': cheer(1); break
    case 'strikeout': cheer(0.25); break
    case 'challenge': cheer(0.45); break
    default: break
  }
}

/** ms since the last pulse of `kind` (Infinity if never). */
export function sinceFx(kind: FxKind, now = performance.now()): number {
  const p = fx.last[kind]
  return p ? now - p.t : Infinity
}

export function pulseId(kind: FxKind): number {
  return fx.last[kind]?.id ?? 0
}

export function shakeAt(now: number): number {
  return fx.shakeAmp * Math.exp(-(now - fx.shakeT) / 140)
}

/** 0 (library-quiet) … 1 (walk-off bedlam). */
export function excitementAt(now: number): number {
  const tau = fx.exciteLevel > 0.9 ? 5200 : 2600
  return BASE_EXCITE + (fx.exciteLevel - BASE_EXCITE) * Math.exp(-(now - fx.exciteT) / tau)
}

let installed = false

/** Derive visual pulses from store transitions. Idempotent. */
export function installFxDirector(): void {
  if (installed) return
  installed = true
  useGame.subscribe((s, prev) => {
    if (s.phase !== prev.phase) {
      if (s.phase === 'call' && s.active) emitFx('mitt', s.active.pitch.mph / 95)
      if (s.phase === 'swingResult' && s.active?.outcome) {
        const o = s.active.outcome
        if (o.kind === 'whiff') emitFx('mitt', s.active.pitch.mph / 95)
        else {
          emitFx('crack', o.kind === 'inPlay' && o.quality === 'hard' ? 1.3 : 0.8)
          if (o.kind === 'inPlay' && o.bases === 4) emitFx('homer')
          else if (o.kind === 'inPlay' && o.bases > 0) emitFx('hit')
        }
      }
      if (s.phase === 'reveal' && s.reveal && !s.reveal.record.hesitated) {
        emitFx(s.reveal.record.correct ? 'correct' : 'miss')
      }
      if (s.phase === 'challenge') emitFx('challenge')
      if (s.phase === 'newBatter') emitFx('newBatter')
    }
    if (s.sit !== prev.sit && s.mode === prev.mode && s.seedText === prev.seedText) {
      if (s.sit.homeScore > prev.sit.homeScore) emitFx('run', s.sit.homeScore - prev.sit.homeScore)
      if (s.sit.outs > prev.sit.outs && s.sit.strikes >= 3) emitFx('strikeout')
      if (s.sit.walkOff && !prev.sit.walkOff) emitFx('walkoff')
    }
  })
}
