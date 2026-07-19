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

  const slug = sweepstakesName.toLowerCase().replace(/\s+/g, '-')
  await shareOrDownload(canvas, `${slug}-draw`, `${sweepstakesName} — The Official Draw`)
}

interface KnockoutMatch {
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
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
      // Prefer the explicit winner (set for penalty shootouts, where the
      // on-pitch score is level), falling back to the run-of-play score.
      const homeWon = match.winner === 'HOME_TEAM' || (finished && match.winner == null && match.homeScore! > match.awayScore!)
      const awayWon = match.winner === 'AWAY_TEAM' || (finished && match.winner == null && match.awayScore! > match.homeScore!)

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
  if (final && final.homeScore !== null && final.awayScore !== null) {
    const winnerId = final.winner === 'HOME_TEAM' ? final.homeTeamId
      : final.winner === 'AWAY_TEAM' ? final.awayTeamId
      : final.homeScore > final.awayScore ? final.homeTeamId
      : final.awayScore > final.homeScore ? final.awayTeamId
      : null
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

  const slug = sweepstakesName.toLowerCase().replace(/\s+/g, '-')
  await shareOrDownload(canvas, `${slug}-knockout`, `${sweepstakesName} — Knockout Bracket`)
}

// ---------------------------------------------------------------------------
// Prizes & Stats share graphics
//
// Like the draw/knockout exports above, these are drawn by hand on a canvas so
// they don't depend on the page's CSS (Tailwind v4 oklch colours break
// DOM-snapshot libraries) and always produce a clean, consistent share graphic.
// Cards are laid out with a shortest-column-first packing so mixed-height cards
// tile without big gaps, and the same renderer powers both a single-card export
// and an "export everything" grid.
// ---------------------------------------------------------------------------

const FONT = 'Inter, system-ui, sans-serif'

const GRID_PAD = 44
const GRID_HEADER_H = 108
const GRID_GAP = 24

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#0a0a1a')
  bg.addColorStop(0.5, '#0d1117')
  bg.addColorStop(1, '#0a1628')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
}

function drawTitle(ctx: CanvasRenderingContext2D, width: number, topY: number, title: string, subtitle: string) {
  const titleGrad = ctx.createLinearGradient(0, 0, width, 0)
  titleGrad.addColorStop(0, '#facc15')
  titleGrad.addColorStop(1, '#ef4444')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = titleGrad
  // Shrink the title so it always fits within the graphic (single-card exports
  // are narrow enough that the full name would otherwise clip).
  const titleText = `🏆 ${title}`
  const maxTitleW = width - GRID_PAD * 2
  let titleSize = 42
  do {
    ctx.font = `800 ${titleSize}px ${FONT}`
    if (ctx.measureText(titleText).width <= maxTitleW) break
    titleSize -= 2
  } while (titleSize > 22)
  ctx.fillText(titleText, width / 2, topY + 26)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `500 20px ${FONT}`
  ctx.fillText(subtitle, width / 2, topY + 66)
}

// Keep share graphics comfortably shareable. PNG is lossless (crisp text, no
// artefacts) so it's always preferred, but a large multi-card grid can exceed a
// sensible size — past this budget we re-encode as high-quality WebP (still
// sharp on flat UI/text), then JPEG as a last resort, stepping quality down
// only as far as needed to fit.
const MAX_EXPORT_BYTES = 4 * 1024 * 1024

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), mime, quality))
}

/**
 * Encode the canvas to a Blob that stays under {@link MAX_EXPORT_BYTES} where
 * possible, keeping quality as high as the budget allows. Returns the blob plus
 * the mime/extension for the format actually used.
 */
async function encodeWithinBudget(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mime: string; ext: string }> {
  const png = await canvasToBlob(canvas, 'image/png')
  if (!png) throw new Error('encode-failed')
  if (png.size <= MAX_EXPORT_BYTES) return { blob: png, mime: 'image/png', ext: 'png' }

  for (const [mime, ext] of [['image/webp', 'webp'], ['image/jpeg', 'jpg']] as const) {
    let quality = 0.92
    let blob = await canvasToBlob(canvas, mime, quality)
    // Browsers that don't support the format fall back to PNG — skip those.
    if (!blob || blob.type !== mime) continue
    while (blob.size > MAX_EXPORT_BYTES && quality > 0.6) {
      quality = Math.round((quality - 0.08) * 100) / 100
      const next = await canvasToBlob(canvas, mime, quality)
      if (!next) break
      blob = next
    }
    return { blob, mime, ext }
  }
  return { blob: png, mime: 'image/png', ext: 'png' }
}

