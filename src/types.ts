export interface Player {
  id: string
  name: string
}

export interface Team {
  id: string
  name: string
  group: string
  flag: string
}

export interface DrawResult {
  [teamId: string]: string // teamId -> playerId
}

export interface Standing {
  teamId: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
  yellowCards: number
  redCards: number
  eliminated: boolean
  eliminatedAt?: string | null
}

export interface CardTotals {
  yellow: number
  red: number
}

export interface FirstRedCard {
  teamId: string
  matchId: number
  date: string | null
  minute: number | null
  player: string | null
}

export interface Match {
  id: number
  stage: string // 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'F'
  group?: string
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null
  awayScore: number | null
  date: string
  venue: string
  status: 'SCHEDULED' | 'TIMED' | 'LIVE' | 'FINISHED'
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  /**
   * Penalty shootout result, present only when the match was decided on
   * penalties. These goals are deliberately excluded from homeScore/awayScore
   * so they never inflate goal totals — they are kept here for display only.
   */
  penalties?: { home: number; away: number } | null
}

export interface TeamStats {
  scored: number
  conceded: number
  ownGoals: number
}

export interface ScoresData {
  lastUpdated: string | null
  matches: Match[]
  standings: { [group: string]: Standing[] }
  /** Tournament-wide card totals per team (group stage + knockouts). */
  cards?: { [teamId: string]: CardTotals }
  firstRedCard?: FirstRedCard | null
  /** Tournament-wide goals scored/conceded/own-goals per team. */
  teamStats?: { [teamId: string]: TeamStats }
}
