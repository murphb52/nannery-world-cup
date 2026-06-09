import type { Team, DrawResult } from '../types'

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
export async function exportGroupsPng(teams: Team[], draw: DrawResult): Promise<void> {
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
  ctx.fillText('🏆 Nannery World Cup 2026', width / 2, PAD + 30)
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
      const player = draw[team.id]
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
  a.download = 'nannery-world-cup-draw.png'
  a.href = url
  a.click()
}
