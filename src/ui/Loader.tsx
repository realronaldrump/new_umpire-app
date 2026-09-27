import { useEffect, useState } from 'react'
import { useUi } from '../store/ui'

/** Branded curtain while the park is painted and the first frames render. */
export function Loader() {
  const ready = useUi((s) => s.sceneReady)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => setGone(true), 900)
    return () => window.clearTimeout(t)
  }, [ready])
  if (gone) return null
  return (
    <div className={`loader ${ready ? 'loader--out' : ''}`} aria-live="polite" aria-busy={!ready}>
      <div className="loader__ball" aria-hidden>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="#f4f1ea" />
          <path d="M22 14 q14 36 0 72 M78 14 q-14 36 0 72" stroke="#c9273a" strokeWidth="5" fill="none" strokeDasharray="4 5" />
        </svg>
      </div>
      <span className="loader__title">BIG BEAUTIFUL <em>UMPIRE APP</em></span>
      <span className="loader__sub">GROUNDS CREW IS LINING THE FIELD…</span>
    </div>
  )
}
