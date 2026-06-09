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
}

export interface ScoresData {
  lastUpdated: string | null
  matches: Match[]
  standings: { [group: string]: Standing[] }
}
