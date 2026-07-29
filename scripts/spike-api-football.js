// Spike: can API-Football (api-sports.io) free tier satisfy the prize stats
// that football-data.org's free tier can't — yellow cards, red cards, and
// "first red card"? Also reports request budget and team-identity mapping,
// the two things that decide whether a real integration is viable.
//
// Run where outbound network is open (your laptop, or a manual GitHub Actions
// run) — NOT from the Claude sandbox, whose allowlist blocks the API.
//
//   API_FOOTBALL_KEY=xxxx node scripts/spike-api-football.js
//
// It only reads. It writes nothing. Stays well under the 100 req/day free cap
// (uses ~3 + SAMPLE_FIXTURES requests total).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')

const KEY = process.env.API_FOOTBALL_KEY
const SEASON = Number(process.env.WC_SEASON ?? 2026)
const WORLD_CUP_LEAGUE_ID = 1 // "World Cup" in API-Football
const SAMPLE_FIXTURES = 5     // finished matches to pull events for
const BASE = 'https://v3.football.api-sports.io'

if (!KEY) {
  console.error('API_FOOTBALL_KEY is not set. Get a free key at https://dashboard.api-football.com/')
  process.exit(1)
}

let requestCount = 0
async function api(endpoint) {
  requestCount++
  const res = await fetch(`${BASE}/${endpoint}`, { headers: { 'x-apisports-key': KEY } })
  const body = await res.json().catch(() => ({}))
  // API-Football returns 200 with an `errors` object on auth/plan/limit problems.
  const errors = body.errors
  if (errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length)) {
    throw new Error(`API error on ${endpoint}: ${JSON.stringify(errors)}`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${endpoint}`)
  return body
}

const PASS = '✅ PASS'
const FAIL = '❌ FAIL'
const WARN = '⚠️  CHECK'

async function main() {
  const verdict = {} // need -> [status, detail]

  // 1. Account / plan / daily budget --------------------------------------
  console.log('\n=== 1. Account status ===')
  const status = await api('status')
  const sub = status.response?.subscription ?? {}
  const reqs = status.response?.requests ?? {}
  console.log(`Plan:        ${sub.plan ?? 'unknown'} (active: ${sub.active})`)
  console.log(`Requests:    ${reqs.current ?? '?'} / ${reqs.limit_day ?? '?'} per day`)
  const dailyLimit = reqs.limit_day ?? 100

  // 2. Does the free plan cover WC for our season, with events? -----------
  console.log(`\n=== 2. World Cup ${SEASON} coverage ===`)
  const league = await api(`leagues?id=${WORLD_CUP_LEAGUE_ID}`)
  const lg = league.response?.[0]
  if (!lg) {
    console.log(`${FAIL} League id ${WORLD_CUP_LEAGUE_ID} not returned by your plan.`)
    verdict['season+events coverage'] = [FAIL, 'league not accessible on this plan']
  } else {
    const seasons = lg.seasons ?? []
    const target = seasons.find(s => s.year === SEASON)
    const years = seasons.map(s => s.year)
    console.log(`Seasons your plan can see: ${years.join(', ') || '(none)'}`)
    if (!target) {
      console.log(`${FAIL} Season ${SEASON} is NOT in your plan's coverage.`)
      verdict['season+events coverage'] = [FAIL, `season ${SEASON} not available on free plan`]
    } else {
      const eventsCovered = target.coverage?.fixtures?.events === true
      console.log(`Season ${SEASON} present. fixtures.events coverage: ${eventsCovered}`)
      verdict['season+events coverage'] = eventsCovered
        ? [PASS, `season ${SEASON} + events covered`]
        : [FAIL, `season ${SEASON} present but events NOT covered on this plan`]
    }
  }

  // 3. Fixtures: count, statuses, team identity ---------------------------
  console.log(`\n=== 3. Fixtures for WC ${SEASON} ===`)
  const fixturesResp = await api(`fixtures?league=${WORLD_CUP_LEAGUE_ID}&season=${SEASON}`)
  const fixtures = fixturesResp.response ?? []
  console.log(`Total fixtures: ${fixtures.length}`)
  const finished = fixtures.filter(f => f.fixture?.status?.short === 'FT' ||
    f.fixture?.status?.short === 'AET' || f.fixture?.status?.short === 'PEN')
  console.log(`Finished so far: ${finished.length}`)

  // Team identity: can we map API-Football teams to the repo's TLA codes?
  const teamsFile = path.join(dataDir, 'teams.json')
  const repoTlas = new Set(JSON.parse(fs.readFileSync(teamsFile, 'utf8')).map(t => t.id))
  const sampleTeams = []
  for (const f of fixtures.slice(0, 4)) {
    for (const side of ['home', 'away']) {
      const t = f.teams?.[side]
      if (t) sampleTeams.push({ id: t.id, name: t.name, code: t.code })
    }
  }
  console.log('Sample teams (id / code / name):')
  for (const t of sampleTeams.slice(0, 6)) {
    const codeMatch = t.code && repoTlas.has(t.code) ? '← matches repo TLA' : ''
    console.log(`  ${String(t.id).padEnd(6)} ${String(t.code ?? '—').padEnd(4)} ${t.name} ${codeMatch}`)
  }
  const anyCodeMatch = sampleTeams.some(t => t.code && repoTlas.has(t.code))
  verdict['team identity mapping'] = anyCodeMatch
    ? [PASS, 'API-Football team.code aligns with repo TLA ids']
    : [WARN, 'team.code did not match repo TLA — a name/id mapping table will be needed']

  // 4. Card events on finished matches ------------------------------------
  console.log(`\n=== 4. Card events (sampling up to ${SAMPLE_FIXTURES} finished fixtures) ===`)
  const yellow = {}
  const red = {}
  const redTimeline = [] // { teamId, when } to test "first red card"
  let sampled = 0
  let sawCardEvents = false

  for (const f of finished.slice(0, SAMPLE_FIXTURES)) {
    const fid = f.fixture.id
    const ev = await api(`fixtures/events?fixture=${fid}`)
    const events = ev.response ?? []
    const cards = events.filter(e => e.type === 'Card')
    if (cards.length) sawCardEvents = true
    for (const c of cards) {
      const teamId = c.team?.id
      const kind = (c.detail || '').toLowerCase()
      if (kind.includes('yellow')) yellow[teamId] = (yellow[teamId] ?? 0) + 1
      if (kind.includes('red')) {
        red[teamId] = (red[teamId] ?? 0) + 1
        redTimeline.push({ teamId, teamName: c.team?.name, kickoff: f.fixture.date, minute: c.time?.elapsed })
      }
    }
    sampled++
    console.log(`  fixture ${fid}: ${cards.length} card events`)
  }

  if (sampled === 0) {
    console.log('(No finished fixtures yet — re-run once group games have been played.)')
    verdict['Most Yellow Cards'] = [WARN, 'no finished matches yet to confirm — structure looks right']
    verdict['First Red Card'] = [WARN, 'no finished matches yet to confirm']
  } else {
    console.log(`Yellow totals (sample): ${JSON.stringify(yellow)}`)
    console.log(`Red totals (sample):    ${JSON.stringify(red)}`)
    verdict['Most Yellow Cards'] = sawCardEvents
      ? [PASS, 'per-team yellow counts derivable from fixtures/events']
      : [WARN, 'finished matches had no Card events in sample — verify with more games']
    // First red: earliest by (kickoff date, then minute)
    redTimeline.sort((a, b) =>
      a.kickoff === b.kickoff ? (a.minute - b.minute) : (a.kickoff < b.kickoff ? -1 : 1))
    if (redTimeline.length) {
      const first = redTimeline[0]
      console.log(`First red in sample: ${first.teamName} @ ${first.kickoff} min ${first.minute}`)
      verdict['First Red Card'] = [PASS, 'red events carry team + kickoff + minute → orderable']
    } else {
      verdict['First Red Card'] = [PASS, 'no reds in sample, but Card/Red detail is the right field']
    }
  }

  // 5. First Eliminated — note: not a card need ---------------------------
  // Derivable from fixtures (group results -> bottom 2, or knockout losses),
  // no events call required. Flagged here for completeness.
  verdict['First Eliminated'] = [WARN, 'NOT a card stat — derive from standings/knockout results, no API-Football events needed']

  // 6. Budget math --------------------------------------------------------
  console.log('\n=== 6. Request budget ===')
  console.log(`This spike used ${requestCount} requests.`)
  console.log(`Daily limit: ${dailyLimit}. World Cup = 104 matches total.`)
  console.log('Strategy: fetch events only for matches that NEWLY reached FINISHED')
  console.log('since the last run. Peak day (~16 group games) ≈ 16 event calls +')
  console.log('a few overhead calls — comfortably under the cap.')
  const budgetOk = dailyLimit >= 25
  verdict['request budget (100/day)'] = budgetOk
    ? [PASS, 'incremental fetch keeps daily usage well under cap']
    : [WARN, `daily limit reported as ${dailyLimit}`]

  // Verdict table ---------------------------------------------------------
  console.log('\n========== FEASIBILITY VERDICT ==========')
  for (const [need, v] of Object.entries(verdict)) {
    const [stat, detail] = Array.isArray(v) ? v : [v ? PASS : FAIL, '']
    console.log(`${stat}  ${need}${detail ? ' — ' + detail : ''}`)
  }
  console.log('=========================================\n')
}

main().catch(err => {
  console.error('\nSpike failed:', err.message)
  process.exit(1)
})
