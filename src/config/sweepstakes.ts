export interface PrizeDefinition {
  key: string
  title: string
  icon: string
  description: string
  amount: number
}

export interface SweepstakesConfig {
  id: string
  name: string
  year: number
  dataDir: string
  passphrase: string
  prizes: PrizeDefinition[]
}

const NANNERY_PRIZES: PrizeDefinition[] = [
  { key: 'winner',           title: 'Winner',               icon: '🏆', description: 'Team wins the tournament',      amount: 100 },
  { key: 'runnerUp',         title: '2nd Place',             icon: '🥈', description: 'Team reaches the final',        amount: 50  },
  { key: 'mostGoalsScored',  title: 'Most Goals Scored',     icon: '⚽', description: 'Highest scoring team',          amount: 30  },
  { key: 'mostConceded',     title: 'Most Goals Conceded',   icon: '🫣', description: 'Leakiest defence',              amount: 20  },
  { key: 'mostYellows',      title: 'Most Yellow Cards',     icon: '🟨', description: 'Dirtiest team',                 amount: 20  },
  { key: 'firstRed',         title: 'First Red Card',        icon: '🟥', description: 'First team to see red',         amount: 10  },
  { key: 'firstEliminated',  title: 'First Eliminated',      icon: '👋', description: 'First team out',                amount: 10  },
]

const LMS_PRIZES: PrizeDefinition[] = [
  { key: 'winner',              title: 'Winner',              icon: '🏆', description: 'Team wins the tournament',                    amount: 0 },
  { key: 'runnerUp',            title: 'Runner-Up',           icon: '🥈', description: 'Team reaches the final',                      amount: 0 },
  { key: 'lmsMostGoalsScored',  title: 'Goals Scored',        icon: '⚽', description: 'Most goals scored across both teams',          amount: 0 },
  { key: 'lmsMostOwnGoals',     title: 'Own Goals',           icon: '🤦', description: 'Most own goals by both teams',                 amount: 0 },
  { key: 'lmsMostConceded',     title: 'Goals Conceded',      icon: '🫣', description: 'Most goals conceded across both teams',        amount: 0 },
  { key: 'lmsMostRedCards',     title: 'Red Cards',           icon: '🟥', description: 'Most red cards across both teams',             amount: 0 },
]

export const SWEEPSTAKES: Record<string, SweepstakesConfig> = {
  'nannery': {
    id: 'nannery',
    name: 'Nannery World Cup',
    year: 2026,
    dataDir: 'nannery',
    passphrase: 'nannery2026',
    prizes: NANNERY_PRIZES,
  },
  'last-man-standing': {
    id: 'last-man-standing',
    name: 'Last Man Standing',
    year: 2026,
    dataDir: 'lms',
    passphrase: 'lastmanstanding2026',
    prizes: LMS_PRIZES,
  },
}
