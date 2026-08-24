# Triangle Stats

Triangle Stats is a browser-based volleyball tracking tool built around **The Triangle**, created by [Joe Trinsey](https://smartervolley.substack.com/).

The Triangle breaks a match into three areas:
- Terminal Serves
- First Ball Points
- Transition Points

It gives coaches a fast triage view of where sets are being won or lost.

Read Joe's original write-up at [Smarter Volley: The Triangle](https://smartervolley.substack.com/p/thetriangle).

## Live App

**[https://j-mathes.github.io/volleyball-triangle-stats/](https://j-mathes.github.io/volleyball-triangle-stats/)**

Works on desktop and iPad/iPhone. No install required — open the link in any modern browser.

> **Note for iPad/iPhone users:** Use the link above. Opening `index.html` as a local file on iOS is not supported due to browser storage restrictions.

> **Not seeing recent changes?** Your browser may be serving a cached version of the page. Clear your browser cache and reload to pick up the latest updates. On iPhone/iPad: go to **Settings → Safari → Clear History and Website Data**, then reopen the link. On desktop: press **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac) to force a hard reload.

## Screenshots

| Stats | Reports | Setup |
|-------|---------|-------|
| ![Stats page](screenshots/stats.png) | ![Reports page](screenshots/reports.png) | ![Setup page](screenshots/setup.png) |

## Features

- Fast in-match tracking with 12 Triangle stat buttons
- Dedicated pages for live tracking, reports, history, and setup
- Rotation tracking options (none, ours only, both sides)
- Optional context on each touch: jersey number, rotation, and event code
- Opponent management and assignment before match start
- Custom event codes for your staff's language and tagging style
- Undo/redo for quick correction during live charting
- Single-match and multi-match reports for review
- Import/export for sharing and backup
- Customizable set colors used across reports and charts
- Lead Changes tracking in Match Summary — highlights every moment the lead flipped, colored by team
- Match Log with per-event lead-change highlights and a dedicated lead-change column

## Coach Workflow

1. Open `index.html` in Chrome, Firefox, or Edge.
2. Go to **Setup** and configure as needed:
   - match format and set count
   - rotation tracking mode
   - season/event organization
   - opponents
   - event codes
3. Go to **Stats**, enter match metadata, then click **Start Match**.
4. Record events with the Triangle stat buttons.
5. Use **Undo** and **Redo** during play when needed.
6. End sets with **End Set**, and finish with **End Match**.
7. Use **History** to resume unfinished matches or manage saved ones.
8. Use **Reports** for debriefs, film sessions, and practice planning.

## Pages

| Page | Purpose |
|------|---------|
| **Stats** | Live touch-by-touch tracking during sets |
| **Reports** | Turn tracked data into usable coaching summaries |
| **History** | Resume, review, export, import, and clean up saved matches |
| **Setup** | Configure match format, tracking behavior, opponents, and event codes |

## What the Triangle Measures

The Triangle has three categories, each with four tracked actions (12 total buttons):

| Category | Formula | Buttons |
|----------|---------|---------|
| **Terminal Serves** | (our aces + their misses) − (their aces + our misses) | Our Ace, Their Ace, Our Miss, Their Miss |
| **First Ball Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |
| **Transition Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |

## Metadata and Event Codes

Each stat can include optional metadata:
- Jersey number
- Rotation (based on your selected tracking mode)
- Event code

Blank fields are not recorded.

Event codes are user-defined on the Setup page. Each code includes:
- code (stored value)
- abbreviation (button and tally label)
- description
- category

Code category controls which stat types accept the code and the button color:

| Color | Category | Applies to |
|-------|---------|------------|
| Purple | Both | Serve misses and stops |
| Orange | Serve miss only | Serve misses only |
| Blue | Stop/error only | Stops and defensive errors only |

If a selected code does not apply to the pressed stat, it is ignored.

## Reports

Reports can be generated from:
- Current Match
- Any selected group of saved or imported matches

Selection rules:
- Single-match reports require exactly 1 match
- Multi-match reports require 2 or more matches

Available report groups:
- Single Match: Tally Sheet, Tally Chart, Match Summary, Match Log, Momentum Chart, Set Flow, Error Breakdown, Player Stats, Rotation Performance
- Multi Match: Event Summary, Progress Trend, Rotation Heat Map, Player Leaderboard, Opponent Comparison

Common coaching questions these reports help answer:
- Where did we give away points?
- Which rotations are strongest or weakest?
- Are we trending up across recent matches?

Multi-match reports include aggregate Triangle stat graphics so the overall TS/FB/TRN picture is visible at a glance. The Progress Trend chart has a horizontal/vertical orientation toggle — useful when many matches are selected and labels become crowded. The Opponent Comparison report includes an individual triangle for each opponent alongside the overall summary.

## Data and Persistence

All data is saved locally in your browser (IndexedDB) in the `triangle-stats` database.

Object stores:
- `matches`
- `seasons`
- `events`
- `opponents`
- `eventCodes`
- `gameSetups`

When the app reopens, the most recent in-progress match is restored automatically.

## Game Setups

Game Setups let you pre-configure a match before game day and load it on any device — including an iPad — so all fields are pre-filled when you arrive.

A Game Setup stores match configuration (always) plus any combination of optional fields:
- Match Name
- Match Date & Time
- Opponent
- Season & Event
- App Settings (rotation mode, lock time, etc.)

**Saving a Game Setup**

1. Go to **Setup** and configure the match format, number of sets, season/event, etc.
2. Make sure the match name, date, and opponent are set on the **Stats** page.
3. Back on **Setup**, scroll to **Game Setups**.
4. Check the fields you want to include.
5. Click **Save Current Setup** — it appears in the list.
6. Repeat for each upcoming game.

**Downloading**

- Click **Download** on any row to save that single setup as `game-setup_<name>_<date>.json`.
- Click **Download Bundle** to export all saved setups in one file: `game-setup-bundle_<date>.json`.

**Loading on Another Device**

1. Transfer the file (AirDrop, email, cloud storage, etc.) to the target device.
2. Open Triangle Stats and go to **History**.
3. Click **Import** and select the file.
   - Single setup → all fields are applied immediately and the app navigates to **Stats**.
   - Bundle → a picker appears listing every setup; select one to load.
4. After loading you're prompted to remove the setup from the saved list — tap **OK** to clean up, or **Cancel** to keep it.
5. Click **Start Match** when ready.

**Managing Saved Setups**

| Action | How |
|--------|-----|
| Remove one setup | Click **×** on its row |
| Remove all setups | Click **Clear All Game Setups** |
| Clean up after loading | Confirm "Remove?" when prompted after Load |

## Import and Export

| Action | Output | Filename Pattern |
|--------|--------|------------------|
| **Export JSON** | Single match with related context | `{name}_{YYYY-MM-DD}.json` |
| **Export CSV** | Coach-readable set summary | `{name}_{YYYY-MM-DD}.csv` |
| **Export All** | Full backup (matches + lookup data) | `triangle-stats-backup-{YYYY-MM-DD-HH-MM-SS}.json` |
| **Save Game Setup** | Single pre-match configuration | `game-setup_{name}_{YYYY-MM-DD}.json` |
| **Download Bundle** | All saved game setups in one file | `game-setup-bundle_{YYYY-MM-DD}.json` |
| **Import** | Single match, bulk, game setup, or bundle | — |

Import skips duplicates and does not silently overwrite existing records.

## App Settings

Setup options include:
- Reset Auto-Lock timeout
- Show match totals in triangle
- Rotation tracking mode (None, Ours Only, Both Sides)
- Keep rotation selected between stat presses
- Highlight and event-log color customization
- Set Colors — one color picker per set, used in the Tally Chart and Momentum report
- **Developer Tools** — link to the Sample Data Generator for inserting test matches, tournaments, and league seasons into the app

## Project Structure

```text
index.html             # App shell and page layout
app.js                 # Domain logic, IndexedDB, and UI wiring
styles.css             # Styling
generate-test-match.js # Script to generate a reproducible test match JSON file
seed-sample-data.html  # Browser-based tool to seed randomized sample data into IndexedDB
test-data.json         # Test fixture data
test-match.json        # Test fixture data (output of generate-test-match.js)
docs/
  ARCHITECTURE.md      # Technical architecture notes
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.

See [LICENSE](LICENSE) for the full license text.
