import { useEffect, useState } from 'react'
import { DIFFICULTY, type Difficulty } from '../game/constants'
import { fetchHeadToHeadLeaderboard, fetchLeaderboard, type HeadToHeadEntry, type LeaderboardEntry } from './api'

const DIFFICULTIES: Difficulty[] = ['rookie', 'pro', 'legend']

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'solo' | 'head-to-head'>('solo')
  const [difficulty, setDifficulty] = useState<Difficulty>('pro')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [headToHead, setHeadToHead] = useState<HeadToHeadEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    setStatus('loading')
    const request = mode === 'solo' ? fetchLeaderboard(difficulty) : fetchHeadToHeadLeaderboard()
    request.then((result) => {
      if (!active) return
      if (mode === 'solo') setEntries(result.entries as LeaderboardEntry[])
      else setHeadToHead(result.entries as HeadToHeadEntry[])
      setStatus('ready')
    }).catch(() => active && setStatus('error'))
    return () => { active = false }
  }, [difficulty, mode])

  return (
    <div className="overlay leaderboard-overlay" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
      <section className="leaderboard panel">
        <button className="mp-close" onClick={onClose} aria-label="Close leaderboard">×</button>
        <header className="leaderboard__head">
          <span className="start__kicker">ONLINE RECORD BOOK</span>
          <h2 id="leaderboard-title">THE SHOWCASE</h2>
          <p>{mode === 'solo' ? 'Best report card from each umpire, ranked by grade score.' : 'Completed two-player series, ranked by wins and win percentage.'}</p>
        </header>
        <div className="leaderboard__modes" role="tablist" aria-label="Leaderboard type">
          <button role="tab" aria-selected={mode === 'solo'} className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>SOLO NINTH</button>
          <button role="tab" aria-selected={mode === 'head-to-head'} className={mode === 'head-to-head' ? 'on' : ''} onClick={() => setMode('head-to-head')}>HEAD TO HEAD</button>
        </div>
        {mode === 'solo' && <div className="leaderboard__tabs" role="tablist" aria-label="Difficulty">
          {DIFFICULTIES.map((key) => (
            <button key={key} role="tab" aria-selected={difficulty === key} className={difficulty === key ? 'on' : ''} onClick={() => setDifficulty(key)}>
              {DIFFICULTY[key].label}
            </button>
          ))}
        </div>}
        <div className="leaderboard__table">
          <div className={`leaderboard__row leaderboard__row--head ${mode === 'head-to-head' ? 'leaderboard__row--h2h' : ''}`}>
            {mode === 'solo' ? <><span>RK</span><span>UMPIRE</span><span>SCORE</span><span>ACC</span><span>CALLS</span></> : <><span>RK</span><span>PLAYER</span><span>RECORD</span><span>WIN%</span><span>DIFF</span></>}
          </div>
          {status === 'loading' && <p className="leaderboard__message">READING THE SCOREBOOK…</p>}
          {status === 'error' && <p className="leaderboard__message leaderboard__message--error">THE SCOREBOOK IS OFFLINE. TRY AGAIN SOON.</p>}
          {status === 'ready' && (mode === 'solo' ? entries.length === 0 : headToHead.length === 0) && <p className="leaderboard__message">NO QUALIFYING RESULTS YET. SET THE MARK.</p>}
          {status === 'ready' && mode === 'solo' && entries.map((entry) => (
            <div className={`leaderboard__row ${entry.rank <= 3 ? `leaderboard__row--${entry.rank}` : ''}`} key={entry.playerId}>
              <b>{String(entry.rank).padStart(2, '0')}</b><strong>{entry.name}</strong><em>{entry.score.toFixed(1)}</em><span>{Math.round(entry.accuracyPct)}%</span><span>{entry.totalCalls}</span>
            </div>
          ))}
          {status === 'ready' && mode === 'head-to-head' && headToHead.map((entry) => (
            <div className={`leaderboard__row leaderboard__row--h2h ${entry.rank <= 3 ? `leaderboard__row--${entry.rank}` : ''}`} key={entry.playerId}>
              <b>{String(entry.rank).padStart(2, '0')}</b><strong>{entry.name}</strong><em>{entry.wins}–{entry.losses}{entry.draws ? `–${entry.draws}` : ''}</em><span>{Math.round(entry.winPct)}%</span><span className={entry.pointsFor - entry.pointsAgainst >= 0 ? 'positive' : 'negative'}>{entry.pointsFor - entry.pointsAgainst >= 0 ? '+' : ''}{(entry.pointsFor - entry.pointsAgainst).toFixed(1)}</span>
            </div>
          ))}
        </div>
        <p className="leaderboard__foot">{mode === 'solo' ? 'One entry per browser on each difficulty · a better game replaces your previous best' : 'Records update automatically when a two-player series is completed · DIFF is cumulative score differential'}</p>
      </section>
    </div>
  )
}