/**
 * Hand the rendered canvas to the user. On devices with the Web Share API and
 * file support (notably iOS Safari, where an `<a download>` on a generated
 * image silently does nothing) this opens the native share sheet so the image
 * can be saved to Photos, AirDropped, messaged, etc. Everywhere else it falls
 * back to a normal file download.
 */
async function shareOrDownload(canvas: HTMLCanvasElement, baseName: string, shareTitle: string) {
  let encoded: { blob: Blob; mime: string; ext: string }
  try {
    encoded = await encodeWithinBudget(canvas)
  } catch {
    throw new Error('Could not export image (flag images blocked export). Try again.')
  }
  const filename = `${baseName}.${encoded.ext}`
  const file = new File([encoded.blob], filename, { type: encoded.mime })

  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle })
      return
    } catch (e) {
      // User dismissed the share sheet — that's a deliberate cancel, not a
      // failure, so don't fall back to a download or surface an error.
      if (e instanceof DOMException && e.name === 'AbortError') return
      // Any other share failure: fall through to the download path below.
    }
  }

  const url = URL.createObjectURL(encoded.blob)
  const a = document.createElement('a')
  a.download = filename
  a.href = url
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/**
 * Generic card-grid renderer shared by the prizes and stats exports. Packs
 * fixed-width, variable-height cards into `cols` columns (shortest column
 * first), draws the shared backdrop + title, then hands each card to `drawCard`.
 */
async function renderCardGrid<T>(opts: {
  items: T[]
  cols: number
  cardW: number
  heightOf: (item: T) => number
  drawCard: (ctx: CanvasRenderingContext2D, x: number, y: number, item: T, flags: Map<string, HTMLImageElement | null>) => void
  teams: Team[]
  title: string
  subtitle: string
  filename: string
}): Promise<void> {
  const { items, cardW, heightOf, drawCard, teams, title, subtitle, filename } = opts
  const cols = Math.max(1, Math.min(opts.cols, items.length || 1))

  // Pack cards into columns, always adding to the currently shortest column.
  const heights = items.map(heightOf)
  const colHeights = new Array(cols).fill(0)
  const placements = items.map((_, i) => {
    let col = 0
    for (let c = 1; c < cols; c++) if (colHeights[c] < colHeights[col]) col = c
    const yOffset = colHeights[col]
    colHeights[col] += heights[i] + GRID_GAP
    return { col, yOffset }
  })
  const contentH = Math.max(0, ...colHeights.map(h => h - GRID_GAP))

  const width = GRID_PAD * 2 + cols * cardW + (cols - 1) * GRID_GAP
  const height = GRID_PAD + GRID_HEADER_H + contentH + GRID_PAD

  // 2× supersampling keeps text/edges crisp without exploding the pixel count
  // (and therefore the file size) the way a 3× buffer would on retina screens.
  const scale = Math.min(2, (window.devicePixelRatio || 1) * 1.5)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.scale(scale, scale)

  const flagEntries = await Promise.all(
    teams.map(async t => [t.id, await loadImage(t.flag)] as const)
  )
  const flags = new Map(flagEntries)

  drawBackdrop(ctx, width, height)
  drawTitle(ctx, width, GRID_PAD, title, subtitle)

  items.forEach((item, i) => {
    const { col, yOffset } = placements[i]
    const x = GRID_PAD + col * (cardW + GRID_GAP)
    const y = GRID_PAD + GRID_HEADER_H + yOffset
    drawCard(ctx, x, y, item, flags)
  })

  await shareOrDownload(canvas, filename, `${title} — ${subtitle}`)
}

