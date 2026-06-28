import type { Team, DrawResult, Player } from '../types'
import { resolveNames } from '../data/loaders'

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

/**
 * Renders the full draw (12 groups, flag + team + player) to a high-resolution
 * PNG and triggers a download. Drawn manually on a canvas so it doesn't depend
 * on the page's CSS (Tailwind v4 oklch colours break DOM-snapshot libraries)
 * and so it always produces a clean, consistent share graphic.
 */
export async function exportGroupsPng(teams: Team[], draw: DrawResult, players: Player[], sweepstakesName = 'World Cup 2026'): Promise<void> {
  const playerNames = resolveNames(draw, players)
  const scale = Math.min(2, window.devicePixelRatio || 1) * 1.5
  const COLS = 4
  const ROWS = 3
  const PAD = 48
  const HEADER_H = 132
  const CARD_W = 440
  const CARD_GAP = 24
  const CARD_HEADER_H = 46
  const ROW_H = 46
  const CARD_PAD_B = 10
  const CARD_H = CARD_HEADER_H + ROW_H * 4 + CARD_PAD_B

  const width = PAD * 2 + CARD_W * COLS + CARD_GAP * (COLS - 1)
  const height = PAD + HEADER_H + CARD_H * ROWS + CARD_GAP * (ROWS - 1) + PAD

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'

  // Preload all flags (failures resolve to null → placeholder, no canvas taint)
  const flagEntries = await Promise.all(
    teams.map(async t => [t.id, await loadImage(t.flag)] as const)
  )
  const flags = new Map(flagEntries)

  // Background — matches the app's diagonal gradient
  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#0a0a1a')
  bg.addColorStop(0.5, '#0d1117')
  bg.addColorStop(1, '#0a1628')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // Title
  const titleGrad = ctx.createLinearGradient(0, 0, width, 0)
  titleGrad.addColorStop(0, '#facc15')
  titleGrad.addColorStop(1, '#ef4444')
  ctx.textAlign = 'center'
  ctx.fillStyle = titleGrad
  ctx.font = '800 46px Inter, system-ui, sans-serif'
  ctx.fillText(`🏆 ${sweepstakesName}`, width / 2, PAD + 30)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '500 22px Inter, system-ui, sans-serif'
  ctx.fillText('The Official Draw', width / 2, PAD + 74)

  // Group cards
  GROUPS.forEach((group, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = PAD + col * (CARD_W + CARD_GAP)
    const y = PAD + HEADER_H + row * (CARD_H + CARD_GAP)

    // Card body
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    roundRect(ctx, x, y, CARD_W, CARD_H, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, CARD_W, CARD_H, 16)
    ctx.stroke()

    // Header strip
    ctx.save()
    roundRect(ctx, x, y, CARD_W, CARD_HEADER_H, 16)
    ctx.clip()
    const hg = ctx.createLinearGradient(x, y, x + CARD_W, y)
    hg.addColorStop(0, 'rgba(234,179,8,0.22)')
    hg.addColorStop(1, 'rgba(239,68,68,0.22)')
    ctx.fillStyle = hg
    ctx.fillRect(x, y, CARD_W, CARD_HEADER_H)
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.fillStyle = '#fbbf24'
    ctx.font = '700 18px Inter, system-ui, sans-serif'
    ctx.fillText(`GROUP ${group}`, x + 16, y + CARD_HEADER_H / 2 + 1)

    const groupTeams = teams.filter(t => t.group === group)
    groupTeams.forEach((team, r) => {
      const rowY = y + CARD_HEADER_H + r * ROW_H
      const midY = rowY + ROW_H / 2

      if (r > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.beginPath()
        ctx.moveTo(x + 12, rowY)
        ctx.lineTo(x + CARD_W - 12, rowY)
        ctx.stroke()
      }

      // Flag
      const fw = 34
      const fh = 22
      const fx = x + 16
      const fy = midY - fh / 2
      const flag = flags.get(team.id)
      if (flag) {
        ctx.save()
        roundRect(ctx, fx, fy, fw, fh, 3)
        ctx.clip()
        ctx.drawImage(flag, fx, fy, fw, fh)
        ctx.restore()
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        roundRect(ctx, fx, fy, fw, fh, 3)
        ctx.fill()
      }

      // Team name
      const playerW = 150
      const nameX = fx + fw + 12
      const nameMaxW = CARD_W - (nameX - x) - playerW - 16
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.font = '600 19px Inter, system-ui, sans-serif'
      ctx.fillText(fitText(ctx, team.name, nameMaxW), nameX, midY + 1)

      // Player name (right-aligned)
      const player = playerNames[team.id]
      ctx.textAlign = 'right'
      ctx.font = '500 17px Inter, system-ui, sans-serif'
      if (player) {
        ctx.fillStyle = '#fcd34d'
        ctx.fillText(fitText(ctx, player, playerW), x + CARD_W - 16, midY + 1)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillText('—', x + CARD_W - 16, midY + 1)
      }
    })
  })

  let url: string
  try {
    url = canvas.toDataURL('image/png')
  } catch {
    throw new Error('Could not export image (flag images blocked export). Try again.')
  }
  const a = document.createElement('a')
  const slug = sweepstakesName.toLowerCase().replace(/\s+/g, '-')
  a.download = `${slug}-draw.png`
  a.href = url
  a.click()
}

