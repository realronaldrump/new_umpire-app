import { useEffect, useMemo, useState } from 'react'
import { DIFFICULTY, type Difficulty } from '../game/constants'
import { PITCH_TYPES } from '../game/pitchTypes'
import { useMultiplayer, multiplayerRole } from './store'
import type { RoomSnapshot, RoundSummary } from './protocol'

const DIFFICULTIES: Difficulty[] = ['rookie', 'pro', 'legend']

export function MultiplayerSurface() {
  const open = useMultiplayer((state) => state.open)
  const connection = useMultiplayer((state) => state.connection)
  const snapshot = useMultiplayer((state) => state.snapshot)
  const error = useMultiplayer((state) => state.error)
  if (!open) return null

  if (!snapshot || snapshot.status === 'lobby') {
    return <LobbyScreen snapshot={snapshot} connection={connection} error={error} />
  }
  if (snapshot.status === 'betweenRounds') return <RoleSwapScreen snapshot={snapshot} />
  if (snapshot.status === 'seriesComplete') return <SeriesScreen snapshot={snapshot} />
  if (snapshot.status === 'abandoned') return <AbandonedScreen />

  return (
    <>
      <MultiplayerHud snapshot={snapshot} />
      <PitcherControls snapshot={snapshot} />
      {snapshot.status === 'disconnectPaused' && <ReconnectScreen snapshot={snapshot} />}
    </>
  )
}

