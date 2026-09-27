import { useEffect, useState } from 'react'
import { audio } from '../audio/engine'
import { BALL_RADIUS_FT, PLATE_HALF_WIDTH_FT } from '../game/constants'
import type { CallRecord } from '../game/report'
import { AWAY_TEAM, HOME_TEAM } from '../game/roster'
import { useGame } from '../store/game'
import { KZone, VerdictChip } from './ReplayCard'
import { savedLeaderboardName, submitLeaderboardResult } from '../leaderboard/api'
import { useSettings } from '../store/settings'

/** Replay: same seed restarts this exact ninth; otherwise a fresh one. */
export function playAgain(sameSeed: boolean): void {
  audio.uiClick()
  const seed = useGame.getState().seedText
  useGame.getState().newGame(sameSeed ? seed : undefined)
  useGame.getState().playBall()
}

/** Counts a number up from zero once, for the stat tiles. */
function CountUp({ value, suffix = '', delay = 0 }: { value: number; suffix?: string; delay?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now() + delay
    const tick = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - start) / 900))
      const e = 1 - Math.pow(1 - k, 3)
      setShown(value * e)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, delay])
  return <>{Math.round(shown)}{suffix}</>
}

/**
 * Every take of the ninth on one catcher's-eye zone, averaged to the
 * lineup's zone height: teal = right, ember = wrong, hollow = no call.
 */
function CallMap({ calls }: { calls: CallRecord[] }) {
  if (!calls.length) return null
  const top = calls.reduce((a, c) => a + c.zoneTopFt, 0) / calls.length
  const bot = calls.reduce((a, c) => a + c.zoneBotFt, 0) / calls.length
  const FX = (x: number) => 120 + x * 58
  const FY = (z: number) => 250 - z * 52
  const zx = PLATE_HALF_WIDTH_FT
  // Normalize each pitch to the average zone so different batters line up.
  const norm = (c: CallRecord) => {
    const k = (c.cross.z - c.zoneBotFt) / Math.max(0.1, c.zoneTopFt - c.zoneBotFt)
    return bot + k * (top - bot)
  }
  return (
    <svg viewBox="0 0 240 270" className="callmap" role="img" aria-label="Map of every called pitch">
      <rect x={FX(-zx)} y={FY(top)} width={FX(zx) - FX(-zx)} height={FY(bot) - FY(top)} className="callmap__zone" />
      {[1, 2].map((i) => (
        <g key={i} className="callmap__grid">
          <line x1={FX(-zx + ((2 * zx) / 3) * i)} y1={FY(top)} x2={FX(-zx + ((2 * zx) / 3) * i)} y2={FY(bot)} />
          <line x1={FX(-zx)} y1={FY(bot + ((top - bot) / 3) * i)} x2={FX(zx)} y2={FY(bot + ((top - bot) / 3) * i)} />
        </g>
      ))}
      <path d={`M ${FX(-zx)} 258 L ${FX(zx)} 258 L ${FX(zx * 0.62)} 264 L ${FX(0)} 268 L ${FX(-zx * 0.62)} 264 Z`} className="callmap__plate" />
      {calls.map((c, i) => (
        <circle
          key={c.pitchNo}
          cx={Math.min(232, Math.max(8, FX(c.cross.x)))}
          cy={Math.min(250, Math.max(8, FY(norm(c))))}
          r={BALL_RADIUS_FT * 58}
          className={`callmap__dot ${c.hesitated ? 'callmap__dot--hes' : c.correct ? 'callmap__dot--good' : 'callmap__dot--bad'}`}
          style={{ animationDelay: `${0.35 + i * 0.06}s` }}
        >
          <title>{`#${c.pitchNo} · ${c.countBefore} · called ${c.playerCall.toUpperCase()}, was ${c.truthStrike ? 'STRIKE' : 'BALL'}`}</title>
        </circle>
      ))}
    </svg>
  )
}

