import type { Difficulty } from '../game/constants'

export interface LeaderboardEntry {
  rank: number
  playerId: string
  name: string
  difficulty: Difficulty
  score: number
  accuracyPct: number
  weightedPct: number
  totalCalls: number
  playedAt: number
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[]
  updatedAt: number
}

export interface HeadToHeadEntry {
  rank: number
  playerId: string
  name: string
  wins: number
  losses: number
  draws: number
  seriesPlayed: number
  winPct: number
  pointsFor: number
  pointsAgainst: number
  lastPlayedAt: number
}

export interface HeadToHeadResult {
  entries: HeadToHeadEntry[]
  updatedAt: number
}

export interface LeaderboardSubmission {
  name: string
  difficulty: Difficulty
  score: number
  accuracyPct: number
  weightedPct: number
  totalCalls: number
  seed: string
}

export const leaderboardPlayerId = (): string => {
  const key = 'umpire-leaderboard-player-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export const savedLeaderboardName = (): string => {
  try { return localStorage.getItem('umpire-leaderboard-name') ?? '' } catch { return '' }
}

function origin(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_ORIGIN as string | undefined
  return configured || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8787' : '')
}

export async function fetchLeaderboard(difficulty: Difficulty): Promise<LeaderboardResult> {
  const base = origin()
  if (!base) throw new Error('Online leaderboard is not configured for this deployment.')
  const response = await fetch(`${base}/leaderboard?difficulty=${difficulty}`)
  if (!response.ok) throw new Error('Could not load the leaderboard.')
  return response.json() as Promise<LeaderboardResult>
}

export async function fetchHeadToHeadLeaderboard(): Promise<HeadToHeadResult> {
  const base = origin()
  if (!base) throw new Error('Online leaderboard is not configured for this deployment.')
  const response = await fetch(`${base}/leaderboard?mode=head-to-head`)
  if (!response.ok) throw new Error('Could not load head-to-head records.')
  return response.json() as Promise<HeadToHeadResult>
}

export async function submitLeaderboardResult(submission: LeaderboardSubmission): Promise<LeaderboardResult> {
  const base = origin()
  if (!base) throw new Error('Online leaderboard is not configured for this deployment.')
  localStorage.setItem('umpire-leaderboard-name', submission.name.trim())
  const response = await fetch(`${base}/leaderboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...submission, playerId: leaderboardPlayerId() }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not post this result.')
  }
  return response.json() as Promise<LeaderboardResult>
}