function LobbyScreen({
  snapshot, connection, error,
}: {
  snapshot: RoomSnapshot | null
  connection: ReturnType<typeof useMultiplayer.getState>['connection']
  error: string | null
}) {
  const storedName = useMultiplayer((state) => state.name)
  const prefilledCode = useMultiplayer((state) => state.roomCode)
  const playerId = useMultiplayer((state) => state.playerId)
  const [name, setName] = useState(storedName)
  const [code, setCode] = useState(prefilledCode)
  const [difficulty, setDifficulty] = useState<Difficulty>('pro')
  const [copied, setCopied] = useState(false)
  const createRoom = useMultiplayer((state) => state.createRoom)
  const joinRoom = useMultiplayer((state) => state.joinRoom)
  const configure = useMultiplayer((state) => state.configure)
  const ready = useMultiplayer((state) => state.ready)
  const leave = useMultiplayer((state) => state.leave)

  useEffect(() => setCode(prefilledCode), [prefilledCode])

  if (!snapshot) {
    return (
      <div className="overlay mp-overlay">
        <div className="mp-entry panel">
          <button className="mp-close" onClick={leave} aria-label="Close multiplayer">×</button>
          <header className="mp-entry__head">
            <span className="start__kicker">LIVE CLUBHOUSE LINK</span>
            <h2>PITCHER <em>VS.</em> BLUE</h2>
            <p>Two players. Two mirrored ninths. Then the roles swap.</p>
          </header>

          <label className="mp-field">
            <span>YOUR NAME</span>
            <input value={name} maxLength={20} autoComplete="nickname" placeholder="Player name" onChange={(event) => setName(event.target.value)} />
          </label>

          {error && <div className="mp-error" role="alert">{error}</div>}

          <div className="mp-entry__choices">
            <section className="mp-choice">
              <span className="mp-choice__number">01</span>
              <h3>CREATE A SERIES</h3>
              <p>Open a room, pick the difficulty, and send the invite link.</p>
              <div className="mp-difficulty" role="radiogroup" aria-label="Series difficulty">
                {DIFFICULTIES.map((key) => (
                  <button key={key} className={difficulty === key ? 'on' : ''} onClick={() => setDifficulty(key)}>
                    {DIFFICULTY[key].label}
                  </button>
                ))}
              </div>
              <button className="btn btn--gold" disabled={!name.trim() || connection === 'connecting'} onClick={() => createRoom(name, difficulty)}>
                {connection === 'connecting' && !prefilledCode ? 'OPENING…' : 'CREATE ROOM'}
              </button>
            </section>

            <div className="mp-entry__or">OR</div>

            <section className="mp-choice">
              <span className="mp-choice__number">02</span>
              <h3>JOIN THE OTHER DEVICE</h3>
              <p>Paste the six-character code from your friend’s screen.</p>
              <label className="mp-field mp-field--code">
                <span>ROOM CODE</span>
                <input value={code} maxLength={6} placeholder="ABC234" onChange={(event) => setCode(event.target.value.toUpperCase())} />
              </label>
              <button className="btn" disabled={!name.trim() || code.trim().length !== 6 || connection === 'connecting'} onClick={() => joinRoom(code, name)}>
                {connection === 'connecting' ? 'CONNECTING…' : 'JOIN ROOM'}
              </button>
            </section>
          </div>
          <p className="mp-entry__foot">No login · works across different networks · invite claims the first open seat</p>
        </div>
      </div>
    )
  }

  const me = snapshot.players.find((player) => player?.id === playerId)
  const isHost = snapshot.hostId === playerId
  const invite = `${location.origin}${location.pathname}?mode=multiplayer&room=${snapshot.roomCode}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard may be unavailable on local HTTP */ }
  }

  return (
    <div className="overlay mp-overlay">
      <div className="mp-lobby">
        <header className="mp-lobby__head">
          <span className="start__kicker">PRIVATE TWO-PLAYER ROOM</span>
          <h2>CLUBHOUSE <em>{snapshot.roomCode}</em></h2>
          <button className="mp-copy" onClick={copy}>{copied ? 'LINK COPIED' : 'COPY INVITE LINK'}</button>
        </header>

        <div className="mp-dugouts">
          {snapshot.players.map((player, index) => (
            <article key={player?.id ?? index} className={`mp-seat panel ${player?.connected ? 'mp-seat--online' : ''}`}>
              <span className="mp-seat__label">{index === 0 ? 'HOME DEVICE' : 'AWAY DEVICE'}</span>
              <strong>{player?.name ?? 'WAITING FOR PLAYER…'}</strong>
              <span className="mp-seat__status">{player ? (player.connected ? '● CONNECTED' : '○ OFFLINE') : 'SEND THE INVITE'}</span>
              {player?.ready && <span className="mp-ready-stamp">READY</span>}
            </article>
          ))}
        </div>

        <section className="mp-lobby__rules panel">
          <div><b>MIRRORED NINTHS</b><span>Same score, runners, lineup, and closer.</span></div>
          <div><b>COIN-FLIP ROLES</b><span>One pitches. One calls. Then you swap.</span></div>
          <div><b>BALANCED SERIES</b><span>Pitching and umpiring count equally.</span></div>
        </section>

        <div className="mp-lobby__difficulty">
          <span>SHARED DIFFICULTY</span>
          <div className="mp-difficulty">
            {DIFFICULTIES.map((key) => (
              <button
                key={key}
                disabled={!isHost || Boolean(me?.ready)}
                className={snapshot.difficulty === key ? 'on' : ''}
                onClick={() => configure(key)}
              >
                {DIFFICULTY[key].label}
              </button>
            ))}
          </div>
          {!isHost && <small>Room host controls this setting.</small>}
        </div>

        {error && <div className="mp-error" role="alert">{error}</div>}
        <div className="mp-lobby__actions">
          <button className="btn" onClick={leave}>LEAVE ROOM</button>
          <button className="btn btn--gold btn--play" disabled={!snapshot.players.every(Boolean) || Boolean(me?.ready)} onClick={ready}>
            {me?.ready ? 'WAITING FOR OPPONENT' : 'READY UP'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MultiplayerHud({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const latency = useMultiplayer((state) => state.latencyMs)
  const connection = useMultiplayer((state) => state.connection)
  const role = multiplayerRole(snapshot, playerId)
  const opponent = snapshot.players.find((player) => player && player.id !== playerId)
  return (
    <aside className={`mp-rolehud panel mp-rolehud--${role ?? 'waiting'}`}>
      <span className="mp-rolehud__round">ROUND {snapshot.round} / 2</span>
      <strong>{role === 'pitcher' ? 'ON THE MOUND' : role === 'umpire' ? 'BEHIND THE PLATE' : 'WAITING'}</strong>
      <span>{opponent?.name ?? 'Opponent'} · {connection === 'connected' ? 'LIVE' : connection.toUpperCase()} {latency === null ? '' : `· ${latency}ms`}</span>
    </aside>
  )
}

function PitcherControls({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const offset = useMultiplayer((state) => state.serverOffsetMs)
  const choosePitch = useMultiplayer((state) => state.choosePitch)
  const release = useMultiplayer((state) => state.release)
  const role = multiplayerRole(snapshot, playerId)
  const [pitch, setPitch] = useState(snapshot.pitcher.arsenal[0][0])
  const [target, setTarget] = useState(12)
  const [needle, setNeedle] = useState(0)

  useEffect(() => {
    if (snapshot.phase !== 'command' || snapshot.phaseDeadline === null) return
    let frame = 0
    const update = () => {
      const fraction = (Date.now() + offset - snapshot.phaseStartedAt) / Math.max(1, snapshot.phaseDeadline! - snapshot.phaseStartedAt)
      setNeedle(Math.max(0, Math.min(1, fraction)))
      if (fraction < 1) frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [offset, snapshot.phase, snapshot.phaseDeadline, snapshot.phaseStartedAt])

  useEffect(() => {
    if (snapshot.phase === 'pitchSelect') {
      setPitch(snapshot.pitcher.arsenal[0][0])
      setTarget(12)
      setNeedle(0)
    }
  }, [snapshot.phase, snapshot.sit.totalPitches, snapshot.pitcher.arsenal])

  if (role !== 'pitcher' || (snapshot.phase !== 'pitchSelect' && snapshot.phase !== 'command')) return null
  const quality = Math.max(0, 1 - Math.abs(needle - 0.5) / 0.5)

  return (
    <section className={`pitch-console panel ${snapshot.phase === 'command' ? 'pitch-console--command' : ''}`}>
      {snapshot.phase === 'pitchSelect' ? (
        <>
          <div className="pitch-console__head">
            <span>CALL YOUR PITCH</span>
            <b>{Math.max(0, Math.ceil(((snapshot.phaseDeadline ?? 0) - (Date.now() + offset)) / 1000))}</b>
          </div>
          <div className="pitch-console__body">
            <div className="pitch-arsenal">
              {snapshot.pitcher.arsenal.map(([key]) => (
                <button key={key} className={pitch === key ? 'on' : ''} onClick={() => setPitch(key)}>
                  <b>{PITCH_TYPES[key].short}</b><span>{PITCH_TYPES[key].name}</span>
                </button>
              ))}
            </div>
            <div className="pitch-target" aria-label="Pitch target grid">
              {Array.from({ length: 25 }, (_, index) => {
                const row = Math.floor(index / 5)
                const col = index % 5
                const zone = row >= 1 && row <= 3 && col >= 1 && col <= 3
                return <button key={index} aria-label={`Target cell ${index + 1}`} className={`${zone ? 'zone' : 'chase'} ${target === index ? 'on' : ''}`} onClick={() => setTarget(index)} />
              })}
              <span className="pitch-target__zone" aria-hidden />
            </div>
          </div>
          <button className="btn btn--gold pitch-console__set" onClick={() => choosePitch(pitch, target)}>SET · START DELIVERY</button>
        </>
      ) : (
        <div className="command-meter">
          <span className="command-meter__kicker">HIT THE GOLD AT RELEASE</span>
          <div className="command-meter__track">
            <span className="command-meter__sweet" />
            <span className="command-meter__needle" style={{ left: `${needle * 100}%` }} />
          </div>
          <div className="command-meter__quality">COMMAND {Math.round(quality * 100)}%</div>
          <button className="btn btn--gold" onClick={() => release(quality)}>DELIVER</button>
        </div>
      )}
    </section>
  )
}

function RoleSwapScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const ready = useMultiplayer((state) => state.ready)
  const me = snapshot.players.find((player) => player?.id === playerId)
  const summary = snapshot.roundSummaries[0]
  const nextRole = snapshot.firstPitcherId === playerId ? 'UMPIRE' : 'PITCHER'
  return (
    <div className="overlay mp-overlay mp-results">
      <div className="mp-results__inner">
        <span className="start__kicker">ROUND ONE IN THE BOOKS</span>
        <h2>SWITCH <em>SIDES</em></h2>
        <p className="mp-results__next">YOU’RE THE <b>{nextRole}</b> NEXT</p>
        {summary && <RoundScore summary={summary} snapshot={snapshot} />}
        <div className="mp-results__players">
          {snapshot.players.map((player) => <span key={player?.id}>{player?.name ?? '—'} {player?.ready ? '✓ READY' : '· REVIEWING'}</span>)}
        </div>
        <button className="btn btn--gold btn--play" disabled={Boolean(me?.ready)} onClick={ready}>
          {me?.ready ? 'WAITING FOR OPPONENT' : 'READY FOR ROUND TWO'}
        </button>
      </div>
    </div>
  )
}

function RoundScore({ summary, snapshot }: { summary: RoundSummary; snapshot: RoomSnapshot }) {
  const pitcher = snapshot.players.find((player) => player?.id === summary.pitcherId)?.name ?? 'Pitcher'
  const umpire = snapshot.players.find((player) => player?.id === summary.umpireId)?.name ?? 'Umpire'
  return (
    <div className="mp-roundscore">
      <article className="panel"><span>{pitcher.toUpperCase()} · PITCHING</span><b>{summary.pitching.score.toFixed(1)}</b><small>{summary.pitching.runsAllowed} R · {summary.pitching.outsRecorded}/{summary.pitching.outsRequired} OUTS · {Math.round(summary.pitching.averageCommand * 100)}% CMD</small></article>
      <article className="panel"><span>{umpire.toUpperCase()} · UMPIRING</span><b>{summary.umpiring.grade}</b><small>{Math.round(summary.umpiring.weightedPct)}% WEIGHTED · {summary.umpiring.correctCalls}/{summary.umpiring.totalCalls} CORRECT</small></article>
    </div>
  )
}

function SeriesScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const leave = useMultiplayer((state) => state.leave)
  const result = snapshot.seriesResult
  const scores = useMemo(() => [...(result?.scores ?? [])].sort((a, b) => b.overallScore - a.overallScore), [result])
  const nameOf = (id: string) => snapshot.players.find((player) => player?.id === id)?.name ?? 'Player'
  const champion = result?.overallChampionIds.includes(playerId ?? '')
  const newSeries = () => {
    leave()
    useMultiplayer.getState().openEntry()
  }
  return (
    <div className="overlay mp-overlay mp-results mp-series">
      <div className="mp-results__inner">
        <span className="start__kicker">FINAL SERIES REPORT</span>
        <h2>{champion ? 'YOU WIN' : 'SERIES COMPLETE'}</h2>
        <div className="mp-podium">
          {scores.map((score, index) => (
            <article key={score.playerId} className={`panel ${index === 0 ? 'mp-podium__winner' : ''}`}>
              <span>{index === 0 ? 'SERIES CHAMPION' : 'RUNNER-UP'}</span>
              <h3>{nameOf(score.playerId)}</h3>
              <b>{score.overallScore.toFixed(1)}</b>
              <div><small>PITCHING</small><strong>{score.pitchScore.toFixed(1)}</strong></div>
              <div><small>UMPIRING</small><strong>{score.umpScore.toFixed(1)}</strong></div>
            </article>
          ))}
        </div>
        {result && (
          <div className="mp-awards">
            <span>⚾ BEST PITCHER · {result.pitchingChampionIds.map(nameOf).join(' & ')}</span>
            <span>◇ BEST UMPIRE · {result.umpiringChampionIds.map(nameOf).join(' & ')}</span>
          </div>
        )}
        <div className="mp-results__actions">
          <button className="btn" onClick={leave}>TITLE SCREEN</button>
          <button className="btn btn--gold" onClick={newSeries}>NEW SERIES</button>
        </div>
      </div>
    </div>
  )
}

function ReconnectScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const connection = useMultiplayer((state) => state.connection)
  const resumeReady = useMultiplayer((state) => state.resumeReady)
  const me = snapshot.players.find((player) => player?.id === playerId)
  const missing = snapshot.players.find((player) => player && !player.connected)
  return (
    <div className="veil mp-reconnect">
      <div className="veil__box panel">
        <span className="veil__title">GAME PAUSED</span>
        <p>{missing ? `Waiting for ${missing.name} to reconnect.` : 'Both devices are back. Ready when you are.'}</p>
        <button className="btn btn--gold" disabled={connection !== 'connected' || Boolean(me?.ready) || Boolean(missing)} onClick={resumeReady}>
          {me?.ready ? 'WAITING FOR OPPONENT' : 'READY TO RESUME'}
        </button>
      </div>
    </div>
  )
}

function AbandonedScreen() {
  const leave = useMultiplayer((state) => state.leave)
  return (
    <div className="overlay mp-overlay mp-results">
      <div className="mp-results__inner">
        <span className="start__kicker">CONNECTION WINDOW EXPIRED</span>
        <h2>SERIES <em>ABANDONED</em></h2>
        <p>The other device did not reconnect within 90 seconds.</p>
        <button className="btn btn--gold" onClick={leave}>RETURN TO TITLE</button>
      </div>
    </div>
  )
}
