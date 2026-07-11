import { audio } from '../audio/engine'
import { AWAY_TEAM, HOME_TEAM } from '../game/roster'
import { useGame } from '../store/game'
import { KZone, VerdictChip } from './ReplayCard'

export function EndScreen() {
  const phase = useGame((s) => s.phase)
  const report = useGame((s) => s.report)
  const sit = useGame((s) => s.sit)
  const seed = useGame((s) => s.seedText)
  const calls = useGame((s) => s.calls)
  if (phase !== 'inningOver' || !report) return null

  const resultLine = sit.walkOff
    ? `WALK-OFF · ${HOME_TEAM.name.toUpperCase()} WIN ${sit.homeScore}–${sit.awayScore}`
    : sit.homeScore === sit.awayScore
      ? `TIED ${sit.homeScore}–${sit.awayScore} · TO EXTRAS WE GO`
      : `${AWAY_TEAM.name.toUpperCase()} HOLD ON ${sit.awayScore}–${sit.homeScore}`

  const worst = report.blownHighLeverage
  const again = (sameSeed: boolean) => {
    audio.uiClick()
    useGame.getState().newGame(sameSeed ? seed : undefined)
    useGame.getState().playBall()
  }

  return (
    <div className="overlay end">
      <div className="end__inner">
        <header className="end__head">
          <span className="start__kicker">UMPIRE REPORT CARD</span>
          <div className="end__gradeRow">
            <div className={`grade grade--${report.grade[0]}`}>
              <span>{report.grade}</span>
            </div>
            <div className="end__headline">
              <h2>{report.title}</h2>
              <p className={sit.walkOff ? 'end__result end__result--gold' : 'end__result'}>{resultLine}</p>
            </div>
          </div>
        </header>

        <div className="end__stats">
          <div className="stat"><b>{report.totalCalls}</b><span>CALLS MADE</span></div>
          <div className="stat"><b>{report.totalCalls ? `${Math.round(report.accuracyPct)}%` : '—'}</b><span>ACCURACY</span></div>
          <div className="stat"><b>{report.totalCalls ? `${Math.round(report.weightedPct)}%` : '—'}</b><span>LEVERAGE-WEIGHTED</span></div>
          <div className="stat"><b>{report.borderlineCorrect}/{report.borderlineTotal}</b><span>CORNERS NAILED</span></div>
          <div className="stat"><b>{report.framingResisted}</b><span>FRAME JOBS RESISTED</span></div>
          <div className="stat"><b>{report.hesitations}</b><span>HESITATIONS</span></div>
        </div>

        {worst.length > 0 && (
          <div className="end__blown">
            <span className="end__blownTitle">CALLS THAT MATTERED MOST</span>
            <div className="end__blownList">
              {worst.map((c) => (
                <div key={c.pitchNo} className="blown">
                  <KZone record={c} compact />
                  <div className="blown__info">
                    <VerdictChip record={c} />
                    <span className="blown__line">
                      {c.countBefore} to {c.batterName} — called <b>{c.playerCall.toUpperCase()}</b>, was <b>{c.truthStrike ? 'STRIKE' : 'BALL'}</b>
                    </span>
                    <span className="blown__note">{c.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {worst.length === 0 && calls.length > 0 && (
          <p className="end__clean">No high-leverage misses. That's how you keep a clubhouse quiet.</p>
        )}

        <div className="start__row end__row">
          <button className="btn btn--gold btn--play" onClick={() => again(false)}>NEW NINTH</button>
          <button className="btn" onClick={() => again(true)}>RERUN SEED {seed}</button>
          <button
            className="btn"
            onClick={() => {
              audio.uiClick()
              useGame.getState().newGame()
            }}
          >
            TITLE SCREEN
          </button>
        </div>
      </div>
    </div>
  )
}
