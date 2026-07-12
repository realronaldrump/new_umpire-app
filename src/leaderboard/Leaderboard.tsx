import { useEffect, useState } from 'react'
import { DIFFICULTY, type Difficulty } from '../game/constants'
import { fetchLeaderboard, type LeaderboardEntry } from './api'

const DIFFICULTIES: Difficulty[] = ['rookie', 'pro', 'legend']

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('pro')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    setStatus('loading')
    fetchLeaderboard(difficulty).then((result) => {
      if (!active) return
      setEntries(result.entries)
      setStatus('ready')
    }).catch(() => active && setStatus('error'))
    return () => { active = false }
  }, [difficulty])

  return (
    <div className="overlay leaderboard-overlay" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
      <section className="leaderboard panel">
        <button className="mp-close" onClick={onClose} aria-label="Close leaderboard">×</button>
        <header className="leaderboard__head">
          <span className="start__kicker">ONLINE SOLO NINTH</span>
          <h2 id="leaderboard-title">THE SHOWCASE</h2>
          <p>Best report card from each umpire, ranked by grade score.</p>
        </header>
        <div className="leaderboard__tabs" role="tablist" aria-label="Difficulty">
          {DIFFICULTIES.map((key) => (
            <button key={key} role="tab" aria-selected={difficulty === key} className={difficulty === key ? 'on' : ''} onClick={() => setDifficulty(key)}>
              {DIFFICULTY[key].label}
            </button>
          ))}
        </div>
        <div className="leaderboard__table">
          <div className="leaderboard__row leaderboard__row--head"><span>RK</span><span>UMPIRE</span><span>SCORE</span><span>ACC</span><span>CALLS</span></div>
          {status === 'loading' && <p className="leaderboard__message">READING THE SCOREBOOK…</p>}
          {status === 'error' && <p className="leaderboard__message leaderboard__message--error">THE SCOREBOOK IS OFFLINE. TRY AGAIN SOON.</p>}
          {status === 'ready' && entries.length === 0 && <p className="leaderboard__message">NO QUALIFYING NINTHS YET. SET THE MARK.</p>}
          {status === 'ready' && entries.map((entry) => (
            <div className={`leaderboard__row ${entry.rank <= 3 ? `leaderboard__row--${entry.rank}` : ''}`} key={entry.playerId}>
              <b>{String(entry.rank).padStart(2, '0')}</b><strong>{entry.name}</strong><em>{entry.score.toFixed(1)}</em><span>{Math.round(entry.accuracyPct)}%</span><span>{entry.totalCalls}</span>
            </div>
          ))}
        </div>
        <p className="leaderboard__foot">One entry per browser on each difficulty · a better game replaces your previous best</p>
      </section>
    </div>
  )
}
