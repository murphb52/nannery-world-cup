const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
const FETCH_TIMEOUT_MS = 10_000

async function espnFetch(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function normaliseName(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchDateKey(isoDate) {
  return isoDate.slice(0, 10).replace(/-/g, '')
}

function adjacentDays(yyyymmdd) {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00Z`)
  const fmt = dt => dt.toISOString().slice(0, 10).replace(/-/g, '')
  const prev = new Date(d); prev.setUTCDate(d.getUTCDate() - 1)
  const next = new Date(d); next.setUTCDate(d.getUTCDate() + 1)
  return [fmt(prev), yyyymmdd, fmt(next)]
}

// Returns: { espnEventId, homeId, awayId, homeAbbr, awayAbbr, homeName, awayName }
async function buildEspnIndex(dateCodes) {
  const index = []
  for (const date of dateCodes) {
    let data
    try {
      data = await espnFetch(`${ESPN_BASE}/scoreboard?dates=${date}`)
    } catch (err) {
      console.warn(`ESPN scoreboard ${date} failed: ${err.message}`)
      continue
    }
    for (const event of data.events ?? []) {
      const competitors = event.competitions?.[0]?.competitors ?? []
      const homeComp = competitors.find(c => c.homeAway === 'home')
      const awayComp = competitors.find(c => c.homeAway === 'away')
      if (!homeComp || !awayComp) continue
      index.push({
        espnEventId: event.id,
        homeId: homeComp.team.id,
        awayId: awayComp.team.id,
        homeAbbr: homeComp.team.abbreviation?.toUpperCase(),
        awayAbbr: awayComp.team.abbreviation?.toUpperCase(),
        homeName: normaliseName(homeComp.team.displayName ?? ''),
        awayName: normaliseName(awayComp.team.displayName ?? ''),
      })
    }
  }
  return index
}

function findEspnEvent(fdMatch, espnIndex) {
  const homeTla = fdMatch.homeTeamId?.toUpperCase()
  const awayTla = fdMatch.awayTeamId?.toUpperCase()

  // Exact TLA match (handles >95% of cases — ESPN abbreviations match football-data TLAs)
  const byAbbr = espnIndex.find(
    e => e.homeAbbr === homeTla && e.awayAbbr === awayTla ||
         e.homeAbbr === awayTla && e.awayAbbr === homeTla
  )
  if (byAbbr) return byAbbr

  // Normalised full-name fallback for any TLA mismatch
  const homeNorm = normaliseName(fdMatch.homeTeamId ?? '')
  const awayNorm = normaliseName(fdMatch.awayTeamId ?? '')
  return espnIndex.find(e =>
    (e.homeName.includes(homeNorm) || homeNorm.includes(e.homeName)) &&
    (e.awayName.includes(awayNorm) || awayNorm.includes(e.awayName))
  ) ?? null
}

function parseMinute(displayValue) {
  const m = (displayValue ?? '').match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

async function fetchMatchCards(espnEventId, espnEvent, fdMatch) {
  let data
  try {
    data = await espnFetch(`${ESPN_BASE}/summary?event=${espnEventId}`)
  } catch (err) {
    console.warn(`ESPN summary ${espnEventId} failed: ${err.message}`)
    return null
  }

  const cards = []
  for (const e of data.keyEvents ?? []) {
    const cardType = e.type?.type
    if (cardType !== 'yellow-card' && cardType !== 'red-card') continue

    const minute = parseMinute(e.clock?.displayValue)
    const card = cardType === 'yellow-card' ? 'YELLOW' : 'RED'
    const player = e.participants?.[0]?.athlete?.displayName ?? null

    // Map ESPN team id to football-data TLA using the paired event
    let teamId = null
    if (e.team?.id) {
      if (e.team.id === espnEvent.homeId) {
        teamId = fdMatch.homeTeamId
      } else if (e.team.id === espnEvent.awayId) {
        teamId = fdMatch.awayTeamId
      }
    }
    if (!teamId) {
      console.warn(`  Could not map ESPN team id ${e.team?.id} for match ${fdMatch.id}`)
      continue
    }

    cards.push({ minute, teamId, player, card })
  }
  return cards
}

export async function fetchCardsFromEspn(matches, existingBookings) {
  const bookings = { ...existingBookings }

  const unprocessed = matches.filter(
    m => m.status === 'FINISHED' && !(String(m.id) in bookings)
  )
  if (unprocessed.length === 0) {
    console.log('ESPN cards: all finished matches already cached')
    return bookings
  }
  console.log(`ESPN cards: fetching for ${unprocessed.length} unprocessed finished match(es)`)

  // Gather unique date codes (+ neighbours) across all matches needing processing
  const dateCodes = [
    ...new Set(unprocessed.flatMap(m => adjacentDays(matchDateKey(m.date)))),
  ]

  let espnIndex
  try {
    espnIndex = await buildEspnIndex(dateCodes)
  } catch (err) {
    console.warn(`ESPN card fetch skipped (index build failed): ${err.message}`)
    return bookings
  }
  console.log(`ESPN cards: indexed ${espnIndex.length} ESPN events across ${dateCodes.length} date(s)`)

  for (const fdMatch of unprocessed) {
    const espnEvent = findEspnEvent(fdMatch, espnIndex)
    if (!espnEvent) {
      console.warn(`ESPN cards: no ESPN match found for fd ${fdMatch.id} (${fdMatch.homeTeamId} v ${fdMatch.awayTeamId} on ${fdMatch.date?.slice(0, 10)})`)
      continue
    }

    const cards = await fetchMatchCards(espnEvent.espnEventId, espnEvent, fdMatch)
    if (cards === null) continue // fetch failed — leave absent so it retries next run

    bookings[String(fdMatch.id)] = cards
    if (cards.length > 0) {
      console.log(`  ${fdMatch.homeTeamId} v ${fdMatch.awayTeamId}: ${cards.length} card(s)`)
    } else {
      console.log(`  ${fdMatch.homeTeamId} v ${fdMatch.awayTeamId}: no cards`)
    }
  }

  return bookings
}
