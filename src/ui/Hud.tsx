import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/engine'
import { PITCH_TYPES } from '../game/pitchTypes'
import { heightLabel, AWAY_TEAM, HOME_TEAM } from '../game/roster'
import { PITCH_COLORS } from '../game/pitchColors'
import { useGame } from '../store/game'
import { useUi } from '../store/ui'
import { AbsReplay } from './AbsReplay'
import { CallPrompt } from './CallPrompt'
import { ReplayCard } from './ReplayCard'
import { MiniDiamond } from './StartScreen'
import { playAgain } from './EndScreen'

function Dots({ n, of, tone, shape = 'circle' }: { n: number; of: number; tone: string; shape?: 'circle' | 'square' }) {
  return (
    <span className="dots" aria-label={`${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={`dot dot--${shape} ${i < n ? `dot--on dot--${tone}` : ''}`} />
      ))}
    </span>
  )
}

/** Brief highlight when a value changes (score, count). */
function useFlash(value: unknown): boolean {
  const [on, setOn] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setOn(true)
    const t = window.setTimeout(() => setOn(false), 700)
    return () => window.clearTimeout(t)
  }, [value])
  return on
}

function ScoreBug() {
  const sit = useGame((s) => s.sit)
  const challengesLeft = useGame((s) => s.challengesLeft)
  const challengesMax = useGame((s) => s.challengesMax)
  const defensiveChallengesLeft = useGame((s) => s.defensiveChallengesLeft)
  const defensiveChallengesMax = useGame((s) => s.defensiveChallengesMax)
  const mode = useGame((s) => s.mode)
  const awayFlash = useFlash(sit.awayScore)
  const homeFlash = useFlash(sit.homeScore)
  return (
    <div className="scorebug" role="status" aria-label="Score">
      <div className="scorebug__teams">
        <div className={`scorebug__row ${awayFlash ? 'is-flash' : ''}`}>
          <span className="scorebug__chip" style={{ background: AWAY_TEAM.accent }} />
          <span className="scorebug__abbr">{AWAY_TEAM.abbr}</span>
          <span className="scorebug__score">{sit.awayScore}</span>
        </div>
        <div className={`scorebug__row ${homeFlash ? 'is-flash' : ''}`}>
          <span className="scorebug__chip" style={{ background: HOME_TEAM.accent }} />
          <span className="scorebug__abbr">{HOME_TEAM.abbr}</span>
          <span className="scorebug__score">{sit.homeScore}</span>
        </div>
      </div>
      <div className="scorebug__state">
        <span className="scorebug__inning">{sit.half === 'top' ? '▲' : '▼'}{sit.inning}</span>
        <MiniDiamond bases={sit.bases} size={36} />
      </div>
      <div className="scorebug__count">
        <span className="scorebug__bs">{sit.balls}<i>-</i>{sit.strikes}</span>
        <span className="countline"><em>OUT</em><Dots n={sit.outs} of={2} tone="gold" shape="square" /></span>
      </div>
      {(challengesMax > 0 || (mode === 'single' && defensiveChallengesMax > 0)) && (
        <div className="scorebug__abs">
          {challengesMax > 0 && (
            <span className="countline" title={mode === 'multiplayer' ? 'Pitcher ABS challenges remaining' : 'Batting-side ABS challenges remaining'}>
              <em>{mode === 'multiplayer' ? 'ABS P' : 'ABS B'}</em><Dots n={challengesLeft} of={challengesMax} tone="teal" />
            </span>
          )}
          {mode === 'single' && defensiveChallengesMax > 0 && (
            <span className="countline" title="Pitcher/catcher ABS challenges remaining">
              <em>ABS D</em><Dots n={defensiveChallengesLeft} of={defensiveChallengesMax} tone="gold" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Accuracy meter, streak and the pitcher on the mound. */
function UmpireChip() {
  const calls = useGame((s) => s.calls)
  const pitches = useGame((s) => s.sit.totalPitches)
  const pitcher = useGame((s) => s.pitcher)
  const mode = useGame((s) => s.mode)
  const correct = calls.filter((c) => c.correct).length
  const pct = calls.length ? Math.round((100 * correct) / calls.length) : null
  let streak = 0
  for (let i = calls.length - 1; i >= 0 && calls[i].correct; i--) streak++
  return (
    <div className="umpchip panel">
      <div className="umpchip__acc">
        <span className="umpchip__label">UMP</span>
        <b>{pct === null ? '—' : `${pct}%`}</b>
        <small>{correct}/{calls.length}</small>
        {streak >= 2 && <span className="umpchip__streak" key={streak} title="Correct calls in a row">{streak} IN A ROW</span>}
      </div>
      <span className="umpchip__bar" aria-hidden><i style={{ width: `${pct ?? 0}%` }} /></span>
      <span className="umpchip__pitcher">
        {mode === 'practice' ? 'PRACTICE' : `${pitcher.name.toUpperCase()} #${pitcher.number} · ${pitcher.hand}HP · P ${pitches}`}
      </span>
    </div>
  )
}

/** Broadcast lower third for the man at the plate; re-animates on each new batter. */
function BatterCard() {
  const batter = useGame((s) => (s.lineup.length ? s.lineup[s.sit.batterIdx] : null))
  if (!batter) return null
  return (
    <div className="battercard" key={batter.id}>
      <span className="battercard__num">{batter.number}</span>
      <div className="battercard__main">
        <span className="battercard__order">{['LEADOFF', '2ND', '3RD', 'CLEANUP', '5TH', '6TH', '7TH', '8TH', '9TH'][batter.order - 1]} · BATS {batter.hand}</span>
        <span className="battercard__name">{batter.name.toUpperCase()}</span>
        <span className="battercard__meta">{heightLabel(batter.heightIn)} · AVG {batter.avgLabel}</span>
      </div>
    </div>
  )
}

/** Radar-gun readout after the ball reaches the mitt (or the bat). */
function PitchReadout() {
  const phase = useGame((s) => s.phase)
  const pitch = useGame((s) => s.active?.pitch)
  const show = pitch && (phase === 'call' || phase === 'reveal' || phase === 'swingResult' || phase === 'challengeWindow')
  if (!show || !pitch) return null
  return (
    <div className="pitchread" key={pitch.id}>
      <b>{Math.round(pitch.mph)}</b>
      <span>MPH</span>
      <i style={{ background: PITCH_COLORS[pitch.typeKey] }} />
      <em>{PITCH_TYPES[pitch.typeKey].name.toUpperCase()}</em>
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
      <span className="banner__bar" />
      {banner.sub && <span className="banner__sub">{banner.sub}</span>}
    </div>
  )
}

function Ticker() {
  const ticker = useGame((s) => s.ticker)
  if (!ticker.length) return null
  return (
    <div className="ticker">
      {ticker.slice(0, 4).map((t, i) => (
        <div key={t.id} className={`ticker__item ticker__item--${t.kind}`} style={{ opacity: 1 - i * 0.2 }}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Full-screen edge glow on each verdict: teal nailed it, ember missed it. */
function CallFlash() {
  const reveal = useGame((s) => s.reveal)
  const phase = useGame((s) => s.phase)
  if (phase !== 'reveal' || !reveal || reveal.record.hesitated) return null
  return <div key={reveal.record.pitchNo} className={`callflash ${reveal.record.correct ? 'callflash--good' : 'callflash--bad'}`} aria-hidden />
}

function SkipHint() {
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const paused = useGame((s) => s.paused)
  if (mode !== 'single' || paused) return null
  if (phase !== 'reveal' && phase !== 'newBatter' && phase !== 'swingResult' && phase !== 'prePitch') return null
  return (
    <button className="skiphint" onClick={() => useGame.getState().hurry()}>
      <kbd className="skiphint__key">SPACE</kbd> <span className="skiphint__tap">TAP TO</span> SKIP
    </button>
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
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            audio.uiClick()
            useGame.getState().setPaused(!paused, !paused)
          }}
        >
          {paused ? (
            <svg viewBox="0 0 20 20" aria-hidden><path d="M6 4v12l10-6z" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
          )}
        </button>
      )}
      <button
        className="icon-btn"
        title="Settings"
        aria-label="Settings"
        onClick={() => {
          audio.uiClick()
          if (mode === 'single') useGame.getState().setPaused(true, false)
          useUi.getState().set({ settingsOpen: true })
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden><path d="M10 6.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm7 4.3v-2.2l-2-.5a5.6 5.6 0 0 0-.6-1.4l1-1.8-1.6-1.6-1.8 1a5.6 5.6 0 0 0-1.4-.6l-.5-2H7.9l-.5 2a5.6 5.6 0 0 0-1.4.6l-1.8-1L2.6 5.2l1 1.8a5.6 5.6 0 0 0-.6 1.4l-2 .5v2.2l2 .5c.1.5.3 1 .6 1.4l-1 1.8 1.6 1.6 1.8-1c.4.3.9.5 1.4.6l.5 2h2.2l.5-2c.5-.1 1-.3 1.4-.6l1.8 1 1.6-1.6-1-1.8c.3-.4.5-.9.6-1.4Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      </button>
      <button
        className="icon-btn"
        title={fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
        aria-label="Toggle fullscreen"
        onClick={() => {
          audio.uiClick()
          void toggleFullscreen()
        }}
      >
        {fs ? (
          <svg viewBox="0 0 20 20" aria-hidden><path d="M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        )}
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
  const howToOpen = useUi((s) => s.howToOpen)
  const mode = useGame((s) => s.mode)
  if (mode === 'multiplayer' || !paused || settingsOpen || howToOpen || !menuOpen) return null
  const click = (fn: () => void) => () => {
    audio.uiClick()
    fn()
  }
  return (
    <div className="veil">
      <div className="pausemenu panel">
        <span className="pausemenu__title">PAUSED</span>
        <button className="btn btn--gold" autoFocus onClick={click(() => useGame.getState().setPaused(false))}>RESUME</button>
        <button className="btn" onClick={click(() => playAgain(true))}>RESTART THIS NINTH</button>
        <button className="btn" onClick={click(() => useUi.getState().set({ settingsOpen: true }))}>SETTINGS</button>
        <button className="btn" onClick={click(() => useUi.getState().set({ howToOpen: true }))}>HOW TO PLAY</button>
        <button className="btn btn--ghost" onClick={click(() => useGame.getState().newGame())}>QUIT TO TITLE</button>
      </div>
    </div>
  )
}

export function Hud() {
  const phase = useGame((s) => s.phase)
  const reveal = useGame((s) => s.reveal)
  const mode = useGame((s) => s.mode)
  if (phase === 'menu' || phase === 'inningOver') return null
  return (
    <div className="hud">
      <CallFlash />
      {mode !== 'practice' && <ScoreBug />}
      <UmpireChip />
      <TopButtons />
      {mode !== 'practice' && <BatterCard />}
      {mode !== 'practice' && <Ticker />}
      <PitchReadout />
      <Banner />
      <CallPrompt />
      <SkipHint />
      {phase === 'reveal' && reveal && <ReplayCard record={reveal.record} />}
      {phase === 'absReveal' && <AbsReplay />}
      <PauseVeil />
    </div>
  )
}
