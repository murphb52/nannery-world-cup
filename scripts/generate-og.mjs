import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f1117"/>
      <stop offset="100%" stop-color="#1a1f2e"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.03)"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative circles -->
  <circle cx="980" cy="120" r="220" fill="none" stroke="#facc15" stroke-width="1" opacity="0.08"/>
  <circle cx="980" cy="120" r="170" fill="none" stroke="#facc15" stroke-width="1" opacity="0.06"/>
  <circle cx="220" cy="530" r="180" fill="none" stroke="#facc15" stroke-width="1" opacity="0.06"/>

  <!-- Trophy icon (SVG path) -->
  <g transform="translate(88, 80)" filter="url(#glow)">
    <!-- Cup body -->
    <path d="M60 0 L100 0 L95 70 Q80 90 80 100 L40 100 Q40 90 25 70 Z" fill="url(#gold)" opacity="0.95"/>
    <!-- Cup handles -->
    <path d="M0 10 L25 10 Q10 35 25 55 L25 70 Q-5 60 0 10 Z" fill="url(#gold)" opacity="0.8"/>
    <path d="M160 10 L135 10 Q150 35 135 55 L135 70 Q165 60 160 10 Z" fill="url(#gold)" opacity="0.8"/>
    <!-- Stem -->
    <rect x="60" y="100" width="40" height="18" fill="url(#gold)" opacity="0.85"/>
    <rect x="44" y="118" width="72" height="10" fill="url(#gold)" opacity="0.9"/>
    <!-- Base -->
    <rect x="35" y="128" width="90" height="14" rx="4" fill="url(#gold)"/>
    <!-- Shine -->
    <path d="M65 8 Q68 4 78 6 Q82 20 80 40 Q74 20 65 8 Z" fill="white" opacity="0.2"/>
  </g>

  <!-- Main title -->
  <text x="272" y="142" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="bold" fill="white" letter-spacing="-1">Nannery</text>
  <text x="272" y="220" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="bold" fill="url(#gold)" letter-spacing="-1">World Cup</text>
  <text x="274" y="282" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="bold" fill="white" opacity="0.35" letter-spacing="6">2026</text>

  <!-- Divider -->
  <rect x="88" y="320" width="500" height="2" rx="1" fill="url(#gold)" opacity="0.4"/>

  <!-- Stats row -->
  <!-- Stat 1 -->
  <rect x="88" y="350" width="148" height="90" rx="12" fill="url(#card)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="162" y="398" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="url(#gold)" text-anchor="middle">48</text>
  <text x="162" y="424" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.45)" text-anchor="middle" letter-spacing="1">PLAYERS</text>

  <!-- Stat 2 -->
  <rect x="252" y="350" width="148" height="90" rx="12" fill="url(#card)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="326" y="398" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="url(#gold)" text-anchor="middle">48</text>
  <text x="326" y="424" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.45)" text-anchor="middle" letter-spacing="1">TEAMS</text>

  <!-- Stat 3 -->
  <rect x="416" y="350" width="172" height="90" rx="12" fill="url(#card)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="502" y="398" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="url(#gold)" text-anchor="middle">&#8364;240</text>
  <text x="502" y="424" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.45)" text-anchor="middle" letter-spacing="1">PRIZE POOL</text>

  <!-- Prizes section -->
  <text x="88" y="498" font-family="Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.3)" letter-spacing="2">PRIZES</text>

  <!-- Prize pills -->
  <rect x="88" y="510" width="134" height="36" rx="18" fill="rgba(250,204,21,0.12)" stroke="rgba(250,204,21,0.3)" stroke-width="1"/>
  <text x="155" y="533" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#facc15" text-anchor="middle">Winner &#8364;100</text>

  <rect x="232" y="510" width="134" height="36" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <text x="299" y="533" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.6)" text-anchor="middle">2nd Place &#8364;50</text>

  <rect x="376" y="510" width="156" height="36" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <text x="454" y="533" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.6)" text-anchor="middle">Most Goals &#8364;30</text>

  <rect x="542" y="510" width="168" height="36" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <text x="626" y="533" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.6)" text-anchor="middle">+ 4 more prizes</text>

  <!-- Right side: URL / branding -->
  <text x="1112" y="580" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.2)" text-anchor="end" letter-spacing="0.5">nannery-world-cup.pages.dev</text>

  <!-- Right decorative football -->
  <circle cx="980" cy="340" r="110" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="40"/>
  <circle cx="980" cy="340" r="60" fill="none" stroke="rgba(250,204,21,0.06)" stroke-width="2"/>
  <circle cx="980" cy="340" r="20" fill="rgba(250,204,21,0.05)"/>
  <!-- Pentagon pattern suggestion -->
  <line x1="980" y1="230" x2="980" y2="450" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  <line x1="870" y1="340" x2="1090" y2="340" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  <line x1="902" y1="252" x2="1058" y2="428" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  <line x1="1058" y1="252" x2="902" y2="428" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
</svg>
`

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
})

const pngData = resvg.render()
const pngBuffer = pngData.asPng()

const outPath = join(__dirname, '../public/og.png')
writeFileSync(outPath, pngBuffer)
console.log('Generated public/og.png')