interface KnockoutMatch {
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
}

type KnockoutBracket = Record<string, KnockoutMatch[]>

/**
 * Renders the full knockout bracket (R32 → Final, both sides + connectors) to a
 * high-resolution PNG and triggers a download. Like {@link exportGroupsPng},
 * it's drawn manually on a canvas so it doesn't depend on the page's CSS
 * (Tailwind v4 oklch colours break DOM-snapshot libraries) and always produces
 * a clean, consistent share graphic showing who's through and who plays who.
 */
export async function exportKnockoutPng(
  teams: Team[],
  bracket: KnockoutBracket,
  playerNames: Record<string, string>,
  sweepstakesName = 'World Cup 2026',
  lastUpdated: string | null = null,
): Promise<void> {
  const scale = Math.min(2, window.devicePixelRatio || 1) * 1.5

  // Layout (mirrors KnockoutPage geometry, scaled up a touch for readability)
  const PAD = 56
  const HEADER_H = 124
  const LABEL_H = 36
  const FOOTER_H = 64
  const MATCH_W = 200
  const MATCH_H = 86
  const COL_GAP = 30
  const SLOT_H = 104
  const BRACKET_H = 8 * SLOT_H
  const NUM_COLS = 9 // 4 left + final + 4 right

  const colX = (i: number) => PAD + i * (MATCH_W + COL_GAP)
  const matchTop = (roundIdx: number, matchIdx: number) => {
    const slotsPerMatch = Math.pow(2, roundIdx)
    const centerOffset = (slotsPerMatch * SLOT_H) / 2
    return matchIdx * slotsPerMatch * SLOT_H + centerOffset - MATCH_H / 2
  }
  const matchCenterY = (roundIdx: number, matchIdx: number) => matchTop(roundIdx, matchIdx) + MATCH_H / 2

  const width = PAD * 2 + NUM_COLS * MATCH_W + (NUM_COLS - 1) * COL_GAP
  const height = PAD + HEADER_H + LABEL_H + BRACKET_H + FOOTER_H + PAD
  const BRACKET_TOP = PAD + HEADER_H + LABEL_H

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'

  // Preload all flags (failures resolve to null → placeholder, no canvas taint)
  const flagEntries = await Promise.all(
    teams.map(async t => [t.id, await loadImage(t.flag)] as const)
  )
  const flags = new Map(flagEntries)
  const teamById = new Map(teams.map(t => [t.id, t]))

  // Background — matches the app's diagonal gradient
  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#0a0a1a')
  bg.addColorStop(0.5, '#0d1117')
  bg.addColorStop(1, '#0a1628')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // Title
  const titleGrad = ctx.createLinearGradient(0, 0, width, 0)
  titleGrad.addColorStop(0, '#facc15')
  titleGrad.addColorStop(1, '#ef4444')
  ctx.textAlign = 'center'
  ctx.fillStyle = titleGrad
  ctx.font = '800 46px Inter, system-ui, sans-serif'
  ctx.fillText(`🏆 ${sweepstakesName}`, width / 2, PAD + 30)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '500 22px Inter, system-ui, sans-serif'
  ctx.fillText('Knockout Bracket', width / 2, PAD + 74)

  // Column layout: round key, slice of matches, vertical round index, side
  const cols = [
    { round: 'R32', matches: (bracket.R32 ?? []).slice(0, 8), roundIdx: 0, flipped: false, label: 'Round of 32' },
    { round: 'R16', matches: (bracket.R16 ?? []).slice(0, 4), roundIdx: 1, flipped: false, label: 'Round of 16' },
    { round: 'QF', matches: (bracket.QF ?? []).slice(0, 2), roundIdx: 2, flipped: false, label: 'Quarter-Finals' },
    { round: 'SF', matches: (bracket.SF ?? []).slice(0, 1), roundIdx: 3, flipped: false, label: 'Semi-Finals' },
    { round: 'F', matches: (bracket.F ?? []).slice(0, 1), roundIdx: 3, flipped: false, label: 'Final' },
    { round: 'SF', matches: (bracket.SF ?? []).slice(1), roundIdx: 3, flipped: true, label: 'Semi-Finals' },
    { round: 'QF', matches: (bracket.QF ?? []).slice(2), roundIdx: 2, flipped: true, label: 'Quarter-Finals' },
    { round: 'R16', matches: (bracket.R16 ?? []).slice(4), roundIdx: 1, flipped: true, label: 'Round of 16' },
    { round: 'R32', matches: (bracket.R32 ?? []).slice(8), roundIdx: 0, flipped: true, label: 'Round of 32' },
  ]

  // Connector lines — drawn behind the cards
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 1.5
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath()
    ctx.moveTo(x1, BRACKET_TOP + y1)
    ctx.lineTo(x2, BRACKET_TOP + y2)
    ctx.stroke()
  }
  for (let r = 0; r < 3; r++) {
    const pairs = Math.pow(2, 2 - r) // 4, 2, 1
    for (let i = 0; i < pairs; i++) {
      const topY = matchCenterY(r, i * 2)
      const botY = matchCenterY(r, i * 2 + 1)
      const nextY = matchCenterY(r + 1, i)
      // Left side
      {
        const fromX = colX(r) + MATCH_W
        const toX = colX(r + 1)
        const midX = fromX + COL_GAP / 2
        line(fromX, topY, midX, topY)
        line(fromX, botY, midX, botY)
        line(midX, topY, midX, botY)
        line(midX, nextY, toX, nextY)
      }
      // Right side (mirrored): R32 col 8, R16 col 7, QF col 6, SF col 5
      {
        const rCol = 8 - r
        const fromX = colX(rCol)
        const toX = colX(rCol - 1) + MATCH_W
        const midX = toX + COL_GAP / 2
        line(fromX, topY, midX, topY)
        line(fromX, botY, midX, botY)
        line(midX, topY, midX, botY)
        line(midX, nextY, toX, nextY)
      }
    }
  }
  // SF → Final
  {
    const sfY = matchCenterY(3, 0)
    line(colX(3) + MATCH_W, sfY, colX(4), sfY) // left SF → Final
    line(colX(5), sfY, colX(4) + MATCH_W, sfY) // right SF → Final
  }

  // Round labels
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '600 14px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  cols.forEach((col, c) => {
    ctx.fillStyle = col.round === 'F' ? 'rgba(250,204,21,0.6)' : 'rgba(255,255,255,0.35)'
    ctx.fillText(col.label.toUpperCase(), colX(c) + MATCH_W / 2, PAD + HEADER_H + LABEL_H / 2)
  })

  // Draw a single team row inside a card
  const drawRow = (
    cardX: number,
    cy: number,
    teamId: string | null,
    score: number | null,
    won: boolean,
    lost: boolean,
    flipped: boolean,
  ) => {
    const pad = 12
    const flagW = 30
    const flagH = 20
    const gap = 9
    const scoreW = score !== null ? 22 : 0
    const team = teamId ? teamById.get(teamId) ?? null : null
    const player = teamId ? playerNames[teamId] : null

    ctx.save()
    if (lost) ctx.globalAlpha = 0.45

    const flagX = flipped ? cardX + MATCH_W - pad - flagW : cardX + pad
    const flagY = cy - flagH / 2
    const flag = team ? flags.get(team.id) : null
    if (team && flag) {
      ctx.save()
      roundRect(ctx, flagX, flagY, flagW, flagH, 3)
      ctx.clip()
      ctx.drawImage(flag, flagX, flagY, flagW, flagH)
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, flagX, flagY, flagW, flagH, 3)
      ctx.fill()
    }

    if (!team) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '500 15px Inter, system-ui, sans-serif'
      ctx.textAlign = flipped ? 'right' : 'left'
      ctx.fillText('TBD', flipped ? flagX - gap : flagX + flagW + gap, cy)
      ctx.restore()
      return
    }

    // Score
    if (score !== null) {
      ctx.fillStyle = won ? '#facc15' : 'rgba(255,255,255,0.45)'
      ctx.font = '700 17px Inter, system-ui, sans-serif'
      ctx.textAlign = flipped ? 'left' : 'right'
      ctx.fillText(String(score), flipped ? cardX + pad : cardX + MATCH_W - pad, cy)
    }

    // Team name + player
    const nameAnchor = flipped ? flagX - gap : flagX + flagW + gap
    const nameMaxW = flipped
      ? nameAnchor - (cardX + pad) - (scoreW ? scoreW + 8 : 0)
      : cardX + MATCH_W - pad - (scoreW ? scoreW + 8 : 0) - nameAnchor
    ctx.textAlign = flipped ? 'right' : 'left'

    ctx.fillStyle = won ? '#facc15' : '#ffffff'
    ctx.font = `${won ? 700 : 600} 16px Inter, system-ui, sans-serif`
    ctx.fillText(fitText(ctx, team.name, nameMaxW), nameAnchor, player ? cy - 8 : cy)

    if (player) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = '500 12px Inter, system-ui, sans-serif'
      ctx.fillText(fitText(ctx, player, nameMaxW), nameAnchor, cy + 9)
    }
    ctx.restore()
  }

  // Draw all match cards
  cols.forEach((col, c) => {
    col.matches.forEach((match, i) => {
      const x = colX(c)
      const y = BRACKET_TOP + matchTop(col.roundIdx, i)
      const finished = match.homeScore !== null && match.awayScore !== null
      const homeWon = finished && match.homeScore! > match.awayScore!
      const awayWon = finished && match.awayScore! > match.homeScore!

      // Card body
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      roundRect(ctx, x, y, MATCH_W, MATCH_H, 12)
      ctx.fill()
      ctx.strokeStyle = col.round === 'F' ? 'rgba(250,204,21,0.4)' : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      roundRect(ctx, x, y, MATCH_W, MATCH_H, 12)
      ctx.stroke()

      // Divider
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.beginPath()
      ctx.moveTo(x + 10, y + MATCH_H / 2)
      ctx.lineTo(x + MATCH_W - 10, y + MATCH_H / 2)
      ctx.stroke()

      const homeRow = { teamId: match.homeTeamId, score: match.homeScore, won: homeWon, lost: awayWon }
      const awayRow = { teamId: match.awayTeamId, score: match.awayScore, won: awayWon, lost: homeWon }
      const rows = col.flipped ? [awayRow, homeRow] : [homeRow, awayRow]
      drawRow(x, y + MATCH_H * 0.25, rows[0].teamId, rows[0].score, rows[0].won, rows[0].lost, col.flipped)
      drawRow(x, y + MATCH_H * 0.75, rows[1].teamId, rows[1].score, rows[1].won, rows[1].lost, col.flipped)
    })
  })

  // Footer — champion (if decided) + timestamp
  const final = bracket.F?.[0]
  let champion: Team | null = null
  if (final && final.homeScore !== null && final.awayScore !== null && final.homeScore !== final.awayScore) {
    const winnerId = final.homeScore > final.awayScore ? final.homeTeamId : final.awayTeamId
    champion = winnerId ? teamById.get(winnerId) ?? null : null
  }
  const footerY = height - PAD - FOOTER_H / 2
  if (champion) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#facc15'
    ctx.font = '800 26px Inter, system-ui, sans-serif'
    ctx.fillText(`🏆 Champions: ${champion.name}`, width / 2, footerY)
  }
  if (lastUpdated) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '500 14px Inter, system-ui, sans-serif'
    ctx.fillText(`Last updated ${new Date(lastUpdated).toLocaleString()}`, width / 2, champion ? footerY + 24 : footerY)
  }

  let url: string
  try {
    url = canvas.toDataURL('image/png')
  } catch {
    throw new Error('Could not export image (flag images blocked export). Try again.')
  }
  const a = document.createElement('a')
  const slug = sweepstakesName.toLowerCase().replace(/\s+/g, '-')
  a.download = `${slug}-knockout.png`
  a.href = url
  a.click()
}
