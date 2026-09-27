import { useState } from 'react'
import { audio } from '../audio/engine'
import { DIFFICULTY, type Difficulty } from '../game/constants'
import type { Bases } from '../game/engine'
import { AWAY_TEAM, HOME_TEAM, teamFullName } from '../game/roster'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { useMultiplayer } from '../multiplayer/store'
import { Leaderboard } from '../leaderboard/Leaderboard'

const DIFF_KEYS: Difficulty[] = ['rookie', 'pro', 'legend']

/** Start the prepared ninth (shared by the PLAY BALL button, Enter and Space). */
export function startSolo(seed?: string): void {
  const g = useGame.getState()
  const typed = (seed ?? '').trim().toUpperCase()
  if (typed && typed !== g.seedText) g.newGame(typed)
  useGame.getState().playBall()
}

export function MiniDiamond({ bases, size = 34 }: { bases: Bases; size?: number }) {
  return (
    <svg viewBox="0 0 40 34" width={size} height={size * 0.85} className="minidiamond" aria-label="base runners">
      <rect x="15" y="1" width="10" height="10" transform="rotate(45 20 6)" className={bases.second ? 'on' : ''} />
      <rect x="27" y="13" width="10" height="10" transform="rotate(45 32 18)" className={bases.first ? 'on' : ''} />
      <rect x="3" y="13" width="10" height="10" transform="rotate(45 8 18)" className={bases.third ? 'on' : ''} />
    </svg>
  )
}

function situationLine(outs: number, bases: Bases): string {
  const on = [bases.first && '1st', bases.second && '2nd', bases.third && '3rd'].filter(Boolean) as string[]
  const runners = on.length === 0 ? 'Bases empty' : on.length === 3 ? 'Bases loaded' : `Runner${on.length > 1 ? 's' : ''} on ${on.join(' & ')}`
  return `${outs} out${outs === 1 ? '' : 's'} · ${runners}`
}

export function StartScreen() {
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const seedText = useGame((s) => s.seedText)
  const intro = useGame((s) => s.intro)
  const sit = useGame((s) => s.sit)
  const difficulty = useSettings((s) => s.difficulty)
  const setSettings = useSettings((s) => s.set)
  const mpOpen = useMultiplayer((s) => s.open)
  const [editing, setEditing] = useState(false)
  const [seedInput, setSeedInput] = useState('')
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  if (phase !== 'menu' || mode === 'multiplayer' || mpOpen) return null

  const reroll = () => {
    audio.uiClick()
    setSeedInput('')
    setEditing(false)
    useGame.getState().newGame()
  }
  const play = () => startSolo(seedInput)
  const preset = DIFFICULTY[difficulty]

  return (
    <>
    <div className="overlay start">
      <div className="start__inner">
        <header className="start__masthead">
          <span className="kicker">A HOME-PLATE UMPIRE SIMULATOR</span>
          <h1 className="start__title">
            <span>BIG BEAUTIFUL</span>
            <em>UMPIRE APP</em>
          </h1>
        </header>

        <section className="matchup" aria-label="Tonight's situation">
          <div className="matchup__teams">
            <div className="matchup__team">
              <i style={{ background: AWAY_TEAM.accent }} />
              <b>{AWAY_TEAM.abbr}</b>
              <span>{sit.awayScore}</span>
            </div>
            <div className="matchup__team">
              <i style={{ background: HOME_TEAM.accent }} />
              <b>{HOME_TEAM.abbr}</b>
              <span>{sit.homeScore}</span>
            </div>
          </div>
          <div className="matchup__state">
            <span className="matchup__inning">▼ 9TH</span>
            <MiniDiamond bases={sit.bases} />
          </div>
          <div className="matchup__copy">
            <b>{situationLine(sit.outs, sit.bases)}</b>
            <span>{intro}</span>
            <small>{teamFullName(AWAY_TEAM)} at {teamFullName(HOME_TEAM)}</small>
          </div>
        </section>

        <div className="start__diff">
          <div className="segmented" role="radiogroup" aria-label="difficulty">
            {DIFF_KEYS.map((key) => (
              <button
                key={key}
                role="radio"
                aria-checked={difficulty === key}
                className={difficulty === key ? 'on' : ''}
                onClick={() => {
                  audio.uiClick()
                  setSettings({ difficulty: key })
                }}
              >
                {DIFFICULTY[key].label.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="start__diffTag">{preset.tagline}</p>
        </div>

        <div className="start__cta">
          <button className="btn btn--gold btn--play" onClick={play}>
            <svg viewBox="0 0 20 20" aria-hidden><path d="M5 3.5v13l11-6.5z" fill="currentColor" /></svg>
            PLAY BALL
          </button>
          <button className="btn btn--practice" onClick={() => useGame.getState().startPractice()}>
            PRACTICE PITCHES
          </button>
          <button className="btn btn--versus" onClick={() => useMultiplayer.getState().openEntry()}>
            2-PLAYER SERIES
          </button>
        </div>

        <div className="start__links">
          <button className="linkbtn" onClick={() => { audio.uiClick(); useUi.getState().set({ howToOpen: true }) }}>
            How to play
          </button>
          <span aria-hidden>·</span>
          <button className="linkbtn" onClick={() => { audio.uiClick(); useUi.getState().set({ settingsOpen: true }) }}>
            Settings
          </button>
          <span aria-hidden>·</span>
          <button className="linkbtn" onClick={() => { audio.uiClick(); setLeaderboardOpen(true) }}>
            Leaderboard
          </button>
          <span aria-hidden>·</span>
          {editing ? (
            <label className="seedbox">
              <span>SEED</span>
              <input
                autoFocus
                value={seedInput}
                placeholder={seedText}
                maxLength={12}
                onChange={(e) => setSeedInput(e.target.value.toUpperCase())}
                onBlur={() => { if (!seedInput) setEditing(false) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') play()
                  if (e.key === 'Escape') setEditing(false)
                  e.stopPropagation()
                }}
              />
            </label>
          ) : (
            <button className="linkbtn linkbtn--seed" title="Type a seed to replay a specific ninth" onClick={() => setEditing(true)}>
              Seed <b>{seedText}</b>
            </button>
          )}
          <button className="icon-btn icon-btn--sm" title="Shuffle a new ninth" aria-label="Shuffle a new ninth" onClick={reroll}>
            <svg viewBox="0 0 20 20" aria-hidden><path d="M15.5 6.5A6 6 0 1 0 16 12M15.5 2.8v3.9h-3.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        <p className="start__foot"><kbd>ENTER</kbd> play ball · <kbd>B</kbd>/<kbd>S</kbd> call it · <kbd>SPACE</kbd> skip ahead · <kbd>ESC</kbd> pause</p>
      </div>
    </div>
    {leaderboardOpen && <Leaderboard onClose={() => setLeaderboardOpen(false)} />}
    </>
  )
}
