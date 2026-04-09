# Triangle Stats

Web-based volleyball stat tracker. No build tools, npm, or server required — open `index.html` in any modern browser.

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge).
2. Optionally go to **Setup** to configure match format, number of sets, and match organization (season/event).
3. On the **Stats** page, enter a match name, set the date/time, and click **Start Match**.
4. Tap the 12 stat buttons in the triangle layout to record events.
5. Use **Undo** / **Redo** to correct mistakes.
6. **End Set** progresses to the next set; **End Match** when finished.
7. On the **History** page, browse saved matches grouped by season and event.
   - **Export JSON** for a single match with full replay data.
   - **Export CSV** for a coach-readable summary.
   - **Export All** to back up all seasons, events, and matches.
   - **Import** to load data from a JSON export file (single match or bulk).
   - **Resume Match** to continue an unfinished match.
   - **Delete** individual matches or **Clear All** data.

## File Structure

```
index.html   — HTML shell and layout (3-page SPA)
app.js       — Domain engine, IndexedDB persistence, and UI wiring
styles.css   — Visual styling
docs/
  ARCHITECTURE.md — Technical architecture reference
```

## Pages

| Page | Purpose |
|------|---------|
| **Stats** | Live match tracking — triangle stat buttons, score display, snapshot table, undo/redo |
| **Setup** | Match configuration (format, sets, season/event) and App Settings |
| **History** | Browse, preview, export, import, resume, and delete saved matches |

## Tracked Categories

The triangle layout has three vertices, each tracking four stats (12 buttons total):

| Category | Formula | Buttons |
|----------|---------|---------|
| **Terminal Serves** | (our aces + their misses) − (their aces + our misses) | Our Ace, Their Ace, Our Miss, Their Miss |
| **First Ball Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |
| **Transition Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |

Stat boxes show the current set totals. Aggregate match totals can be displayed inside the triangle (toggle in App Settings).

## Match Configuration

- **Match format**: Best Of (odd: 3, 5, 7…) or Straight Sets (1, 2, 4, 6…)
- **Number of sets**: Adjustable via stepper, constrained by format rules
- **Auto-progression**: Ending a set automatically starts the next one

## Data Organization

Matches can optionally be organized into a hierarchy:

- **Season** (e.g., "Spring 2026") — broadest grouping
- **Event** (e.g., "Spring Invitational") — with a type: Tournament, League, or Practice
- **Match** — the individual stat-tracked game

All organization is optional. Matches work fine without any season or event. Default names are generated when fields are left blank.

## History

The History page groups matches by Season → Event using collapsible sections. Each match shows its name, status badge (Complete / In Progress), and date. Matches are sorted oldest-first.

Actions available:
- **Resume** an in-progress match
- **Export** a single match (JSON or CSV)
- **Delete** individual matches (with confirmation)
- **Clear All** data (prompts to Export All first, then confirms deletion)

## Persistence

Match data is stored in the browser's IndexedDB (database: `triangle-stats`, version 2, stores: `matches`, `seasons`, `events`). On page load, the most recent in-progress match is automatically restored. Completed matches are not auto-restored.

## Import / Export

| Action | Output | Filename Pattern |
|--------|--------|-----------------|
| **Export JSON** | Single match + season/event context | `{name}_{YYYY-MM-DD}.json` |
| **Export CSV** | Coach-readable set-by-set summary | `{name}_{YYYY-MM-DD}.csv` |
| **Export All** | Bulk backup of all data | `triangle-stats-backup-{YYYY-MM-DD-HH-MM-SS}.json` |
| **Import** | Reads single or bulk JSON, skips duplicates by ID | — |

Import never silently overwrites — duplicates are skipped. Use this for backup, sharing between devices, or combining data from multiple trackers.

## App Settings

Found at the bottom of the Setup page:

- **Reset Auto-Lock** — Configurable seconds before the Reset button re-locks (default: 3). During an active match, Reset is guarded by a padlock that must be clicked to unlock.
- **Show match totals in triangle** — Toggle aggregate scores displayed inside the triangle SVG.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
