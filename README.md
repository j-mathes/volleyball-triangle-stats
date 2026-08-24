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

> **Note for iPad/iPhone users:** Use the link above — opening `index.html` as a local file on iOS is not supported due to browser storage restrictions.

> **Update available?** An **"Update available — tap to refresh"** toast appears at the bottom of the screen when a new version is ready. Tap it to reload instantly.

## Installing as an App (PWA)

Triangle Stats is a Progressive Web App — install it for a full-screen, offline-capable experience with no browser chrome.

### iOS (iPhone / iPad)

**Safari** is the primary method. Chrome and Edge on iOS 17+ also support installation via their Share button.

1. Open **Safari** and navigate to the hosted link
2. Tap the **Share** button (⎎) → **“Add to Home Screen”** → **Add**
3. **iOS 17.4+:** when prompted, choose **“As Web App”** (not “In Safari”)

### Android

1. Open **Chrome** and navigate to the hosted link
2. Tap **⋮** → **“Add to Home Screen”** (or tap the install banner) → **Add**

### Desktop (Chrome / Edge)

1. Navigate to the hosted link
2. Click the **install icon** (⊕) in the address bar → **Install**

## Screenshots

| Stats | Reports | App Setup |
|-------|---------|-------|
| ![Stats page](screenshots/stats.png) | ![Reports page](screenshots/reports.png) | ![Setup page](screenshots/setup.png) |

## Features

- Fast in-match tracking with 12 Triangle stat buttons
- Five dedicated pages: Stats, Game Setups, Reports, History, App Setup
- Pre-configure upcoming matches in the **Game Setups** tab — save, bundle, and load on any device
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
- Installable as a PWA for full-screen offline use on iPad, iPhone, Android, or desktop

## Coach Workflow

1. Open the app (or navigate to the hosted link).
2. Go to **App Setup** and configure defaults:
   - match format and set count
   - rotation tracking mode
   - season/event organization
   - opponents and event codes
3. *(Optional)* Go to **Game Setups**, fill in upcoming match details, and click **Save Game Setup**.
4. On game day, click **Load** on a saved setup — the Stats page is pre-filled and ready.
5. Click **Start Match** to begin tracking.
6. Record events with the Triangle stat buttons.
7. Use **Undo** and **Redo** during play when needed.
8. End sets with **End Set**, and finish with **End Match**.
9. Use **History** to resume unfinished matches or manage saved ones.
10. Use **Reports** for debriefs, film sessions, and practice planning.

## Pages

| Page | Purpose |
|------|---------|
| **Stats** | Live touch-by-touch tracking during sets |
| **Game Setups** | Pre-configure upcoming matches, save and load setups, import/export bundles |
| **Reports** | Turn tracked data into usable coaching summaries |
| **History** | Resume, review, export, import, and clean up saved matches |
| **App Setup** | Configure match format defaults, tracking behaviour, opponents, and event codes |

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

Event codes are user-defined on the **App Setup** page. Each code includes:
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

Notes on multi-match reports:
- Include aggregate Triangle stat graphics for a quick TS/FB/TRN overview
- Progress Trend has an orientation toggle — useful when many matches are selected and labels crowd
- Opponent Comparison includes an individual triangle per opponent alongside the summary

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

The **Game Setups** tab lets you pre-configure one or more upcoming matches before game day and load them on any device — including an iPad — so all fields are pre-filled when you arrive.

**Creating a game setup**

1. Go to the **Game Setups** tab.
2. Fill in the form — format and sets default to your **App Setup** values but can be overridden per game:
   - Match Name and Date & Time
   - Opponent
   - Match Format and Number of Sets
   - Season & Event *(optional — expand Match Organization)*
   - App Settings Override *(optional — expand to override rotation mode, lock time, etc.)*
3. Click **Save Game Setup** — it appears in the Saved Game Setups list below.
4. Repeat for each upcoming game.

**Loading a setup on game day**

1. Open the **Game Setups** tab.
2. Click **Load** on any row — the Stats page opens pre-filled with the match details.
3. A prompt asks whether to remove that setup from the list. Tap **OK** to clean up or **Cancel** to keep it for reuse.
4. Click **Start Match**.

**Sharing setups across devices**

- Click **Download** on any row to save it as `game-setup_<name>_<date>.json`.
- Click **Download Bundle** to export all saved setups in one file: `game-setup-bundle_<date>.json`.
- Transfer the file (AirDrop, email, cloud storage, etc.) to the target device.
- On the target device, go to **Game Setups** and click **Load from File…** to import:
  - Single setup file → added to the saved list.
  - Bundle file → a picker shows all setups with checkboxes; choose **Import Selected** or **Import All**.

**Managing saved setups**

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

Options in the **App Setup** page:

- **Reset Auto-Lock** — seconds before the Reset button re-locks during an active match
- **Notification Duration** — how long toast notifications stay visible (1–10 s, default 3)
- Show match totals in triangle
- Date format
- Rotation tracking mode (None, Ours Only, Both Sides)
- Keep rotation selected between stat presses
- Highlight and event-log color customization
- Set Colors — one color picker per set, used in the Tally Chart and Momentum report
- **Developer Tools** — link to the Sample Data Generator for inserting test matches, tournaments, and league seasons

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
