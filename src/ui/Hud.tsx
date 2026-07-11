import { useEffect, useState } from 'react'
import { audio } from '../audio/engine'
import { heightLabel, AWAY_TEAM, HOME_TEAM } from '../game/roster'
import { useGame } from '../store/game'
import { useUi } from '../store/ui'
import { CallPrompt } from './CallPrompt'
import { ReplayCard } from './ReplayCard'

function Dots({ n, of, color, shape = 'circle' }: { n: number; of: number; color: string; shape?: 'circle' | 'square' }) {
  return (
    <span className="dots" aria-label={`${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <i
          key={i}
          className={`dot dot--${shape} ${i < n ? 'dot--on' : ''}`}
          style={i < n ? { background: color, borderColor: color } : undefined}
        />
      ))}
    </span>
  )
}

function BasesDiamond() {
  const bases = useGame((s) => s.sit.bases)
  return (
    <svg viewBox="0 0 40 40" className="bases" aria-label="base runners">
      <rect x="16" y="2" width="11" height="11" transform="rotate(45 21.5 7.5)" className={bases.second ? 'base base--on' : 'base'} />
      <rect x="27" y="13" width="11" height="11" transform="rotate(45 32.5 18.5)" className={bases.first ? 'base base--on' : 'base'} />
      <rect x="5" y="13" width="11" height="11" transform="rotate(45 10.5 18.5)" className={bases.third ? 'base base--on' : 'base'} />
    </svg>
  )
}

function ScoreBug() {
  const sit = useGame((s) => s.sit)
  return (
    <div className="scorebug panel">
      <div className="scorebug__teams">
        <div className="scorebug__row">
          <span className="scorebug__chip" style={{ background: AWAY_TEAM.accent }} />
          <span className="scorebug__abbr">{AWAY_TEAM.abbr}</span>
          <span className="scorebug__score">{sit.awayScore}</span>
        </div>
        <div className="scorebug__row">
          <span className="scorebug__chip" style={{ background: HOME_TEAM.accent }} />
          <span className="scorebug__abbr">{HOME_TEAM.abbr}</span>
          <span className="scorebug__score">{sit.homeScore}</span>
        </div>
      </div>
      <div className="scorebug__state">
        <span className="scorebug__inning">▼ 9</span>
        <BasesDiamond />
        <div className="scorebug__counts">
          <span className="countline"><em>B</em><Dots n={sit.balls} of={3} color="var(--green)" /></span>
          <span className="countline"><em>S</em><Dots n={sit.strikes} of={2} color="var(--red)" /></span>
          <span className="countline"><em>O</em><Dots n={sit.outs} of={2} color="var(--gold)" shape="square" /></span>
        </div>
      </div>
    </div>
  )
}

function UmpireChip() {
  const calls = useGame((s) => s.calls)
  const pitches = useGame((s) => s.sit.totalPitches)
  const pitcher = useGame((s) => s.pitcher)
  const correct = calls.filter((c) => c.correct).length
  const pct = calls.length ? Math.round((100 * correct) / calls.length) : null
  return (
    <div className="umpchip panel">
      <span className="umpchip__pitcher">
        {pitcher.name.toUpperCase()} #{pitcher.number} · {pitcher.hand}HP
      </span>
      <span className="umpchip__sep" />
      <span className="umpchip__acc">
        UMP {pct === null ? '—' : `${pct}%`} <small>({correct}/{calls.length})</small>
      </span>
      <span className="umpchip__sep" />
      <span className="umpchip__pc">P {pitches}</span>
    </div>
  )
}

function BatterCard() {
  const batter = useGame((s) => (s.lineup.length ? s.lineup[s.sit.batterIdx] : null))
  if (!batter) return null
  return (
    <div className="battercard panel">
      <span className="battercard__order">{batter.order}</span>
      <div className="battercard__main">
        <span className="battercard__name">{batter.name.toUpperCase()}</span>
        <span className="battercard__meta">
          BATS {batter.hand} · {heightLabel(batter.heightIn)} · AVG {batter.avgLabel}
        </span>
      </div>
    </div>
  )
}

function Banner() {
  const banner = useGame((s) => s.banner)
  const phase = useGame((s) => s.phase)
  if (!banner || phase === 'menu' || phase === 'inningOver') return null
  return (
    <div key={banner.key} className={`banner banner--${banner.tone}`}>
      <span className="banner__title">{banner.title}</span>
      {banner.sub && <span className="banner__sub">{banner.sub}</span>}
    </div>
  )
}

function Ticker() {
  const ticker = useGame((s) => s.ticker)
  if (!ticker.length) return null
  return (
    <div className="ticker">
      {ticker.map((t, i) => (
        <div key={t.id} className="ticker__item" style={{ opacity: 1 - i * 0.18 }}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

function TopButtons() {
  const paused = useGame((s) => s.paused)
  const mode = useGame((s) => s.mode)
  const [fs, setFs] = useState(Boolean(document.fullscreenElement))
  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  return (
    <div className="topbtns">
      {mode === 'single' && (
        <button
          className="icon-btn"
          title={paused ? 'Resume (Esc)' : 'Pause (Esc)'}
          onClick={() => {
            audio.uiClick()
            useGame.getState().setPaused(!paused, !paused)
          }}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      )}
      <button
        className="icon-btn"
        title="Settings"
        onClick={() => {
          audio.uiClick()
          if (mode === 'single') useGame.getState().setPaused(true, false)
          useUi.getState().set({ settingsOpen: true })
        }}
      >
        ⚙
      </button>
      <button
        className="icon-btn"
        title={fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
        onClick={() => {
          audio.uiClick()
          void toggleFullscreen()
        }}
      >
        {fs ? '⤢' : '⛶'}
      </button>
    </div>
  )
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    /* some browsers refuse outside gestures */
  }
}

function PauseVeil() {
  const paused = useGame((s) => s.paused)
  const menuOpen = useGame((s) => s.pauseMenuOpen)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const mode = useGame((s) => s.mode)
  if (mode === 'multiplayer' || !paused || settingsOpen || !menuOpen) return null
  return (
    <div className="veil">
      <div className="veil__box panel">
        <span className="veil__title">PAUSED</span>
        <button className="btn btn--gold" onClick={() => useGame.getState().setPaused(false)}>
          RESUME
        </button>
        <button
          className="btn"
          onClick={() => {
            useGame.getState().setPaused(false)
            useUi.getState().set({ settingsOpen: true })
            useGame.getState().setPaused(true, false)
          }}
        >
          SETTINGS
        </button>
      </div>
    </div>
  )
}

export function Hud() {
  const phase = useGame((s) => s.phase)
  const reveal = useGame((s) => s.reveal)
  if (phase === 'menu' || phase === 'inningOver') return null
  return (
    <>
      <ScoreBug />
      <UmpireChip />
      <TopButtons />
      <BatterCard />
      <Ticker />
      <Banner />
      <CallPrompt />
      {phase === 'reveal' && reveal && <ReplayCard record={reveal.record} />}
      <PauseVeil />
    </>
  )
}
