import { useUi } from '../store/ui'

export function HowToPlay() {
  const open = useUi((s) => s.howToOpen)
  if (!open) return null
  const close = () => useUi.getState().set({ howToOpen: false })
  return (
    <div className="veil veil--sheet" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="sheet panel" role="dialog" aria-label="How to play">
        <header className="sheet__head">
          <span>HOW TO PLAY</span>
          <button className="icon-btn" onClick={close} aria-label="Close">✕</button>
        </header>
        <div className="howto-grid">
          <div className="howto">
            <span className="howto__n">1</span>
            <b>TRACK THE PITCH</b>
            <span>You're behind the plate. Watch the ball from the pitcher's hand all the way into the mitt. 95 mph looks fast because it is.</span>
          </div>
          <div className="howto">
            <span className="howto__n">2</span>
            <b>CALL THE TAKES</b>
            <span>If the batter doesn't swing, it's your call: <kbd>B</kbd> / <kbd>◀</kbd> for BALL, <kbd>S</kbd> / <kbd>▶</kbd> for STRIKE — before the ring runs out.</span>
          </div>
          <div className="howto">
            <span className="howto__n">3</span>
            <b>LIVE WITH IT</b>
            <span>Swings play themselves. Your calls go in the book, right or wrong — and they change the game. The K-Zone replay shows the truth.</span>
          </div>
        </div>
        <div className="howto-rules">
          <div>
            <b>THE ZONE</b>
            <span>Any part of the ball over any part of the plate, between the hollow of the knee and the midpoint of the batter's torso — measured in 3D, over the whole pentagon.</span>
          </div>
          <div>
            <b>FRAMING</b>
            <span>On Pro and Legend the catcher quietly drags borderline pitches toward the zone. Call where the ball crossed, not where it was caught.</span>
          </div>
          <div>
            <b>ABS CHALLENGES</b>
            <span>On Legend both dugouts can send a call to the robot zone. Get overturned and the book takes the truth.</span>
          </div>
        </div>
        <p className="howto-keys"><kbd>SPACE</kbd> or tap the field to skip ahead · <kbd>ESC</kbd> pause · <kbd>F</kbd> fullscreen · same seed, same ninth</p>
        <button className="btn btn--gold" onClick={close}>GOT IT</button>
      </div>
    </div>
  )
}
