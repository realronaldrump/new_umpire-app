import { useEffect, useRef } from 'react'
import { useGame } from '../store/game'

const RING_R = 27
const CIRC = 2 * Math.PI * RING_R

/** BALL / STRIKE affordance with a countdown ring. Renders only on takes. */
export function CallPrompt() {
  const phase = useGame((s) => s.phase)
  const ringRef = useRef<SVGCircleElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'call') return
    let raf = 0
    const loop = () => {
      const g = useGame.getState()
      const ring = ringRef.current
      if (ring && g.callDeadline !== null && g.phaseDur > 0) {
        const frac = Math.max(0, Math.min(1, (g.callDeadline - performance.now()) / g.phaseDur))
        ring.style.strokeDashoffset = String(CIRC * (1 - frac))
        ring.style.stroke = frac > 0.4 ? 'var(--gold)' : 'var(--ember)'
        if (wrapRef.current) wrapRef.current.classList.toggle('callprompt--urgent', frac <= 0.4)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  if (phase !== 'call') return null
  const makeCall = useGame.getState().makeCall

  return (
    <div className="callprompt" ref={wrapRef}>
      <button className="callbtn callbtn--ball" onClick={() => makeCall('ball')}>
        <svg viewBox="0 0 22 22" className="callbtn__icon" aria-hidden>
          <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
        </svg>
        <span className="callbtn__word">BALL</span>
        <span className="callbtn__key">B · ◀</span>
      </button>

      <div className="callprompt__ring" aria-hidden>
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={RING_R} fill="rgba(6,10,18,0.55)" stroke="rgba(210,224,240,0.18)" strokeWidth="4" />
          <circle
            ref={ringRef}
            cx="32" cy="32" r={RING_R}
            fill="none" stroke="var(--gold)" strokeWidth="4.5" strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={0}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span className="callprompt__label">CALL IT</span>
      </div>

      <button className="callbtn callbtn--strike" onClick={() => makeCall('strike')}>
        <svg viewBox="0 0 22 22" className="callbtn__icon" aria-hidden>
          <path d="M11 2.2L19.8 11L11 19.8L2.2 11Z" fill="currentColor" />
        </svg>
        <span className="callbtn__word">STRIKE</span>
        <span className="callbtn__key">S · ▶</span>
      </button>
    </div>
  )
}
