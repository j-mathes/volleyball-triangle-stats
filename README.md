# Triangle Stats

Web-based volleyball stat tracker built around **The Triangle** — an analytical framework created by [Joe Trinsey](https://smartervolley.substack.com/). Joe developed the Triangle during his time as an assistant coach for the USA Women's National Team, and has refined it over years of coaching at every level. It breaks a volleyball match into three distinct areas — Terminal Serves, First Ball, and Transition — giving coaches a fast, triage-style lens for identifying where matches are won and lost and where to focus their next practice. Read Joe's original writeup at [Smarter Volley: The Triangle](https://smartervolley.substack.com/p/thetriangle).

No build tools, npm, or server required — open `index.html` in any modern browser.

## Screenshots

| Stats | Reports | Setup |
|-------|---------|-------|
| ![Stats page](screenshots/stats.png) | ![Reports page](screenshots/reports.png) | ![Setup page](screenshots/setup.png) |

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge).
2. Optionally go to **Setup** to configure match format, number of sets, rotation tracking, season/event organization, manage opponents, and customize event codes.
3. On the **Stats** page, enter a match name, set the date/time, and optionally select an opponent from the picker.
4. Click **Start Match**. The opponent picker locks for the duration of the match.
5. Optionally enter a jersey number, select a rotation, and/or select an event code before pressing a stat button. The **Last** display on the right of the metadata panel always shows what was just recorded.
6. Tap one of the the 12 stat buttons in the triangle layout to record events.
7. Use **Undo** / **Redo** to correct mistakes.
8. **End Set** progresses to the next set; **End Match** when finished.
9. On the **History** page, browse saved matches grouped by season and event.
   - **Export JSON** for a single match with full replay data.
   - **Export CSV** for a coach-readable summary.
   - **Export All** to back up all seasons, events, opponents, and matches.
   - **Import** to load data from a JSON export file (single match or bulk).
   - **Resume Match** to continue an unfinished match.
   - **Delete** individual matches or **Clear All** data.
10. On the **Reports** page, choose a scope and select data, then pick a report from the sidebar.

## File Structure

```
index.html   — HTML shell and layout (4-page SPA)
app.js       — Domain engine, IndexedDB persistence, and UI wiring
styles.css   — Visual styling
docs/
  ARCHITECTURE.md — Technical architecture reference
```

## Pages

| Page | Purpose |
|------|---------|
| **Stats** | Live match tracking — control panel, triangle stat buttons, metadata panel (rotation/jersey/event code), score display, snapshot table, undo/redo |
| **Reports** | Scope selector, data picker, and sidebar with 12 report types (single-match and multi-match) |
| **History** | Browse, preview, export, import, resume, and delete saved matches |
| **Setup** | Match configuration (format, sets, season/event), opponent management, event code management, and App Settings |

## Stats Page Layout

The stats page control panel is split into two rows:

| Row | Contents |
|-----|---------|
| Top | Match name · Date/time · Opponent picker |
| Bottom | Start Match · End Set · End Match · Undo · Redo · Reset · Set indicator |

The opponent picker is available before a match starts. Once **Start Match** is clicked it becomes read-only for the rest of the match. To add a new opponent inline, choose "— New Opponent —" from the dropdown, type the name, then press **Enter** or click **✓**.

## Tracked Categories

