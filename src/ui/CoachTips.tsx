import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'

type TipKey = 'watch' | 'call' | 'reveal' | 'swing'

const TIPS: Record<TipKey, { title: string; body: string; spot: 'top' | 'call' | 'side' }> = {
  watch: {
    title: 'WATCH THE BALL',
    body: 'Track it out of the pitcher’s hand and all the way into the mitt.',
    spot: 'top',
  },
  call: {
    title: 'NO SWING — YOUR CALL',
    body: 'Tap BALL or STRIKE (or press B / S) before the ring runs out.',
    spot: 'call',
  },
  reveal: {
    title: 'THE K-ZONE TELLS THE TRUTH',
    body: 'Teal means you nailed it, ember means you missed. Your call still counts either way.',
    spot: 'side',
  },
  swing: {
    title: 'SWINGS PLAY THEMSELVES',
    body: 'Whiffs, fouls and balls in play resolve on their own. Only takes need you.',
    spot: 'top',
  },
}

/**
 * First-game coaching: a handful of contextual hints that appear exactly when
 * they matter, then retire themselves (re-enable under Settings → Game).
 */
export function CoachTips() {
  const enabled = useSettings((s) => s.showTips)
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const swung = useGame((s) => Boolean(s.active?.plan.swings))
  const seen = useRef<Set<TipKey>>(new Set())
  const [tip, setTip] = useState<TipKey | null>(null)

  useEffect(() => {
    if (!enabled) seen.current.clear()
  }, [enabled])

  useEffect(() => {
    if (!enabled || mode !== 'single') {
      setTip(null)
      return
    }
    let next: TipKey | null = null
    if (phase === 'prePitch' || phase === 'windup' || phase === 'flight') next = 'watch'
    else if (phase === 'call') next = 'call'
    else if (phase === 'reveal') next = 'reveal'
    else if (phase === 'swingResult' && swung) next = 'swing'
    if (next && !seen.current.has(next)) {
      seen.current.add(next)
      setTip(next)
    } else if (next !== tip) {
      setTip(null)
    }
    // Core lesson learned: once the first call has been revealed, retire.
    if (phase === 'newBatter' || phase === 'prePitch') {
      if (seen.current.has('call') && seen.current.has('reveal')) useSettings.getState().set({ showTips: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, enabled, mode, swung])

  if (!tip || phase === 'menu' || phase === 'inningOver') return null
  const t = TIPS[tip]
  return (
    <div className={`coach coach--${t.spot}`} role="note" key={tip}>
      <span className="coach__badge">TIP</span>
      <div>
        <b>{t.title}</b>
        <span>{t.body}</span>
      </div>
      <button className="coach__x" aria-label="Turn off tips" title="Turn off tips" onClick={() => useSettings.getState().set({ showTips: false })}>✕</button>
    </div>
  )
}
