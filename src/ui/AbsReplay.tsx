import { useEffect, useState } from 'react'
import { BALL_RADIUS_FT, EFFECTIVE_HALF_WIDTH_FT, PLATE_HALF_WIDTH_FT, TIMING } from '../game/constants'
import { useGame } from '../store/game'

const FX = (x: number) => 130 + x * 52
const FY = (z: number) => 268 - z * 56

const TRACK_IN_MS = 520 // grid calibration beat before the pitch replays
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

/**
 * The jumbotron moment: a full ABS review of the challenged strike call.
 * Timing is driven off the store phase clock (pause-safe), so the verdict
 * stamp lands exactly when the store fires the verdict audio.
 */
export function AbsReplay() {
  const challenge = useGame((s) => s.absChallenge)
  const challengesLeft = useGame((s) => s.challengesLeft)
  const challengesMax = useGame((s) => s.challengesMax)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const g = useGame.getState()
      const t = g.paused ? g.pausedAt : performance.now()
      setElapsed(Math.max(0, t - g.phaseStart))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!challenge) return null

  const verdict = elapsed >= TIMING.absTrackMs
  const trackP = clamp01((elapsed - TRACK_IN_MS) / (TIMING.absTrackMs - TRACK_IN_MS - 350))
  const flight = easeOut(clamp01(trackP / 0.55))
  const locked = trackP > 0.62

  // Replayed flight path: drops in from high release side toward the true crossing point.
  const x1 = FX(challenge.cross.x)
  const y1 = FY(challenge.cross.z)
  const x0 = x1 - Math.sign(challenge.cross.x || 1) * 150 - 30
  const y0 = 8
  const bx = lerp(x0, x1, flight)
  const by = lerp(y0, y1, flight) + Math.sin(flight * Math.PI) * 26

  const zt = challenge.zoneTopFt
  const zb = challenge.zoneBotFt
  const zx = PLATE_HALF_WIDTH_FT
  const ex = EFFECTIVE_HALF_WIDTH_FT
  const thirdW = (zx * 2) / 3
  const thirdH = (zt - zb) / 3

  const overturned = challenge.overturned
  const pipsLeft = verdict && !overturned ? Math.max(0, challengesLeft - 1) : challengesLeft
  const edgeIn = Math.abs(challenge.edgeDistIn)
  const readout = !locked
    ? 'TRACKING PITCH…'
    : `CLOSEST PASS · ${(edgeIn * clamp01((trackP - 0.62) / 0.3)).toFixed(1)}" ${challenge.truthStrike ? 'INSIDE THE ZONE' : 'OFF THE ZONE'}`

  return (
    <div className="abs-veil" role="alertdialog" aria-label="Automated ball-strike review">
      <div className={`abs-board ${verdict ? (overturned ? 'abs-board--over' : 'abs-board--conf') : ''}`}>
        <header className="abs-board__head">
          <span className="abs-board__live"><i /> ABS · AUTOMATED BALL-STRIKE</span>
          <span className="abs-board__title">CHALLENGE — {challenge.batterName.toUpperCase()}</span>
          <span className="abs-board__count">COUNT {challenge.countBefore} · CALL ON FIELD: STRIKE</span>
        </header>

        <div className="abs-board__stage">
          <svg viewBox="0 0 260 300" className="abs-zone" aria-hidden>
            {/* Ground + plate */}
            <line x1={16} y1={FY(0)} x2={244} y2={FY(0)} stroke="rgba(210,225,240,0.28)" strokeWidth={2} />
            <path
              d={`M ${FX(-zx)} ${FY(0) + 5} L ${FX(zx)} ${FY(0) + 5} L ${FX(zx * 0.62)} ${FY(0) + 14} L ${FX(0)} ${FY(0) + 19} L ${FX(-zx * 0.62)} ${FY(0) + 14} Z`}
              fill="rgba(226,233,240,0.55)"
            />
            {/* Ball-radius guide */}
            <rect
              x={FX(-ex)} y={FY(zt + BALL_RADIUS_FT)} width={FX(ex) - FX(-ex)} height={FY(zb - BALL_RADIUS_FT) - FY(zt + BALL_RADIUS_FT)}
              fill="none" stroke="rgba(127,212,232,0.4)" strokeDasharray="6 6" strokeWidth={1.6}
              className="abs-zone__calib"
            />
            {/* Rulebook zone + grid */}
            <rect
              x={FX(-zx)} y={FY(zt)} width={FX(zx) - FX(-zx)} height={FY(zb) - FY(zt)}
              fill={verdict ? (overturned ? 'rgba(63,217,196,0.07)' : 'rgba(245,185,66,0.07)') : 'rgba(190,215,240,0.05)'}
              stroke="rgba(240,246,252,0.95)" strokeWidth={2.6}
              className="abs-zone__frame"
            />
            {[1, 2].map((i) => (
              <g key={i} stroke="rgba(235,242,248,0.15)" strokeWidth={1.2}>
                <line x1={FX(-zx + thirdW * i)} y1={FY(zt)} x2={FX(-zx + thirdW * i)} y2={FY(zb)} />
                <line x1={FX(-zx)} y1={FY(zb + thirdH * i)} x2={FX(zx)} y2={FY(zb + thirdH * i)} />
              </g>
            ))}

            {/* Scanline sweep while measuring */}
            {!verdict && trackP > 0 && (
              <line
                x1={16} x2={244}
                y1={FY(zb) - (FY(zb) - FY(zt)) * ((trackP * 2.6) % 1)}
                y2={FY(zb) - (FY(zb) - FY(zt)) * ((trackP * 2.6) % 1)}
                stroke="rgba(63,217,196,0.5)" strokeWidth={2}
              />
            )}

            {/* Trail ghosts + live ball */}
            {flight > 0.12 && [0.55, 0.7, 0.85].map((k) => {
              const f = easeOut(clamp01((trackP / 0.55) * k))
              return (
                <circle
                  key={k}
                  cx={lerp(x0, x1, f)}
                  cy={lerp(y0, y1, f) + Math.sin(f * Math.PI) * 26}
                  r={BALL_RADIUS_FT * 52}
                  fill="none"
                  stroke="rgba(240,246,252,0.28)"
                  strokeWidth={1.4}
                />
              )
            })}
            {trackP > 0 && (
              <circle
                cx={bx} cy={by} r={BALL_RADIUS_FT * 52 + 0.8}
                fill={verdict ? (overturned ? 'var(--teal)' : 'var(--gold)') : '#f6f9fc'}
                stroke="#0b1220" strokeWidth={1.6}
              />
            )}
            {/* Lock-on crosshair once the measurement lands */}
            {locked && (
              <g className={verdict ? 'abs-zone__lock abs-zone__lock--verdict' : 'abs-zone__lock'}>
                <circle cx={x1} cy={y1} r={BALL_RADIUS_FT * 52 + 7} fill="none" stroke={overturned && verdict ? 'var(--teal)' : 'rgba(245,185,66,0.9)'} strokeWidth={2} strokeDasharray="10 7" />
                <line x1={x1 - 26} y1={y1} x2={x1 - 12} y2={y1} stroke="rgba(240,246,252,0.8)" strokeWidth={1.6} />
                <line x1={x1 + 12} y1={y1} x2={x1 + 26} y2={y1} stroke="rgba(240,246,252,0.8)" strokeWidth={1.6} />
                <line x1={x1} y1={y1 - 26} x2={x1} y2={y1 - 12} stroke="rgba(240,246,252,0.8)" strokeWidth={1.6} />
                <line x1={x1} y1={y1 + 12} x2={x1} y2={y1 + 26} stroke="rgba(240,246,252,0.8)" strokeWidth={1.6} />
              </g>
            )}
          </svg>

          {verdict && (
            <div className={`abs-stamp ${overturned ? 'abs-stamp--over' : 'abs-stamp--conf'}`}>
              <b>{overturned ? 'OVERTURNED' : 'CONFIRMED'}</b>
              <span>{overturned ? 'THAT PITCH IS A BALL' : 'THE STRIKE CALL STANDS'}</span>
            </div>
          )}
        </div>

        <footer className="abs-board__foot">
          <span className="abs-board__readout">{verdict ? (overturned ? 'CALL REVERSED — THE PARK ERUPTS' : 'CHALLENGE LOST — BOOS RAIN DOWN') : readout}</span>
          <span className="abs-board__pips" aria-label={`${pipsLeft} of ${challengesMax} challenges remaining`}>
            CHALLENGES {Array.from({ length: challengesMax }, (_, i) => (
              <i key={i} className={i < pipsLeft ? 'on' : ''} />
            ))}
          </span>
        </footer>
      </div>
    </div>
  )
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
