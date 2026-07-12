import { useState } from 'react'
import { audio } from '../audio/engine'
import { DIFFICULTY, type Difficulty } from '../game/constants'
import { AWAY_TEAM, HOME_TEAM, teamFullName } from '../game/roster'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { useMultiplayer } from '../multiplayer/store'

const DIFF_KEYS: Difficulty[] = ['rookie', 'pro', 'legend']

export function StartScreen() {
  const phase = useGame((s) => s.phase)
  const seedText = useGame((s) => s.seedText)
  const intro = useGame((s) => s.intro)
  const difficulty = useSettings((s) => s.difficulty)
  const setSettings = useSettings((s) => s.set)
  const [seedInput, setSeedInput] = useState('')

  if (phase !== 'menu') return null

  const reroll = () => {
    audio.uiClick()
    setSeedInput('')
    useGame.getState().newGame()
  }

  const play = () => {
    const typed = seedInput.trim().toUpperCase()
    if (typed && typed !== seedText) useGame.getState().newGame(typed)
    useGame.getState().playBall()
  }

  return (
    <div className="overlay start">
      <div className="start__inner">
        <header className="start__masthead">
          <span className="start__kicker">A HOME-PLATE UMPIRE SIMULATOR</span>
          <h1 className="start__title">
            <span>BIG BEAUTIFUL</span>
            <em>UMPIRE APP</em>
          </h1>
          <span className="start__rule" aria-hidden />
          <p className="start__tag">BOTTOM OF THE NINTH · EVERY TAKE IS YOURS TO CALL</p>
        </header>

        <p className="start__matchup">
          <b style={{ color: AWAY_TEAM.accent }}>{teamFullName(AWAY_TEAM).toUpperCase()}</b>
          <span> at </span>
          <b style={{ color: HOME_TEAM.accent }}>{teamFullName(HOME_TEAM).toUpperCase()}</b>
          <span className="start__intro"> — {intro}</span>
        </p>

        <div className="start__howto">
          <div className="howto">
            <svg viewBox="0 0 24 24" className="howto__icon" aria-hidden>
              <path d="M12 5C6.5 5 2.6 9.6 1.5 12c1.1 2.4 5 7 10.5 7s9.4-4.6 10.5-7C21.4 9.6 17.5 5 12 5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="3.2" fill="currentColor" />
            </svg>
            <b>TRACK THE PITCH</b>
            <span>95 mph looks fast because it is. Watch it all the way into the mitt.</span>
          </div>
          <div className="howto">
            <svg viewBox="0 0 24 24" className="howto__icon" aria-hidden>
              <circle cx="8" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 7.6L20.4 12L16 16.4L11.6 12Z" fill="currentColor" />
            </svg>
            <b>CALL THE TAKES</b>
            <span>No swing? That's your pitch. BALL (B / ◀) or STRIKE (S / ▶) before the ring runs out.</span>
          </div>
          <div className="howto">
            <svg viewBox="0 0 24 24" className="howto__icon" aria-hidden>
              <path d="M4 20L14 4l-2 7h8L10 20l2-7H4Z" fill="currentColor" />
            </svg>
            <b>SWINGS PLAY ON</b>
            <span>Whiffs, fouls and balls in play resolve themselves. Your blown calls change the game.</span>
          </div>
        </div>

        <div className="start__diff" role="radiogroup" aria-label="difficulty">
          {DIFF_KEYS.map((key) => {
            const d = DIFFICULTY[key]
            return (
              <button
                key={key}
                role="radio"
                aria-checked={difficulty === key}
                className={`diffcard ${difficulty === key ? 'diffcard--on' : ''}`}
                onClick={() => {
                  audio.uiClick()
                  setSettings({ difficulty: key })
                }}
              >
                <span className="diffcard__name">{d.label.toUpperCase()}</span>
                <span className="diffcard__tag">{d.tagline}</span>
              </button>
            )
          })}
        </div>

        <div className="start__row">
          <label className="seedbox">
            <span>SEED</span>
            <input
              value={seedInput}
              placeholder={seedText}
              maxLength={12}
              onChange={(e) => setSeedInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') play()
                e.stopPropagation()
              }}
            />
            <button className="icon-btn" title="New random ninth" onClick={reroll}>⟳</button>
          </label>

          <button className="btn btn--gold btn--play" onClick={play}>
            SOLO NINTH
          </button>

          <button className="btn btn--practice" onClick={() => useGame.getState().startPractice()}>
            PRACTICE PITCHES
          </button>

          <button className="btn btn--versus" onClick={() => useMultiplayer.getState().openEntry()}>
            2-PLAYER SERIES
          </button>

          <button
            className="btn"
            onClick={() => {
              audio.uiClick()
              useUi.getState().set({ settingsOpen: true })
            }}
          >
            SETTINGS
          </button>
        </div>

        <p className="start__foot">
          SPACE hurries the pace · ESC pauses · F fullscreen · same seed, same ninth
        </p>
      </div>
    </div>
  )
}