function slugify(...parts: string[]): string {
  return parts.join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// --- Stats leaderboard cards -------------------------------------------------

export interface StatExportEntry {
  teamId: string
  value: number | string
  label: string
  rank: number
  isTied: boolean
}

export interface StatExportCard {
  icon: string
  title: string
  entries: StatExportEntry[]
}

const STAT_CARD_W = 460
const STAT_HEADER_H = 52
const STAT_ROW_H = 44

function statCardHeight(card: StatExportCard): number {
  return STAT_HEADER_H + Math.max(card.entries.length, 1) * STAT_ROW_H + 10
}

function drawStatCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  card: StatExportCard,
  teams: Team[],
  playerNames: Record<string, string>,
  flags: Map<string, HTMLImageElement | null>,
) {
  const w = STAT_CARD_W
  const h = statCardHeight(card)
  const teamById = new Map(teams.map(t => [t.id, t]))

  // Card body
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  roundRect(ctx, x, y, w, h, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, w, h, 16)
  ctx.stroke()

  // Header strip
  ctx.save()
  roundRect(ctx, x, y, w, STAT_HEADER_H, 16)
  ctx.clip()
  const hg = ctx.createLinearGradient(x, y, x + w, y)
  hg.addColorStop(0, 'rgba(234,179,8,0.15)')
  hg.addColorStop(1, 'rgba(239,68,68,0.15)')
  ctx.fillStyle = hg
  ctx.fillRect(x, y, w, STAT_HEADER_H)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `400 20px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(card.icon, x + 16, y + STAT_HEADER_H / 2 + 1)
  ctx.font = `700 17px ${FONT}`
  ctx.fillText(card.title, x + 48, y + STAT_HEADER_H / 2 + 1)

  if (!card.entries.length) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = `500 15px ${FONT}`
    ctx.fillText('No data yet', x + w / 2, y + STAT_HEADER_H + STAT_ROW_H / 2)
    return
  }

  card.entries.forEach((entry, i) => {
    const rowY = y + STAT_HEADER_H + i * STAT_ROW_H
    const midY = rowY + STAT_ROW_H / 2
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.beginPath()
      ctx.moveTo(x + 12, rowY)
      ctx.lineTo(x + w - 12, rowY)
      ctx.stroke()
    }

    const team = teamById.get(entry.teamId)
    const isFirst = entry.rank === 1

    // Rank
    ctx.textAlign = 'right'
    ctx.fillStyle = entry.rank === 1 ? '#facc15'
      : entry.rank === 2 ? 'rgba(255,255,255,0.5)'
      : entry.rank === 3 ? 'rgba(251,146,60,0.7)'
      : 'rgba(255,255,255,0.25)'
    ctx.font = `700 14px ${FONT}`
    ctx.fillText(entry.isTied ? `=${entry.rank}` : String(entry.rank), x + 32, midY)

    // Flag
    const fw = 32
    const fh = 20
    const fx = x + 44
    const fy = midY - fh / 2
    const flag = team ? flags.get(team.id) : null
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

    // Value + label (right-aligned block)
    ctx.font = `700 16px ${FONT}`
    const valueText = String(entry.value)
    const valueW = ctx.measureText(valueText).width
    ctx.font = `400 12px ${FONT}`
    const labelW = ctx.measureText(entry.label).width
    const blockRight = x + w - 16
    const blockLeft = blockRight - valueW - 6 - labelW
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillText(entry.label, blockRight, midY)
    ctx.font = `700 16px ${FONT}`
    ctx.fillStyle = isFirst ? '#facc15' : 'rgba(255,255,255,0.75)'
    ctx.fillText(valueText, blockLeft + valueW, midY)

    // Team name + player
    const nameX = fx + fw + 12
    const nameMaxW = blockLeft - 10 - nameX
    const player = playerNames[entry.teamId]
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 15px ${FONT}`
    ctx.fillText(fitText(ctx, team?.name ?? entry.teamId, nameMaxW), nameX, player ? midY - 7 : midY)
    if (player) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = `400 12px ${FONT}`
      ctx.fillText(fitText(ctx, player, nameMaxW), nameX, midY + 9)
    }
  })
}

