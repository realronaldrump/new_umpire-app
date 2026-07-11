import { BALL_RADIUS_FT, EFFECTIVE_HALF_WIDTH_FT, PLATE_HALF_WIDTH_FT } from '../game/constants'
import type { CallRecord } from '../game/report'

const FX = (x: number) => 110 + x * 40
const FY = (z: number) => 236 - z * 44

/**
 * Broadcast K-zone replay. Draws the batter's rulebook zone, the ball-radius
 * front-view projection and the ball center at its closest pass over the plate.
 * Ground truth is the full 3D pentagonal rulebook volume.
 */
export function KZone({ record, compact = false }: { record: CallRecord; compact?: boolean }) {
  const zt = record.zoneTopFt
  const zb = record.zoneBotFt
  const zx = PLATE_HALF_WIDTH_FT
  const ex = EFFECTIVE_HALF_WIDTH_FT
  const et = zt + BALL_RADIUS_FT
  const eb = zb - BALL_RADIUS_FT
  const thirdW = (zx * 2) / 3
  const thirdH = (zt - zb) / 3
  const good = record.correct

  return (
    <svg
      viewBox="0 0 220 250"
      className={compact ? 'kzone kzone--compact' : 'kzone'}
      role="img"
      aria-label={`Pitch was closest to the rulebook zone at ${record.cross.x.toFixed(2)} feet horizontal, ${record.cross.z.toFixed(2)} feet high; true call ${record.truthStrike ? 'strike' : 'ball'}`}
    >
      {/* Ground + plate width reference */}
      <line x1={12} y1={FY(0)} x2={208} y2={FY(0)} stroke="rgba(210,225,240,0.25)" strokeWidth={2} />
      <path
        d={`M ${FX(-zx)} ${FY(0) + 4} L ${FX(zx)} ${FY(0) + 4} L ${FX(zx * 0.62)} ${FY(0) + 11} L ${FX(0)} ${FY(0) + 15} L ${FX(-zx * 0.62)} ${FY(0) + 11} Z`}
        fill="rgba(226,233,240,0.5)"
      />

      {/* Front-view ball-radius guide; exact corner/depth contact is evaluated in 3D. */}
      <rect
        x={FX(-ex)} y={FY(et)} width={FX(ex) - FX(-ex)} height={FY(eb) - FY(et)}
        fill="none" stroke="rgba(127,212,232,0.45)" strokeDasharray="5 5" strokeWidth={1.6}
      />

      {/* Rulebook zone + thirds grid */}
      <rect
        x={FX(-zx)} y={FY(zt)} width={FX(zx) - FX(-zx)} height={FY(zb) - FY(zt)}
        fill="rgba(190,215,240,0.05)" stroke="rgba(235,242,248,0.85)" strokeWidth={2.2}
      />
      {[1, 2].map((i) => (
        <g key={i} stroke="rgba(235,242,248,0.16)" strokeWidth={1.2}>
          <line x1={FX(-zx + thirdW * i)} y1={FY(zt)} x2={FX(-zx + thirdW * i)} y2={FY(zb)} />
          <line x1={FX(-zx)} y1={FY(zb + thirdH * i)} x2={FX(zx)} y2={FY(zb + thirdH * i)} />
        </g>
      ))}

      {/* The pitch */}
      <circle
        cx={FX(record.cross.x)} cy={FY(record.cross.z)} r={BALL_RADIUS_FT * 40 + 0.6}
        fill={good ? 'var(--teal)' : 'var(--ember)'}
        stroke="#f6f9fc" strokeWidth={1.8}
      />
      {!compact && (
        <text
          x={FX(record.cross.x)}
          y={FY(record.cross.z) - 10}
          textAnchor="middle"
          fill="rgba(240,246,252,0.9)"
          fontSize={11}
          fontFamily="Archivo, sans-serif"
          fontWeight={600}
        >
          {record.truthStrike ? 'STRIKE' : 'BALL'}
        </text>
      )}
    </svg>
  )
}

export function VerdictChip({ record }: { record: CallRecord }) {
  if (record.hesitated) {
    return (
      <div className="verdict verdict--hes">
        <svg viewBox="0 0 20 20" className="verdict__icon" aria-hidden>
          <rect x="3" y="3" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M10 6v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        NO CALL — TOO SLOW
      </div>
    )
  }
  return record.correct ? (
    <div className="verdict verdict--good">
      <svg viewBox="0 0 20 20" className="verdict__icon" aria-hidden>
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M6.2 10.4l2.6 2.6 5-5.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      CORRECT CALL
    </div>
  ) : (
    <div className="verdict verdict--bad">
      <svg viewBox="0 0 20 20" className="verdict__icon" aria-hidden>
        <path d="M10 1.5L18.5 10L10 18.5L1.5 10Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      MISSED CALL
    </div>
  )
}

export function ReplayCard({ record }: { record: CallRecord }) {
  return (
    <aside className="replay-card" aria-live="polite">
      <div className="replay-card__head">
        <span className="replay-card__kicker">K-ZONE REPLAY</span>
        <VerdictChip record={record} />
      </div>
      <KZone record={record} />
      <div className="replay-card__calls">
        <span>
          YOUR CALL <b>{record.hesitated ? '—' : record.playerCall.toUpperCase()}</b>
        </span>
        <span>
          TRUTH <b>{record.truthStrike ? 'STRIKE' : 'BALL'}</b>
        </span>
      </div>
      <p className="replay-card__note">{record.note}</p>
    </aside>
  )
}
