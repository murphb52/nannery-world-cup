# Nannery World Cup 2026

A family sweepstakes app for the 2026 FIFA World Cup. 48 players each draw a team at random; the app tracks live standings, fixtures, and prizes throughout the tournament.

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

Scores and standings are fetched automatically from [football-data.org](https://www.football-data.org/) via a `scripts/fetch-scores.js` script (Node.js). A GitHub Actions workflow runs this on a schedule during the tournament and commits the updated `data/scores.json` to the repo, which is then deployed to GitHub Pages.

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