export function EndScreen() {
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const report = useGame((s) => s.report)
  const sit = useGame((s) => s.sit)
  const seed = useGame((s) => s.seedText)
  const calls = useGame((s) => s.calls)
  const difficulty = useSettings((s) => s.difficulty)
  const [name, setName] = useState(savedLeaderboardName)
  const [submitState, setSubmitState] = useState<'idle' | 'posting' | 'posted' | 'error'>('idle')
  if (mode === 'multiplayer' || phase !== 'inningOver' || !report) return null

  const resultLine = sit.walkOff
    ? `WALK-OFF · ${HOME_TEAM.name.toUpperCase()} WIN ${sit.homeScore}–${sit.awayScore}`
    : sit.homeScore === sit.awayScore
      ? `TIED ${sit.homeScore}–${sit.awayScore} · TO EXTRAS WE GO`
      : `${AWAY_TEAM.name.toUpperCase()} HOLD ON ${sit.awayScore}–${sit.homeScore}`

  const worst = report.blownHighLeverage
  const noCalls = report.totalCalls === 0
  const gradeKey = noCalls ? 'none' : report.grade[0]
  const postScore = async () => {
    if (!name.trim() || report.totalCalls < 1 || submitState === 'posting' || submitState === 'posted') return
    setSubmitState('posting')
    try {
      await submitLeaderboardResult({
        name: name.trim(), difficulty, score: report.gradeScore, accuracyPct: report.accuracyPct,
        weightedPct: report.weightedPct, totalCalls: report.totalCalls, seed,
      })
      setSubmitState('posted')
    } catch { setSubmitState('error') }
  }

  return (
    <div className="overlay end">
      <div className="end__inner">
        <header className="end__head">
          <span className="kicker">UMPIRE REPORT CARD</span>
          <p className={sit.walkOff ? 'end__result end__result--gold' : 'end__result'}>{resultLine}</p>
          <div className="end__gradeRow">
            <div className={`grade grade--${gradeKey}`} aria-label={noCalls ? 'No grade' : `Grade ${report.grade}`}>
              <span>{noCalls ? 'N/A' : report.grade}</span>
            </div>
            <div className="end__headline">
              <h2>{report.title}</h2>
              {!noCalls && (
                <div className="end__meter" aria-hidden>
                  <i style={{ width: `${Math.round(report.weightedPct)}%` }} />
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="end__body">
          <div className="end__stats">
            <div className="stat"><b><CountUp value={report.totalCalls} /></b><span>CALLS MADE</span></div>
            <div className="stat"><b>{noCalls ? '—' : <CountUp value={report.accuracyPct} suffix="%" delay={80} />}</b><span>ACCURACY</span></div>
            <div className="stat"><b>{noCalls ? '—' : <CountUp value={report.weightedPct} suffix="%" delay={160} />}</b><span>LEVERAGE-WEIGHTED</span></div>
            <div className="stat"><b>{report.borderlineCorrect}/{report.borderlineTotal}</b><span>CORNERS NAILED</span></div>
            <div className="stat"><b><CountUp value={report.framingResisted} delay={240} /></b><span>FRAME JOBS RESISTED</span></div>
            <div className="stat"><b><CountUp value={report.hesitations} delay={320} /></b><span>HESITATIONS</span></div>
            {calls.some((c) => c.challenged) && (
              <div className="stat"><b>{report.overturned}</b><span>ABS OVERTURNS</span></div>
            )}
          </div>
          {calls.length > 0 && (
            <div className="end__map panel">
              <span className="end__blownTitle">YOUR ZONE</span>
              <CallMap calls={calls} />
              <div className="end__legend">
                <span><i className="lg lg--good" />RIGHT</span>
                <span><i className="lg lg--bad" />MISSED</span>
                {calls.some((c) => c.hesitated) && <span><i className="lg lg--hes" />NO CALL</span>}
              </div>
            </div>
          )}
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
        {noCalls && (
          <p className="end__clean end__clean--muted">Every pitch was swung at — the ninth played itself. Run it back for another look.</p>
        )}

        <section className="end__online panel">
          <div><span>ONLINE SOLO LEADERBOARD</span><b>{report.gradeScore.toFixed(1)} QUALIFYING SCORE</b></div>
          <label><span>UMPIRE NAME</span><input value={name} maxLength={20} placeholder="Your name" onChange={(event) => { setName(event.target.value); setSubmitState('idle') }} /></label>
          <button className="btn btn--gold" disabled={!name.trim() || report.totalCalls < 1 || submitState === 'posting' || submitState === 'posted'} onClick={postScore}>
            {submitState === 'posting' ? 'POSTING…' : submitState === 'posted' ? 'IN THE BOOK' : 'POST SCORE'}
          </button>
          {submitState === 'error' && <small>Could not reach the online scorebook.</small>}
          {report.totalCalls < 1 && <small>A game needs at least one called pitch to qualify.</small>}
        </section>

        <div className="end__row">
          <button className="btn btn--gold btn--play" onClick={() => playAgain(false)}>NEW NINTH</button>
          <button className="btn" onClick={() => playAgain(true)}>RERUN SEED {seed}</button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              audio.uiClick()
              useGame.getState().newGame()
            }}
          >
            TITLE SCREEN
          </button>
        </div>
        <p className="start__foot"><kbd>ENTER</kbd> new ninth</p>
      </div>
    </div>
  )
}