/** Export a single stats leaderboard card as a PNG. */
export async function exportStatCardPng(
  card: StatExportCard,
  teams: Team[],
  playerNames: Record<string, string>,
  sweepstakesName = 'World Cup 2026',
): Promise<void> {
  await renderCardGrid({
    items: [card],
    cols: 1,
    cardW: STAT_CARD_W,
    heightOf: statCardHeight,
    drawCard: (ctx, x, y, item, flags) => drawStatCard(ctx, x, y, item, teams, playerNames, flags),
    teams,
    title: sweepstakesName,
    subtitle: card.title,
    filename: slugify(sweepstakesName, card.title),
  })
}

/** Export every stats leaderboard card as one PNG. */
export async function exportStatCardsPng(
  cards: StatExportCard[],
  teams: Team[],
  playerNames: Record<string, string>,
  sweepstakesName = 'World Cup 2026',
): Promise<void> {
  await renderCardGrid({
    items: cards,
    cols: 2,
    cardW: STAT_CARD_W,
    heightOf: statCardHeight,
    drawCard: (ctx, x, y, item, flags) => drawStatCard(ctx, x, y, item, teams, playerNames, flags),
    teams,
    title: sweepstakesName,
    subtitle: 'Tournament Stats',
    filename: slugify(sweepstakesName, 'stats'),
  })
}

// --- Prize cards -------------------------------------------------------------

export interface PrizeExportTeam {
  teamId: string
  player: string
  teamName: string
  isOut: boolean
  note?: string
}

export interface PrizeExportCard {
  icon: string
  title: string
  description: string
  amount: number
  empty: boolean
  teams: PrizeExportTeam[]
  stat?: string
  runnersUp?: { teams: PrizeExportTeam[]; stat: string }
}

const PRIZE_CARD_W = 460
const PRIZE_HEADER_H = 68
const PRIZE_ROW_H = 48
const PRIZE_RU_ROW_H = 42
const PRIZE_PANEL_PAD = 14
const PRIZE_BOTTOM = 12

function prizeCardHeight(card: PrizeExportCard): number {
  let inner: number
  if (card.empty) {
    inner = 44
  } else {
    inner = card.teams.length * PRIZE_ROW_H
    if (card.stat) inner += 30
    if (card.runnersUp && card.runnersUp.teams.length) {
      inner += 12 + 20 + card.runnersUp.teams.length * PRIZE_RU_ROW_H + 20
    }
  }
  return PRIZE_HEADER_H + PRIZE_PANEL_PAD * 2 + inner + PRIZE_BOTTOM
}

function drawPrizeRow(
  ctx: CanvasRenderingContext2D,
  innerX: number,
  innerW: number,
  midY: number,
  t: PrizeExportTeam,
  flags: Map<string, HTMLImageElement | null>,
  tone: 'lead' | 'chase',
) {
  const fw = 40
  const fh = 28
  const fx = innerX
  const fy = midY - fh / 2
  const flag = flags.get(t.teamId)

  ctx.save()
  if (t.isOut) ctx.globalAlpha = 0.4
  if (flag) {
    ctx.save()
    roundRect(ctx, fx, fy, fw, fh, 4)
    ctx.clip()
    ctx.drawImage(flag, fx, fy, fw, fh)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, fx, fy, fw, fh, 4)
    ctx.fill()
  }
  ctx.restore()

  const noteW = t.note ? 40 : 0
  const nameX = fx + fw + 12
  const nameMaxW = innerX + innerW - nameX - noteW - 8

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `600 16px ${FONT}`
  ctx.fillStyle = tone === 'lead' ? '#facc15' : 'rgba(255,255,255,0.7)'
  ctx.fillText(fitText(ctx, t.player, nameMaxW), nameX, midY - 8)
  ctx.font = `400 12px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(fitText(ctx, t.teamName, nameMaxW), nameX, midY + 9)

  if (t.note) {
    ctx.textAlign = 'right'
    ctx.font = `600 13px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(t.note, innerX + innerW, midY)
  }
}

function drawPrizeCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  card: PrizeExportCard,
  flags: Map<string, HTMLImageElement | null>,
) {
  const w = PRIZE_CARD_W
  const h = prizeCardHeight(card)

  // Card body
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  roundRect(ctx, x, y, w, h, 18)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, w, h, 18)
  ctx.stroke()

  // Header — icon, title, description, amount
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `400 30px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(card.icon, x + 18, y + 34)
  const titleX = x + 64
  const amountW = card.amount > 0 ? 62 : 0
  const headMaxW = w - (titleX - x) - amountW - 16
  ctx.font = `700 18px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(fitText(ctx, card.title, headMaxW), titleX, y + 25)
  ctx.font = `400 12px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(fitText(ctx, card.description, headMaxW), titleX, y + 45)
  if (card.amount > 0) {
    ctx.textAlign = 'right'
    ctx.font = `700 15px ${FONT}`
    ctx.fillStyle = '#facc15'
    ctx.fillText(`€${card.amount}`, x + w - 16, y + 30)
  }

  // Inner panel
  const panelX = x + 14
  const panelW = w - 28
  const panelY = y + PRIZE_HEADER_H
  const panelH = h - PRIZE_HEADER_H - PRIZE_BOTTOM
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  roundRect(ctx, panelX, panelY, panelW, panelH, 12)
  ctx.fill()

  const innerX = panelX + PRIZE_PANEL_PAD
  const innerW = panelW - PRIZE_PANEL_PAD * 2

  if (card.empty) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = `500 14px ${FONT}`
    ctx.fillText('TBD — not yet decided', panelX + panelW / 2, panelY + panelH / 2)
    return
  }

  let cursor = panelY + PRIZE_PANEL_PAD
  card.teams.forEach(t => {
    drawPrizeRow(ctx, innerX, innerW, cursor + PRIZE_ROW_H / 2, t, flags, 'lead')
    cursor += PRIZE_ROW_H
  })

  if (card.stat) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(innerX, cursor + 4)
    ctx.lineTo(innerX + innerW, cursor + 4)
    ctx.stroke()
    ctx.textAlign = 'right'
    ctx.font = `400 12px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(fitText(ctx, card.stat, innerW), innerX + innerW, cursor + 18)
    cursor += 30
  }

  if (card.runnersUp && card.runnersUp.teams.length) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(innerX, cursor + 2)
    ctx.lineTo(innerX + innerW, cursor + 2)
    ctx.stroke()
    cursor += 12
    ctx.textAlign = 'left'
    ctx.font = `700 10px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillText('NEXT CLOSEST', innerX, cursor + 8)
    cursor += 20
    card.runnersUp.teams.forEach(t => {
      drawPrizeRow(ctx, innerX, innerW, cursor + PRIZE_RU_ROW_H / 2, t, flags, 'chase')
      cursor += PRIZE_RU_ROW_H
    })
    ctx.textAlign = 'right'
    ctx.font = `400 12px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillText(fitText(ctx, card.runnersUp.stat, innerW), innerX + innerW, cursor + 10)
  }
}

/** Export a single prize card as a PNG. */
export async function exportPrizeCardPng(
  card: PrizeExportCard,
  teams: Team[],
  sweepstakesName = 'World Cup 2026',
): Promise<void> {
  await renderCardGrid({
    items: [card],
    cols: 1,
    cardW: PRIZE_CARD_W,
    heightOf: prizeCardHeight,
    drawCard: (ctx, x, y, item, flags) => drawPrizeCard(ctx, x, y, item, flags),
    teams,
    title: sweepstakesName,
    subtitle: card.title,
    filename: slugify(sweepstakesName, card.title),
  })
}

/** Export every prize card as one PNG. */
export async function exportPrizeCardsPng(
  cards: PrizeExportCard[],
  teams: Team[],
  sweepstakesName = 'World Cup 2026',
): Promise<void> {
  await renderCardGrid({
    items: cards,
    cols: 3,
    cardW: PRIZE_CARD_W,
    heightOf: prizeCardHeight,
    drawCard: (ctx, x, y, item, flags) => drawPrizeCard(ctx, x, y, item, flags),
    teams,
    title: sweepstakesName,
    subtitle: 'Prizes',
    filename: slugify(sweepstakesName, 'prizes'),
  })
}
