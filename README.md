# Nannery World Cup 2026

A family sweepstakes app for the 2026 FIFA World Cup. The app tracks live standings, fixtures, and prizes throughout the tournament.

## Live Sites

| Sweepstakes | URL |
|-------------|-----|
| 🏆 Nannery World Cup | https://murphb52.github.io/nannery-world-cup/#/nannery/groups |
| ⚽ Last Man Standing | https://murphb52.github.io/nannery-world-cup/#/last-man-standing/groups |

## Features

### Pages

| Page | Description |
|------|-------------|
| **Groups** | Live group-stage standings for all 12 groups (A–L). Highlights the player assigned to each team. "Find Me" search filters all groups to your name. |
| **Fixtures** | Full match schedule grouped by day. A scrollable date-chip strip auto-selects today (or the next upcoming match day). Shows live scores with a pulsing indicator, final scores, and the player behind each team. "Find Me" dims all other matches. |
| **Bracket** | Full 64-team knockout bracket (R32 → R16 → QF → SF → Final) rendered as an SVG with connector lines. Click any match card for a detail modal showing the teams, scores, and sweepstakes owner. |
| **Players** | Grid of all 41 sweepstakes players with their drawn team's flag and group. Searchable. Shows "Awaiting the draw" before the draw runs. |
| **Prizes** | Live prize leaderboard showing who is currently winning each special prize category (see below). Updates daily as scores come in. |

### Prize Categories

- 🏆 **Winner** — team wins the tournament
- 🥈 **2nd Place** — team reaches the final
- ⚽ **Most Goals Scored** — highest-scoring team
- 🫣 **Most Goals Conceded** — leakiest defence
- 🟨 **Most Yellow Cards** — dirtiest team
- 🟥 **First Red Card** — first team to see red
- 👋 **First Eliminated** — first team out of the group stage

### Admin (hidden)

Tap the 🏆 logo 5 times to access the admin panel. From there you can:
- Manage the player list
- Manage teams and group assignments
- Run the animated draw ceremony (name-by-name and team-by-team reveal)

### Draw Ceremony

An animated reveal experience that draws each player's team one at a time with transitions. Designed to be projected during a live draw event.

### Data Pipeline

Scores, standings, and prize stats are fetched automatically from [football-data.org](https://www.football-data.org/) (free tier) via `scripts/fetch-scores.js` (Node.js). The script:

- pulls all matches and group standings in two API calls
- fetches per-match **bookings** (yellow/red cards) for finished and in-play matches, caching finished ones in `data/bookings.json` so each run stays well inside the free 10 requests/minute limit
- computes tournament-wide card totals per team, the first red card, and group-stage eliminations (2026 format: top two per group plus the 8 best third-placed teams advance)
- writes everything to `data/scores.json`, skipping the write when nothing changed

The `fetch-scores.yml` GitHub Actions workflow runs every 30 minutes during the tournament (11 June – 19 July 2026) and daily otherwise. When the data changes it commits and explicitly triggers the Pages deploy (`gh workflow run deploy.yml`), since pushes made with `GITHUB_TOKEN` don't fire `on: push` workflows. The whole pipeline is free: football-data.org free tier covers the World Cup, and GitHub Actions/Pages are free for public repos.

## Tech Stack

- **React 19** + **TypeScript** — component framework
- **Vite** — build tooling and dev server
- **Tailwind CSS v4** — styling
- **React Router** (HashRouter) — client-side routing, hash-based for GitHub Pages compatibility
- **football-data.org API** — live match and standings data

## Development

```bash
npm install
npm run dev       # start dev server
npm run build     # production build → dist/
```

### Updating scores manually

```bash
FOOTBALL_DATA_API_KEY=your_key node scripts/fetch-scores.js
```

## Deployment

The app deploys to GitHub Pages from the `dist/` folder. The GitHub Actions workflow:
1. Fetches fresh scores on a cron schedule
2. Commits `data/scores.json` if changed
3. Builds and deploys to Pages on every push to `main`