Based on [Joe Trinsey's Triangle framework](https://smartervolley.substack.com/p/thetriangle), the triangle layout has three vertices, each tracking four stats (12 buttons total):

| Category | Formula | Buttons |
|----------|---------|----------|
| **Terminal Serves** | (our aces + their misses) − (their aces + our misses) | Our Ace, Their Ace, Our Miss, Their Miss |
| **First Ball Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |
| **Transition Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |

## Metadata per Stat Event

The **metadata panel** is always visible between the control bar and the triangle. Controls are disabled until a set is active. The panel is a single horizontal card with four zones left to right:

| Zone | Description |
|------|-------------|
| **Jersey #** | Label and text input side by side. Type any jersey number. Cleared after each stat press. |
| **Event code buttons** | 10 color-coded buttons. Cleared after each stat press. |
| **Last** | Read-only display of the most recent recorded stat — updates on every press and on undo/redo. Shows stat name plus any jersey, event code, and rotation that were captured. |

Rotation buttons (R1–R6) appear as flanking cards beside the triangle rows. See **Rotation Tracking** under App Settings.

If a field is left blank or a code is not applicable to the stat type, it is simply not recorded.

### Event Codes

Event codes are **user-defined** and managed on the Setup page. Each code has:
- **Code** — the identifier stored in match records (e.g. `UFE`)
- **Abbr** — the short label shown on the button and in tally cells (e.g. `UfE`)
- **Description** — human-readable label used in the event log and tally legend
- **Category** — controls which stat buttons accept the code and the button color:

| Color | Category | Applies to |
|-------|---------|------------|
| Purple | Both | Serve misses **and** stops |
| Orange | Serve miss only | Serve misses only |
| Blue | Stop/error only | Stops and defensive errors only |

The app ships with 10 default codes (Net, Out, Foot, Rot, UfE, Drop, Roof, Catch, Double, Penalty). You can add custom codes, delete any code, or **Reset to Defaults** to restore the originals.

If you press a stat button that does not accept the selected code, the code is silently ignored.

## Match Configuration

- **Match format**: Best Of (odd: 3, 5, 7…) or Straight Sets (1, 2, 4, 6…)
- **Number of sets**: Adjustable via stepper, constrained by format rules
- **Auto-progression**: Ending a set automatically starts the next one

## Data Organization

Matches can optionally be organized into a hierarchy:

- **Season** (e.g., "Spring 2026") — broadest grouping
- **Event** (e.g., "Spring Invitational") — with a type: Tournament, League, or Practice
- **Opponent** (e.g., "Riverside Volleyball Club") — assigned before starting a match
- **Match** — the individual stat-tracked game

All organization is optional.

## Event Codes

Event codes are managed on the **Setup page** in the Event Codes card:

- **Add**: enter a Code, Abbreviation, Description, and Category, then press **Add**
- **Delete**: click **✗** next to any code
- **Reset to Defaults**: restores the 10 built-in codes (with confirmation)

Changes take effect immediately — buttons on the Stats page rebuild automatically. The Event Codes card is locked while a match is active.

## Opponents

Opponents are managed on the **Setup page** in the Opponents card:

- **Add**: type a name and press **Add** (or Enter)
- **Rename**: click an opponent's name to edit it inline; press Enter or click away to save
- **Delete**: click **✗** next to any opponent, or use **Delete All** (with confirmation)

Deleting an opponent that is assigned to a match safely nullifies that match's `opponentId` in the database.

## Reports

The Reports page lets you analyze recorded data across any scope:

| Scope | Data source |
|-------|-----------|
| Current Match | Whatever is loaded in the Stats page right now |
| Select Matches | Any combination of matches chosen from the data picker (IndexedDB or loaded JSON files) |

Use the **Select Data** panel to navigate the Season → Event → Match hierarchy with checkboxes. You can also click **Load JSON File…** to bring in matches from an exported file without importing them permanently.

**Single-match reports** require exactly 1 match selected. **Multi-match reports** require ≥ 2.

| Group | Reports |
|-------|---------|
| Single Match | Tally Sheet, Match Summary, Momentum Chart, Set Flow, Error Breakdown, Player Stats, Rotation Performance |
| Multi Match | Event Summary, Progress Trend, Rotation Heat Map, Player Leaderboard, Opponent Comparison |

Use the **Print / Save PDF** button to print the current report or save it as a PDF via your browser's print dialog.

## History

The History page groups matches by Season → Event using collapsible sections. Each match shows its name, status badge (Complete / In Progress), and date. Matches are sorted oldest-first.

Actions available:
- **Resume** an in-progress match
- **Export** a single match (JSON or CSV)
- **Delete** individual matches (with confirmation)
- **Clear All** data (prompts to Export All first, then confirms deletion)

## Persistence

Match data is stored in the browser's IndexedDB (`triangle-stats`, version 4):

| Store | Contents |
|-------|----------|
| `matches` | Match records with full event timeline |
| `seasons` | Season names |
| `events` | Event names with type and optional season link |
| `opponents` | Opponent names |
| `eventCodes` | User-defined event codes (code, abbr, label, category, order) |

On page load, the most recent in-progress match is automatically restored. Completed matches are not auto-restored.

## Import / Export

| Action | Output | Filename Pattern |
|--------|--------|-----------------|
| **Export JSON** | Single match + season/event/opponent context | `{name}_{YYYY-MM-DD}.json` |
| **Export CSV** | Coach-readable set-by-set summary | `{name}_{YYYY-MM-DD}.csv` |
| **Export All** | Bulk backup of all data including opponents and event codes | `triangle-stats-backup-{YYYY-MM-DD-HH-MM-SS}.json` |
| **Import** | Reads single or bulk JSON, skips duplicates by ID/code | — |

Import never silently overwrites — duplicates are skipped and counted in the summary.

## App Settings

Found on the Setup page:

- **Reset Auto-Lock** — Seconds before Reset re-locks during an active match (default: 3). The padlock must be clicked to unlock Reset while a match is active.
- **Show match totals in triangle** — Toggles aggregate scores inside the triangle SVG.
- **Rotation Tracking** — Choose what rotation data to collect:
  - *None* — rotation buttons hidden
  - *Ours Only* — left-side R1–R6 buttons shown
  - *Both Sides* — our rotation (left) and their rotation (right) both shown
- **Keep rotation selected between stats** — When on, the selected rotation persists across stat presses within a set. Always clears at End Set, End Match, and Reset.
- **Highlight / event log colors** — Customize the selection highlight color and per-team event log row colors.

## Docs

- [Architecture](docs/ARCHITECTURE.md)

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.

See [LICENSE](LICENSE) for the full text.


## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge).
2. Optionally go to **Setup** to configure match format, number of sets, rotation tracking, match organization (season/event), manage opponents, and customize event codes.
3. On the **Stats** page, enter a match name, set the date/time, and click **Start Match**.
4. Optionally enter a jersey number, select a rotation, and/or select an event code before pressing a stat button. The **Last** display on the right of the metadata panel always shows what was just recorded.
5. Tap the 12 stat buttons in the triangle layout to record events.
6. Use **Undo** / **Redo** to correct mistakes.
7. **End Set** progresses to the next set; **End Match** when finished.
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
| **Stats** | Live match tracking — triangle stat buttons, metadata panel (rotation/jersey/event code), score display, snapshot table, undo/redo |
| **Setup** | Match configuration (format, sets, rotation tracking, season/event) and App Settings |
| **History** | Browse, preview, export, import, resume, and delete saved matches |

## Tracked Categories

Based on [Joe Trinsey's Triangle framework](https://smartervolley.substack.com/p/thetriangle), the triangle layout has three vertices, each tracking four stats (12 buttons total):

| Category | Formula | Buttons |
|----------|---------|---------|
| **Terminal Serves** | (our aces + their misses) − (their aces + our misses) | Our Ace, Their Ace, Our Miss, Their Miss |
| **First Ball Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |
| **Transition Points** | (our kills + our stops) − (their kills + their stops) | Our Kill, Their Kill, Our Stop, Their Stop |

Stat boxes show the current set totals. Aggregate match totals can be displayed inside the triangle (toggle in App Settings).

## Metadata per Stat Event

The **metadata panel** is always visible between the control bar and the triangle. Controls are disabled until a set is active. The panel is a single horizontal card with four zones left to right:

| Zone | Description |
|------|-------------|
| **Jersey #** | Label and text input side by side. Type any jersey number. Cleared after each stat press. |
| **Event code buttons** | 10 color-coded buttons. Cleared after each stat press. |
| **Last** | Read-only display of the most recent recorded stat — updates on every press and on undo/redo. Shows stat name plus any jersey, event code, and rotation that were captured. |

Rotation buttons (R1–R6) appear as flanking cards beside the triangle rows, not inside the metadata panel. See **Rotation Tracking** under App Settings.

If a field is left blank or a code is not applicable to the stat type, it is simply not recorded.

### Event Codes

Codes are color-coded by the stat types they apply to:

| Color | Applies to | Codes |
|-------|-----------|-------|
| Purple | Serve misses **and** stops | Net, Out |
| Orange | Serve misses only | Foot, Rot, Penalty |
| Blue | Stops only | UfE, Drop, Roof, Catch, Double |

If you press a stat button that does not accept the selected code, the code is silently ignored.  For example, selecting "Foot" (a miss-only code) then pressing "Our Kill" will record the kill with no event code.

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
- **Rotation Tracking** — Choose what rotation data to collect:
  - *None* — rotation buttons hidden, nothing recorded
  - *Ours Only* — only the left-side (our) R1–R6 buttons shown
  - *Both Sides* — our rotation (left) and their rotation (right) both shown
- **Keep rotation selected between stats** — When on, the selected rotation persists across stat button presses within a set. Always clears at End Set, End Match, and Reset.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
