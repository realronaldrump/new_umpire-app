import { useEffect, useState } from 'react'
import { ALL_PITCH_KEYS, PITCH_TYPES, type PitchTypeKey } from '../game/pitchTypes'
import { zoneFor } from '../game/strikeZone'
import { useGame, type ForcedPitch } from '../store/game'

function useFps(): number {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = () => {
      frames++
      const t = performance.now()
      if (t - last > 500) {
        setFps(Math.round((frames * 1000) / (t - last)))
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

export function DebugPanel() {
  const open = useGame((s) => s.debugOpen)
  const active = useGame((s) => s.active)
  const phase = useGame((s) => s.phase)
  const seed = useGame((s) => s.seedText)
  const slowMo = useGame((s) => s.slowMo)
  const autoCall = useGame((s) => s.autoCall)
  const orbit = useGame((s) => s.orbit)
  const forceChallenge = useGame((s) => s.forceChallenge)
  const fps = useFps()
  const [typeKey, setTypeKey] = useState<PitchTypeKey>('slider')
  const [loc, setLoc] = useState<ForcedPitch['loc']>('edge')
  const [forceTake, setForceTake] = useState(true)

  if (!open) return null
  const p = active?.pitch
  const zone = active ? zoneFor(active.batter) : null
  const setDebug = useGame.getState().setDebug

  return (
    <div className="debug panel">
      <div className="debug__row debug__row--head">
        <b>DEV</b>
        <span>{fps} fps</span>
        <span>{phase}</span>
        <span>seed {seed}</span>
      </div>
      {p && active && (
        <>
          <div className="debug__row">
            <span>{p.typeName} · {p.mph.toFixed(1)} mph (rel {p.releaseSpeedMph.toFixed(1)})</span>
          </div>
          <div className="debug__row">
            <span>IVB {p.ivbIn.toFixed(1)}" · HB {p.hbIn.toFixed(1)}" · spin {Math.round(p.spinRpm)}</span>
          </div>
          <div className="debug__row">
            <span>
              front x {p.cross.x.toFixed(2)} ft, z {p.cross.z.toFixed(2)} ft · closest depth {(-p.zonePoint.y * 12).toFixed(1)}\" →{' '}
              <b style={{ color: p.truthStrike ? 'var(--teal)' : 'var(--ember)' }}>
                {p.truthStrike ? 'STRIKE' : 'BALL'}
              </b>{' '}
              (edge {p.metrics.edgeDistIn.toFixed(1)}" {p.metrics.nearestEdge}{p.borderline ? ', borderline' : ''})
            </span>
          </div>
          {zone && (
            <div className="debug__row">
              <span>zone {zone.botFt.toFixed(2)}–{zone.topFt.toFixed(2)} ft ({active.batter.heightIn}" batter)</span>
            </div>
          )}
          <div className="debug__row">
            <span>
              swing p={active.plan.swingProb.toFixed(2)} → {active.plan.hbp ? 'HBP' : active.plan.swings ? `SWING (${active.outcome?.kind})` : 'TAKE'}
            </span>
          </div>
        </>
      )}
      <div className="debug__row debug__row--btns">
        <button className={slowMo ? 'on' : ''} onClick={() => setDebug({ slowMo: !slowMo })}>slow-mo (T)</button>
        <button className={autoCall ? 'on' : ''} onClick={() => setDebug({ autoCall: !autoCall })}>auto-call</button>
        <button className={orbit ? 'on' : ''} onClick={() => setDebug({ orbit: !orbit })}>orbit (O)</button>
        <button
          className={forceChallenge ? 'on' : ''}
          title="Batter challenges every called strike (needs challenges in the tank)"
          onClick={() => setDebug({ forceChallenge: !forceChallenge })}
        >
          force ABS
        </button>
      </div>
      <div className="debug__row debug__row--btns">
        <select value={typeKey} onChange={(e) => setTypeKey(e.target.value as PitchTypeKey)}>
          {ALL_PITCH_KEYS.map((k) => (
            <option key={k} value={k}>{PITCH_TYPES[k].short}</option>
          ))}
        </select>
        <select value={loc} onChange={(e) => setLoc(e.target.value as ForcedPitch['loc'])}>
          <option value="center">center</option>
          <option value="edge">edge</option>
          <option value="chase">chase</option>
          <option value="wild">wild</option>
        </select>
        <button className={forceTake ? 'on' : ''} onClick={() => setForceTake(!forceTake)}>take</button>
        <button
          onClick={() => {
            setDebug({ forced: { typeKey, loc, forceTake } })
            useGame.getState().hurry()
          }}
        >
          throw next ↩
        </button>
      </div>
      <div className="debug__row debug__row--hint">
        <span>` debug · T slow · O orbit · Space hurry · B/S or ◀/▶ call</span>
      </div>
    </div>
  )
}
