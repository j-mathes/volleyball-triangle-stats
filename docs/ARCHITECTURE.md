# Architecture

## Overview

Triangle Stats is a vanilla HTML/JS/CSS single-page application with five pages (Stats, Game Setups, Reports, History, App Setup) toggled via `style.display`. There is no build step, framework, or package manager. All code lives in three files at the repo root:

- `index.html` — HTML shell and layout
- `app.js` — Domain engine, IndexedDB persistence, and UI wiring
- `styles.css` — Visual styling

Additional root-level files:

- `sw.js` — Service worker: precaches core assets, stale-while-revalidate fetch strategy, `SKIP_WAITING` message handler
- `manifest.json` — PWA web app manifest (name, icons, theme colour, display mode)
- `icons/` — SVG and PNG icon assets (192, 512, 1024 px) used by the manifest and `apple-touch-icon`

## Critical: JavaScript Syntax Correctness

**ALL pages depend on a single `DOMContentLoaded` handler that must run completely without error.** If ANY syntax error or uncaught runtime error exists in `app.js`, the entire handler fails silently, `showPage("stats")` never runs, and every page stays hidden (blank screen) or the wrong page is displayed.

**After every change to `app.js`, validate syntax with:**
```
node --check app.js
```

Common mistakes that cause this:
- Missing closing `}` on a function — especially when adding a new statement at the end of a function body (the new statement gets swallowed into the function scope and the next function is nested inside it)
- Defining `async function foo()` inside a block and forgetting its closing brace
- Mismatched braces in inline IIFE closures (e.g., `(function(x){...})(arg)`)

**Rule:** Every edit that touches a function body must be verified with `node --check app.js` before considering it done.

---

## Stats Page Layout

The stats page uses a multi-row CSS grid (`stats-layout`) below the control bar. Understanding the column system is critical before making any layout changes.

### Column System

`stats-layout` and `triangle-row` both use **`grid-template-columns: auto 1fr auto`**. The `auto` columns are sized by their content — specifically the `14vw` width of the First Ball and Transition vertex cards. This means the outer column width is always exactly as wide as those cards, and rotation card widths naturally match without being hardcoded.

**Rule:** Never change one grid's column template without changing the other. Any divergence breaks outer-edge alignment.

### Grid Row Structure (desktop)

```
Row 1: [metadataPanel ─────────── grid-column: 1/-1 ──────────]
Row 2: [rotOursPanel] [Terminal Serves (14vw, centered)] [rotTheirsPanel]
Row 3: [triangle-row ──────────── grid-column: 1/-1 ──────────]
Row 4: [bottom-bar ─────────────  grid-column: 1/-1 ──────────]
```

**Row 2 height is set by Terminal Serves only.** The rotation cards span `grid-row: 2 / 4` with `align-self: start`. This means they start at the top of row 2 but do not influence the height of row 2 or when row 3 begins. The top of the triangle always appears directly below Terminal Serves regardless of how tall the rotation cards are.

**Rule:** If rotation cards need to appear beside multiple rows, use `grid-row` spanning + `align-self: start`. Never put rotation cards and triangle content as siblings in the same row.

### `serves-row` Wrapper

`#rotOursPanel`, `.vertex.top`, and `#rotTheirsPanel` are wrapped in `<div class="serves-row">` in the HTML. On desktop, `.serves-row { display: contents }` makes the wrapper completely transparent to the outer CSS grid — its children remain direct grid items exactly as described above.

On mobile breakpoints (`≤600px` and landscape), `.serves-row` is overridden to `display: flex; flex-direction: row` so the rotation panels always physically flank Terminal Serves regardless of JS toggling their `display` property. This avoids an iOS Safari bug where grid items toggled from `display:none` → `display:flex` sometimes ignore their explicit `grid-row`/`grid-column` values and fall back to auto-placement in the wrong row.

**Rule:** Never remove the `serves-row` wrapper or change its desktop `display: contents` rule. If you need to place additional items beside Terminal Serves on desktop, add them inside `serves-row` and give them explicit `grid-column`/`grid-row` — they will participate in the outer grid normally.

### Subgrid for Alignment

`triangle-row` uses `grid-template-columns: subgrid` to inherit the outer grid's three column tracks verbatim. The First Ball card lands in column 1 (same track as `rotOursPanel`), the triangle center in column 2, and Transition in column 3 (same track as `rotTheirsPanel`). The snapshot (`bottom-bar`) also spans `1/-1`.

**Rule:** Do not replace `subgrid` with explicit pixel or vw values on `triangle-row`. It must stay as `subgrid` so column widths stay in sync with the outer grid automatically.

### What Breaks Alignment

| Change | Problem |
|--------|---------|
| Removing `display: contents` from `.serves-row` on desktop | Children become block items and fall out of the grid |
| Giving rotation cards `align-self: stretch` or removing `grid-row` span (desktop) | Row 2 becomes as tall as rotation cards |
| Using different column counts or widths on `triangle-row` vs `stats-layout` | First Ball / Transition no longer align with rotation card edges |
| Moving `triangle-row` or `bottom-bar` inside a nested flex/grid container | They lose access to the outer subgrid and break column inheritance |

---

## Responsive Layout

Three media query breakpoints are defined in `styles.css`. Desktop rules are never modified inside these blocks — they only add or override.

### Tablet (`@media (max-width: 700px)`)

Only non-stats-page adjustments: history and reports pages collapse to single-column. The stats layout is unchanged at this breakpoint.

### Portrait Phone (`@media (max-width: 600px)`)

`stats-layout` switches from CSS grid to `display: flex; flex-direction: column`. The item order from top to bottom:

```
[metadataPanel  ── full width ──]
[serves-row: rotOurs | Terminal Serves | rotTheirs ]
[triangle-row   ── full width ──]
[bottom-bar     ── full width ──]
```

`serves-row` becomes `display: flex; flex-direction: row` so rotation panels flank Terminal Serves regardless of how many are visible.

The **metadata panel** becomes a 3-row `flex-direction: column` stack:
- Row 1: Jersey # label + input (horizontal, `flex-direction: row`)
- Row 2: Event code buttons (`flex-wrap: wrap` — horizontal, spills to a second line if too wide)
- Row 3: Last stat indicator (full width, horizontal)

The rotation panel buttons use a 2×3 grid (`grid-template-columns: 1fr 1fr`) instead of the desktop flex row.

### Landscape Phone (`@media (max-height: 500px) and (orientation: landscape)`)

`stats-page` becomes `display: flex; flex-direction: row`. The control panel is a fixed-width left column (~190px). `stats-layout` becomes the right column (`flex: 1 1 0`, scrollable).

`stats-layout` uses the same `display: flex; flex-direction: column` + `serves-row` flex approach as portrait, but with tighter padding and font sizes throughout. The triangle row uses a `display: grid; grid-template-columns: 1fr 1fr` layout with the SVG spanning both columns above the two bottom vertex cards.

---

## Platform Compatibility

### iOS Safari (`file://` and GitHub Pages)

iOS Safari blocks IndexedDB on `file://` origins. `openDatabase()` wraps the `indexedDB.open()` call in a try/catch and also listens for the `onerror` event. On failure it calls `showStorageError()` which injects a dismissible red banner below the nav bar (`.storage-banner`) explaining the limitation and linking to the GitHub Pages URL.

**The app is fully functional when served over HTTPS** (e.g., GitHub Pages). The storage error only appears when opened directly from the file system on iOS.

### `crypto.randomUUID` Polyfill

A polyfill at the top of `app.js` provides `crypto.randomUUID` on browsers that lack it (older iOS Safari, some WebViews):

```js
if (typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = function () { /* RFC-4122 v4 via getRandomValues */ };
}
```

### iOS File Download

`downloadText()` detects `_isIOS` (via `navigator.userAgent`) and uses `window.open(blobURL)` instead of a synthetic `<a>` click, since iOS Safari does not trigger file downloads from blob anchor clicks.

---

---

## Event-Sourced State Model

- Every button press records a `STAT_INCREMENTED` event with optional metadata (jersey, event code, rotations).
- Match and set lifecycle actions (`START_SET`, `END_SET`, `END_MATCH`) are also events.
- Current state is derived by replaying events up to a cursor position.
- Undo and redo move the replay cursor backward or forward.

This ensures:
- Full audit history of every action
- Deterministic state reconstruction
- Robust JSON export with complete replay data

## Page Navigation

All pages are hidden by default in CSS (`display: none`). The `showPage(name)` function toggles visibility and updates the nav bar active state. On page load, `showPage("stats")` is called synchronously before any async DB work to prevent visual flash.

Pages and their display modes when active:

| Page | `display` value |
|------|-----------------|
| `statsPage` | `""` (defers to CSS) |
| `gameSetupsPage` | `"flex"` |
| `reportsPage` | `"block"` |
| `historyPage` | `"grid"` |
| `configPage` (App Setup) | `"flex"` |

## Data Model

### Hierarchy

- **Season** (optional) — e.g., "Spring 2026"
- **Event** (optional) — e.g., "Spring Invitational", with type: tournament / league / practice
- **Match** — the core tracked entity

All IDs use `crypto.randomUUID()` for global uniqueness across devices.

### IndexedDB Configuration

- **Database name:** `triangle-stats`
- **Version:** 5

| Store | Key | Indexes | Description |
|-------|-----|---------|-------------|
| `matches` | `matchId` | `updatedAt` | Match records with full event timeline |
| `seasons` | `id` | — | Season names |
| `events` | `id` | `seasonId` | Event names with type and optional seasonId |
| `opponents` | `id` | — | Opponent names |
| `eventCodes` | `id` | — | User-defined event codes |
| `gameSetups` | `id` | — | Pre-configured match setups (not live matches) |

**Database version history:** v2 added `events`; v3 added `opponents`; v4 added `eventCodes` (seeded with 10 defaults on first open); v5 added `gameSetups`

### Match Record Fields

| Field | Type | Description |
|-------|------|-------------|
| `matchId` | UUID | Primary key |
| `matchName` | string | User-entered name |
| `matchDate` | ISO string | When the match happened (user-editable, defaults to creation time) |
| `matchFormat` | `"bestOf"` \| `"straightSets"` | Match format |
| `totalSets` | number | Number of sets configured |
| `seasonId` | UUID \| null | FK to seasons store |
| `eventId` | UUID \| null | FK to events store |
| `opponentId` | UUID \| null | FK to opponents store |
| `createdAt` | ISO timestamp | When the record was created |
| `updatedAt` | ISO timestamp | Last save time (auto-updated) |
| `endedAt` | ISO timestamp \| null | When the match was ended (null if in-progress) |
| `cursor` | number | Event replay position (for undo/redo) |
| `events` | array | Domain events timeline |

### Event Code Record Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key (defaults use `"default-{code}"` for seeded entries) |
| `code` | string | Identifier stored in `STAT_INCREMENTED` events (e.g. `"UFE"`) |
| `abbr` | string | Short label shown on button and in tally cells (e.g. `"UfE"`) |
| `label` | string | Human-readable description used in event log and tally legend |
| `cat` | `"both"\|"miss"\|"stop"` | Controls which stat buttons accept the code and the button colour class |
| `order` | number | Sort order for button display |

User-defined event codes are loaded at boot into `var userEventCodes = []` and used everywhere statically-defined codes used to be. Adding or deleting a code reloads `userEventCodes` and calls `renderEventCodeButtons()` to rebuild the stats-page button strip immediately.

### Opponent Record Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Display name |

### Game Setup Record Fields

Game setups are stored in `gameSetups` and are not match records — they are pre-configuration snapshots used to pre-fill the Stats page before a match starts.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key (generated on save or import) |
| `name` | string | Display label (`matchName` → `"vs. <opponent>"` → `"Game Setup"`) |
| `savedAt` | ISO string | When the setup was saved locally |
| `matchFormat` | `"bestOf"\|"straightSets"` | Match format |
| `totalSets` | number | Number of sets |
| `matchName` | string \| null | Pre-configured match name |
| `matchDate` | ISO string \| null | Pre-configured match date/time |
| `opponent` | `{id, name}` \| null | Embedded opponent snapshot |
| `season` | `{id, name}` \| null | Embedded season snapshot |
| `event` | `{id, name, eventType, seasonId}` \| null | Embedded event snapshot |
| `appSettings` | object \| null | Optional settings override (rotation mode, lock time, etc.) |

When a game setup is applied (`applyGameSetup`), any embedded opponent/season/event records are saved to their respective IndexedDB stores before the pickers are refreshed, ensuring they exist on the new device.

Opponents are managed via the **Opponents card** on the **App Setup** page (add, per-item rename, per-item delete, delete all). The opponent picker on the Stats page (`statsOpponentSelect`) is disabled as soon as a match starts and cannot be changed mid-match. Selecting "— New Opponent —" opens an inline name input and a ✓ confirm button (or Enter key) to create and persist the new opponent immediately.

### STAT_INCREMENTED Event Fields

Each `STAT_INCREMENTED` event carries the stat count change plus optional metadata captured at the moment of the button press:

| Field | Type | Description |
|-------|------|-------------|
| `stat` | string | Stat key (e.g. `"usAces"`) |
| `value` | number | Always `1` |
| `setNumber` | number | The set this stat belongs to |
| `jersey` | string \| null | Jersey number entered at press time |
| `eventCode` | string \| null | Selected event code, if applicable to this stat |
| `ourRotation` | number \| null | Our rotation (1–6) at press time |
| `theirRotation` | number \| null | Their rotation (1–6) at press time |
| `timestamp` | ISO string | When the event was recorded |

## Score Calculation

Each category derives a score from raw stats:

- **Terminal Serves** = (usAces + opponentMisses) − (opponentAces + usMisses)
- **First Ball Points** = (firstBallUsKills + firstBallUsStops) − (firstBallOpponentKills + firstBallOpponentStops)
- **Transition Points** = (transitionUsKills + transitionUsStops) − (transitionOpponentKills + transitionOpponentStops)

The **set score** sums all "us" stats (including opponent misses) vs all "opponent" stats (including our misses) for the active set.

Stat boxes display **current set** values. Aggregate match totals are optionally shown inside the triangle SVG.

## Match Lifecycle

1. **Start Match** — Creates match record, starts Set 1
2. **Metadata selection** — Optionally set jersey #, rotation, and/or event code before pressing a stat button
3. **Stat tracking** — 12 buttons record events with captured metadata, state derived by replay
4. **End Set** — Closes current set, auto-progresses to next set; clears all metadata selections
5. **End Match** — Sets `endedAt`, marks match complete; clears all metadata selections
6. **Undo/Redo** — Moves cursor through event timeline

### Reset Guard

During an active match, the Reset button is protected by a padlock:
- Default state: locked (🔒), Reset disabled
- Click padlock to unlock (🔓), Reset enabled
- Auto-relocks after a configurable number of seconds (default: 3)
- Timer configurable via the **Reset Auto-Lock** stepper in App Setup

**Notification Duration** is separately configurable (1–10 s, default 3) via the **Notification Duration** stepper in App Setup. It controls how long `showToast()` keeps a message visible before fading it out.

**Reset always clears** — clicking Reset when a match is active or already ended clears the timeline, all match fields, and re-renders the stats page blank. The only case where Reset does nothing is when no match record exists at all (`controller.getState()` returns `null`), in which case it only refreshes the date/time field. `lockReset()` must **only** be called when a match is active (`state && !state.endedAt`). Calling it unconditionally will start the auto-lock timer and leave the button disabled after the timer fires, even with no match in progress.

## Metadata Panel

The metadata panel is always visible below the control bar (controls are disabled when no set is active). It is a single horizontal card with four zones left to right:

- **Jersey #**: A `Jersey #` label and text input side by side. Shrinks to fit content.
- **Event Code Buttons**: Variable number of color-coded buttons (user-defined, loaded from `userEventCodes`). Fill remaining space and wrap as needed.
- **Last Stat Display**: A read-only panel showing the most recent recorded stat. Updates on every stat press and on undo/redo. Displays on one line: stat name · jersey · event code · rotation(s). Rotation is shown as just `R1`–`R6` (team context is already implied by the stat name). Shows `—` when no stat has been recorded yet.

The rotation cards (Our Rotation / Their Rotation) are separate cards that appear as direct grid children of `stats-layout`, flanking the triangle content rows — not inside the metadata panel itself.

### Last Stat Implementation

- `STAT_LABELS` map in `app.js` provides human-readable labels for all 12 stat keys (e.g., `"firstBallUsKills"` → `"FB Our Kill"`).
- `renderLastStat(state)` walks backwards from `state.cursor` through `controller.timeline.events` to find the most recent `STAT_INCREMENTED` event.
- Called at the top of `renderState()` so it always reflects the current cursor position.

### Event Code Applicability

Event codes are silently dropped when the stat type doesn't accept them. The `STAT_EC_CATS` map defines which categories each stat key allows:

| Stat Keys | Accepts |
|-----------|--------|
| Aces (us/opponent) | nothing |
| Kills (first ball / transition, us/opponent) | nothing |
| Misses (us/opponent) | `"both"` and `"miss"` codes |
| Stops (first ball / transition, us/opponent) | `"both"` and `"stop"` codes |

### Event Code Color Groups

Color is determined by the `cat` field of each user-defined code. The CSS classes are fixed; the codes assigned to each color are user-configurable.

| CSS class | Color | Category | Accepts |
|-----------|-------|---------|----------|
| `ec-both` | Purple | `"both"` | Misses and stops |
| `ec-miss` | Orange | `"miss"` | Serve misses only |
| `ec-stop` | Teal | `"stop"` | Stops and defensive errors only |

### Metadata Clearing Rules

| Trigger | Jersey | Event Code | Rotation |
|---------|--------|-----------|----------|
| Stat button pressed | ✓ cleared | ✓ cleared | Cleared unless "Keep rotation" is on |
| End Set | ✓ cleared | ✓ cleared | ✓ always cleared |
| End Match | ✓ cleared | ✓ cleared | ✓ always cleared |
| Reset | ✓ cleared | ✓ cleared | ✓ always cleared |

### Rotation Tracking Modes

Controlled by the `rotationMode` radio group in App Settings (locked during active match):

| Value | Our buttons | Their buttons | Recorded |
|-------|------------|--------------|----------|
| `none` | Hidden | Hidden | Nothing |
| `ours` | Shown | Hidden | `ourRotation` only |
| `both` | Shown | Shown | Both |

## Auto-Restore on Page Load

The bootstrap sequence:
1. `showPage("stats")` called synchronously (prevents page flash)
2. Async: loads event codes from IndexedDB → `userEventCodes`; renders event code buttons
3. Async: opens IndexedDB, loads all matches
4. Finds the most recent match by `updatedAt`
5. **Only restores if in-progress** (i.e., `endedAt` is null) — completed matches are not auto-restored

## Snapshot Table

Displays a per-set breakdown during a match and in history preview:

| Column | Content |
|--------|---------|
| Set | Set number |
| Score | US − Opponent |
| Terminal Serves | Category formula result |
| First Ball | Category formula result |
| Transition | Category formula result |

On the Stats page, only completed + active sets are shown. A totals footer row appears when multiple sets are displayed. The active set row is highlighted.

## Import / Export

### Export Formats

**Single Match JSON** (`{name}_{date}.json`):
```json
{
  "version": 1,
  "type": "match",
  "exportedAt": "...",
  "season": { ... } | null,
  "event": { ... } | null,
  "opponent": { ... } | null,
  "match": { ... }
}
```

**Bulk Export** (`triangle-stats-backup-{YYYY-MM-DD-HH-MM-SS}.json`):
```json
{
  "version": 1,
  "type": "bulk",
  "exportedAt": "...",
  "seasons": [...],
  "events": [...],
  "opponents": [...],
  "eventCodes": [...],
  "matches": [...]
}
```

**CSV Export** (`{name}_{date}.csv`):
Header row + one row per set + match-total row. Columns include set label, scores, category totals, and all 12 raw stat counts.

### Import Logic

- Detects format (single match vs bulk) from `type` field
- Checks each record's ID against existing data; event codes are also deduplicated by `code` value
- Skips duplicates — never silently overwrites
- Reports summary: seasons / events / opponents / event codes / matches imported vs. skipped

## Stats Page Control Panel

The control panel is a two-row card at the top of the stats page:

**Row 1 (match identity):** Match name input · Datetime input · Opponent combo picker  
**Row 2 (actions):** Start Match · End Set · End Match · Undo · Redo · Reset group · Set indicator

The opponent picker (`statsOpponentSelect`) is disabled as soon as a match starts (locked for the duration). Selecting `__new__` reveals an inline name input and a green ✓ confirm button; pressing Enter or clicking ✓ creates and saves the opponent, then selects it. Pressing Escape cancels.

The match name input persists its value to IndexedDB on `blur` when a match record exists (before start or after end).

## Setup Page

Four cards:

1. **Match Setup** — Format picker, sets stepper, and a collapsible "Match Organization" section (season + event combo pickers with optional new-entry input)
2. **App Settings** — Lock time stepper, triangle totals toggle, date format picker, rotation mode, rotation persist, highlight color, event log colors, Set Colors
3. **Opponents** — Add by name (Enter or Add button), scrollable list with per-item ✕ delete and inline rename (click name → edit → Enter/blur saves), Delete All button with confirmation
4. **Event Codes** — Add (code + abbr + label + category), scrollable list with colored swatches and per-item ✕ delete, Reset to Defaults button (restores `DEFAULT_EVENT_CODES` seed with confirmation)
5. **Developer Tools** — A link that opens `seed-sample-data.html` in a new tab for inserting randomized test data

Controls in Match Setup, the opponent picker, and the Event Codes card are **disabled during an active match** — `renderState()` sets `.disabled` on each element when `matchActive` is true.

## Reports Page

The reports page has four sections stacked vertically:

### Scope Strip
Two pill buttons: **Current Match** and **Select Matches**.
- *Current Match* hides the data picker and always uses the match currently in `controller`.
- *Select Matches* shows the data picker, allowing any combination of saved matches to be chosen.

### Data Picker (`<details>` element, hidden for Current Match)
Two tree panels side by side + a file-load column:

| Panel | Content |
|-------|---------|
| DB tree | IndexedDB hierarchy: Seasons → Events → Matches, orphan events, bare matches. Each level has a select-all checkbox. Collapsible. |
| Loaded files tree | Session-only records loaded from JSON files. Highlighted in teal. |
| File actions | "Load JSON File…" button (accepts single-match or bulk export), "Clear Loaded" button |

Checked match IDs accumulate in `selectedMatchIds: Set<string>`. `loadedFileRecords[]` holds session file data. `buildDataPickerTree()` rebuilds the DB tree async; `buildLoadedFilesTree()` rebuilds the file panel.

### Reports Body (sidebar + content)
`display: grid; grid-template-columns: 13rem 1fr`

**Sidebar** (`reports-sidebar`) — sticky, two groups:

| Group | Reports |
|-------|---------|
| Single Match | Tally Sheet, Tally Chart, Match Summary, Momentum Chart, Set Flow, Error Breakdown, Player Stats, Rotation Performance |
| Multi Match | Event Summary, Progress Trend, Rotation Heat Map, Player Leaderboard, Opponent Comparison |

Single-match reports require exactly 1 selected match; multi-match reports require ≥ 2. Items are disabled (`.disabled`) when the selection doesn't qualify. `updateSidebarAvailability()` is called whenever `selectedMatchIds` changes or scope changes.

**Content area** (`reports-content`) — renders active report via `showReport(name)`. Print button in top-right calls `window.print()`.

### Print CSS
`@media print` hides nav bar, scope strip, data picker, sidebar, and print button. The content area expands to full width.

### Key JS Identifiers

| Variable / Function | Purpose |
|---------------------|---------|
| `reportsScope` | `"current"\|"picker"` |
| `selectedMatchIds` | `Set<string>` of checked match IDs |
| `loadedFileRecords` | Array of `{matchId, matchName, record, source}` — session only |
| `currentReport` | Name of the active report |
| `getSelectedMatches()` | Returns array of `{record, source}` for all checked IDs |
| `refreshAfterSelectionChange()` | Updates sidebar availability then re-renders the active report (or shows a hint if no report is active) |
| `buildDataPickerTree()` | Async — rebuilds DB hierarchy checkboxes |
| `buildLoadedFilesTree()` | Rebuilds loaded-files list |
| `updateSidebarAvailability()` | Enables/disables report links |
| `setReportsScope(scope)` | Switches scope, refreshes picker and sidebar |
| `showReport(name)` | Activates sidebar link, renders report into `#reportOutput` |
| `SINGLE_REPORTS` | Array of report names requiring 1 match |
| `MULTI_REPORTS` | Array of report names requiring 2+ matches |
| `userEventCodes` | Runtime array of event code objects loaded from DB at boot |
| `loadEventCodes()` | Async — reloads `userEventCodes` from IndexedDB |
| `renderEventCodeButtons()` | Clears and rebuilds the stats-page EC button strip from `userEventCodes` |
| `renderEventCodeList()` | Rebuilds the Setup page Event Codes list |
| `DEFAULT_EVENT_CODES` | Seed array used for DB migration and Reset to Defaults |

### Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Opponent tracking (DB v3, CRUD, picker, export/import) |
| Phase 2 | ✅ Complete | Reports shell (scope strip, data picker, sidebar, print CSS) |
| Phase 3 | ✅ Complete | Single-match reports (Tally Sheet through Rotation Performance) |
| Phase 4 | ✅ Complete | Multi-match reports (Event Summary through Opponent Comparison) |

---

## Tally Chart Report

The Tally Chart is a graph-paper block grid single-match report. Each recorded event is represented as a filled colored square positioned in the column for its stat category and row for its sequence within the match.

### Grid Layout

- 13 columns: 1 row-number column + 12 stat columns (one per `STAT_INCREMENTED` stat key)
- Stat column order: `usAces`, `usMisses`, `opponentAces`, `opponentMisses`, then the 4 First Ball columns, then the 4 Transition columns
- Three header rows: group (Terminal Serves / First Ball Points / Transition Points), team (Us / Opp), stat (Ace / Miss / Kill / Stop)
- Data rows are compacted — empty trailing rows are not shown; toggling off a set recompacts the remaining blocks upward

### Column Classification

```js
var OPP_COLS      = { 2:1, 3:1, 6:1, 7:1, 10:1, 11:1 };  // opponent columns
var CAT_SEP_COLS  = { 4:1, 8:1 };                          // major group boundary
var TEAM_SEP_COLS = { 2:1, 6:1, 10:1 };                    // Us→Opp boundary
```

### Separator Lines

Separators between column groups use CSS `::before` pseudo-elements on the separator cell itself:
- `z-index: 1` on the separator cell creates a stacking context above `z-index: auto` neighbors
- `top: -2px; bottom: -2px` extends the pseudo-element past the cell's `border-top`/`border-bottom` (which sit outside the `padding-box` reference used by `position: absolute`)
- `left: -1.5px; width: 3px` (cat-sep) or `left: -0.75px; width: 1.5px` (team-sep) straddles the column boundary equally
- Header stat cells use direct `border-left` (no inline border-color conflict there)

### Block Colors

Colors come from the global `SET_COLORS` array, indexed by the set's position in `state.sets`:

- **Our columns** (Us): `hexToRgba(color, 0.62)` fill, full-opacity solid border
- **Opponent columns** (Opp): `hexToRgba(color, 0.18)` fill, `hexToRgba(color, 0.45)` border — visually washed out

### Set Toggle

The legend below the grid is a row of `<button class="tc-legend-btn">` elements. Clicking one calls `rebuildGrid()` which:
1. Updates `hiddenSets` (a plain object keyed by set number string)
2. Filters each column array to exclude events from hidden sets
3. Re-renders the entire `.tc-data-grid` innerHTML from scratch (blocks move up, rows renumber)
4. Calls `updateTriangle()` to recompute the match-info banner triangle from visible sets only

### Triangle Banner Update

`computeTriStats()` sums `terminalServes`, `firstBallPoints`, and `transitionPoints` from `state.sets` for every set not in `hiddenSets`. `updateTriangle()` replaces the `.report-mini-tri` SVG element in the output DOM using `miniTriangleSvg()`.

### Hover Tooltip

Each filled block contains a hidden `.tc-tip` div shown on `:hover`. Tooltip text is built from available metadata only (jersey, event code abbreviation, rotation). If none are present it falls back to `"Set N"`.

---

## Set Colors

`SET_COLORS` is a module-level `var` array of 12 hex color defaults at the top of the reports section in `app.js`:

```js
var SET_COLORS = [
  "#3b82f6", // Set 1 — blue
  "#22c55e", // Set 2 — green
  "#f97316", // Set 3 — orange
  "#a855f7", // Set 4 — purple
  "#ef4444", // Set 5 — red
  // ... 7 more
];
```

On boot, localStorage keys `setColor_0` … `setColor_N` override the defaults for each index.

`renderSetColorPickers()` dynamically renders one `<input type="color">` per set (count = `cfgSetsValue`) into `#setColorPickersContainer` on the Setup page. It re-reads localStorage to pre-populate values and re-wires `input` event listeners using IIFEs to close over the correct index. It is called from:
- `stepSets(direction)` — when the stepper changes the number of sets
- `syncSetsToFormat()` — when match format changes the default set count
- Initial page load (container exists in HTML from boot)

For matches with more than 12 sets, `SET_COLORS[i % SET_COLORS.length]` cycles the palette.

---

## Momentum Chart Report

The Momentum Chart plots cumulative score differential (us − them) over rally sequence for each set. A separate line is drawn per set using `SET_COLORS`.

### Set Toggle

A `<button class="chart-toggle">` is rendered per set in the legend above the SVG. Clicking one:
1. Toggles `active` class on the button and `display: none/""` on all SVG elements (`path`, `circle`) with a matching `data-set` attribute
2. Adds or removes the set from a local `hiddenSets` object
3. Calls `updateTriangle()` to recompute the match-info banner triangle from only visible sets

### Triangle Banner Update

`updateTriangle()` sums `terminalServes`, `firstBallPoints`, and `transitionPoints` from `state.sets` for every set not in `hiddenSets`, then replaces the `.report-mini-tri` SVG element — identical in structure to the Tally Chart's triangle update.

---

## Match Log Report

The Match Log is a single-match report that renders every recorded event in chronological order.

### Grid Layout

Each stat row uses an 8-column CSS grid:
```
grid-template-columns: 6rem 3.5rem 9rem 5.5rem 4rem 9rem 9rem 9rem
```

| Column | Class | Content |
|--------|-------|---------|
| 1 | `elr-time` | Timestamp (HH:MM:SS) |
| 2 | `elr-score` | Running set score |
| 3 | `elr-cat` | Stat category |
| 4 | `elr-stat` | Stat label |
| 5 | `elr-jersey` | Jersey number |
| 6 | `elr-code` | Event code |
| 7 | `elr-rot` | Rotations (Us R_· Them R_) |
| 8 | `elr-lead` | Lead change indicator |

System events (MATCH_STARTED, SET_STARTED, SET_ENDED, MATCH_ENDED) use `grid-template-columns: 6rem 1fr` and appear in italic.

### Lead Change Highlighting

As events are replayed, a `setLeaders` object tracks the current non-tied leader per set (`1` = us, `-1` = them). The leader is **only updated when the score is not tied** — so retaking your own lead after a tie does not register as a new lead change.

When a genuine lead change occurs:
- The **score cell** (`elr-score`) receives class `lead-us` (green pill) or `lead-them` (red pill)
- Column 8 (`elr-lead`) displays “Lead Change – Us” or “Lead Change – Them” in the corresponding color
- Rows with no lead change have an empty column 8

The same logic applies identically to both the live match log (`renderEventLog`) and the Match Log report (`renderMatchLog`).

---

## Lead Changes Section (Match Summary)

The Match Summary report includes a **Lead Changes** section below the Set Scores table.

### Algorithm

```js
var US_STATS_LC = { usAces:1, opponentMisses:1, firstBallUsKills:1,
                   firstBallUsStops:1, transitionUsKills:1, transitionUsStops:1 };
```

For each set, the section replays `STAT_INCREMENTED` events (up to `record.cursor`) and tracks running scores. A lead change is recorded when:
- The new leader is not tied (`leader !== 0`)
- The new leader differs from the stored previous leader (`leader !== prevLeader`)
- The stored leader is **only updated when leader !== 0**, so ties do not reset it

This means: `us lead → tie → us lead` = no lead change. `us lead → tie → them lead` = one lead change (them).

### Display

- Sets are rendered as **side-by-side columns** using a `.lead-changes-cols` flex-row wrapper
- Within each set column, the score badges stack **vertically** (`.lead-changes-list { flex-direction: column }`)
- Each badge shows `us–them` score (our score always first, en-dash `–`)
- Green pill (`.lead-us`) when we took the lead; red pill (`.lead-them`) when opponent did
- Sets with zero lead changes are omitted from the display
- If no set has any lead changes: “No lead changes recorded.” placeholder

---

## Sample Data Generator (`seed-sample-data.html`)

A standalone browser page for inserting test/demo data directly into the app’s IndexedDB. Opens via the **Developer Tools** card on the Setup page.

### Modes

| Tab | What it generates |
|-----|-------------------|
| **Single Match** | One match with configurable name, date, format, per-set outcomes |
| **Tournament** | Season + event + N opponents + N matches, distributed across the day |
| **League** | Season + round-events (weekly) + opponent pool + M matches per round |
### League Match Dates

Within each round, matches are spread across separate days rather than all falling on the same date. Match 0 is on the round's base date, match 1 is two days later, match 2 is four days later. With a maximum of 3 matches per round this always stays within the 7-day window before the next round starts.
### Lead Change Cadence

A `pointsUntilLeadChange` counter (reset to a random value in `[lcMin, lcMax]`) tracks how many consecutive points have elapsed since the last lead change. When it expires, the scoring bias is reversed to force the lagging team to score, creating the next lead change.

### Rotation Simulation

Both teams start on a random rotation (1–6). Side-out rotations advance the receiving team’s rotation by 1 when they win a rally. Player jerseys are assigned to our stats that permit them.
### Event Code Assignment

Before generating any data, `loadEventCodes(db)` reads the `eventCodes` store from IndexedDB and partitions them into `activeMissCodes` (cat `"miss"` or `"both"`) and `activeStopCodes` (cat `"stop"` or `"both"`). If the store is empty, `SEED_DEFAULT_CODES` (a trimmed copy of the 10 default codes) is used as a fallback.

Per rally, after the stat is chosen:
- **Serve miss stats** (`usMisses`, `opponentMisses`): a miss/both code is assigned ~65% of the time
- **Stop stats** (first ball and transition stops, us and opponent): a stop/both code is assigned ~35% of the time
- All other stats receive no event code

This produces realistic error-tagging distribution across the Tally Sheet, Match Log, and Error Breakdown reports.
### Score Enforcement

Sets enforce the `win-by-2` rule by overriding the bias when the loser approaches the target. The deciding set of a full-distance match (5th set in BO5, 3rd in BO3 when played) uses `targetWinner = 15`; regular sets use `25`.

### Contrast with `generate-test-match.js`

| | `seed-sample-data.html` | `generate-test-match.js` |
|-|------------------------|-------------------------|
| Runs in | Browser | Node.js |
| Output | Writes to IndexedDB directly | Writes importable `.json` file |
| Data | Randomized each run | Hand-scripted, reproducible |
| Use case | Realistic volume testing | Regression / report testing |

---

## Multi-Match Reports

### Event Summary

Renders a per-match table sorted by date. An aggregate triangle (`miniTriangleSvg`) is displayed above the table, summing `terminalServes`, `firstBallPoints`, and `transitionPoints` across all selected matches.

### Progress Trend

Renders a line chart of TS, FB, and TRN per match over time. Features:

**Triangle** — aggregate totals displayed above the chart. When a series is toggled off, that vertex resets to 0 so the triangle reflects only visible data.

**Series toggles** — three `.chart-toggle` buttons (Terminal Serves / First Ball / Transition) in the legend. Clicking one calls `display: none/""` on all `[data-series="..."]` SVG elements scoped to the chart's `<svg>` (not the buttons themselves).

**Orientation toggle** — two buttons (`↔ Horizontal` / `↕ Vertical`) rendered by `.trend-toolbar`. State is tracked in the local `chartMode` variable (`"h"` or `"v"`). Switching rebuilds the inner `.trend-chart-wrap` by calling `buildHorizontalSvg()` or `buildVerticalSvg()`, then re-applies any hidden series.

**Horizontal mode** (`buildHorizontalSvg`) — matches on X axis, values on Y axis. Fixed 700-unit wide viewBox, `width:100%` (fills container). When there are more than 8 matches the chart is split into chunks of 8, each rendered as a separate SVG stacked vertically; all chunks share the same Y scale so values are visually comparable. A `(1/N)` counter in the top-right corner indicates chunk position when multiple charts exist. Each data point has a 60-unit inset pad on both sides so edge labels never clip at the SVG boundary. Labels are three stacked centered lines: prefix (bold, 9px) / date (8px, dimmed) / opponent name (8px, dimmed). No truncation — the full name renders and scales with the container.

**Vertical mode** (`buildVerticalSvg`) — matches on Y axis (top to bottom), values on X axis. SVG height scales with match count (`TM + n × 44px + BM`). Renders at full height (no scroll wrapper) for clean printing. Match labels split on ` vs ` into a bold prefix line with an inline date `tspan` and a dimmer `vs Opponent` line below; names without ` vs ` render on two lines (name + date).

**Hover tooltip** — a single `.chart-float-tip` `<div>` is appended to `<body>` when the report renders and reused for all dots. Each `<circle>` carries `data-tip-val` (formatted value, e.g. `+3`). On `mouseenter` the tooltip shows just the value in a bold pill near the cursor. Re-wired via `attachTipEvents()` after every orientation switch.

### Opponent Comparison

Renders a per-opponent summary table sorted by win rate. Two triangle additions:
- **Overall triangle** — sums `rawTS`, `rawFB`, `rawTRN` across all opponents, displayed above the table
- **Per-opponent cards** (`.report-opp-cards`) — flex-wrap row of `.report-opp-card` elements below the table, one per opponent, each showing the opponent name, W–L record, and a 150×150 triangle with their aggregate totals

`rawTS / rawFB / rawTRN` are the summed (not averaged) category totals, stored alongside the existing per-match averages when each opponent group is built.

---

## Date Formatting

`formatDateShort(d)` is a global utility that formats a `Date` object using the preference stored in `localStorage.dateFormat`. Set in **Setup → App Settings → Date format** and saved on change.

| Key | Example |
|-----|---------|
| `yyyy-mm-dd` (default) | 2026-05-04 |
| `M/D/YY` | 5/4/26 |
| `MM/DD/YYYY` | 05/04/2026 |
| `D/M/YY` | 4/5/26 |
| `DD/MM/YYYY` | 04/05/2026 |

All user-facing date displays use this function: History page match list, Reports data picker labels, match info banner (date portion; time still uses `toLocaleTimeString`), Event Summary table, and Progress Trend chart labels.

---

## History Page

Matches are grouped hierarchically:
- **Season** → **Event** → **Match** (using collapsible `<details>` elements)
- Ungrouped matches (no season/event) appear in a separate section
- Sorted ascending by `matchDate` (oldest first)

Each match item shows: name, status badge (Complete / In Progress), and date/time.

Actions:
- **Delete individual match** — Confirmation dialog, removes from IndexedDB
- **Clear Matches** — Single confirmation; deletes all `matches`, `seasons`, and `events` records while keeping `opponents` and `eventCodes`
- **Clear All** — Prompts to Export All first, then confirms full deletion of all stores (matches, seasons, events, opponents — but not eventCodes)

## Quick Smoke Test

1. Open `index.html` in a browser
2. Start a match, tap a few stat buttons, verify totals update
3. End Set → verify auto-progression to next set
4. Undo/Redo → verify values restore correctly
5. Refresh page → verify in-progress match restores from IndexedDB
6. Refresh after ending a match → verify it does **not** auto-restore
7. Export JSON, Export CSV → verify files download with name + date filenames
8. Export All → verify bulk file includes timestamp in filename
9. Import a previously exported file → verify duplicates are skipped
10. History → verify matches grouped by season/event, delete works
11. Clear Matches → verify matches/seasons/events are gone but opponents and event codes remain
12. Clear All → verify export prompt appears first, then confirmation
12. Reset during active match → verify padlock guard prevents accidental reset
13. End Match, then click Reset → verify snapshot table and event log clear completely
14. Setup → set Rotation Tracking to "Both Sides", start a match, verify rotation buttons appear on both sides
15. Select R3 (ours), enter jersey "12", select "Net", press "Our Miss" → verify metadata in exported JSON event
16. Press any stat button with a non-applicable code selected (e.g. "Drop" + "Our Ace") → verify event code is null in export
17. End Set → verify all rotation/jersey/code selections are cleared
18. Enable "Keep rotation", select R2, press two stat buttons → verify rotation persists across both; End Set → verify it clears
19. Setup → Event Codes → add a custom code (e.g. Code `"Ant"`, Abbr `"Ant"`, Label `"Antenna hit"`, Category `"both"`) → verify button appears purple in stats panel
20. Record a stat with the custom code, export JSON → verify `eventCode: "Ant"` in event record
21. Delete the custom code → verify button disappears; existing match data still shows `"Ant"` raw in tally fallback
22. Reset to Defaults → verify 10 original codes restored, custom code gone
23. Export All → open backup JSON, verify `eventCodes` array is present with all current codes
24. Import the backup on a fresh profile → verify event codes are restored; duplicate codes skipped on re-import
25. **Mobile — portrait (≤600px):** verify metadata panel shows jersey row on top, code buttons wrap horizontally below, Last stat on third row; rotation panels appear beside Terminal Serves (not beside jersey panel)
26. **Mobile — landscape phone:** verify left control panel + right scrollable stats column; rotation panels flank Terminal Serves; code buttons wrap horizontally
27. **iOS Safari / GitHub Pages:** verify no blank screen when served over HTTPS; storage error banner appears (and no crash) when opened from file system on iOS
28. Reports → Match Summary → Lead Changes section: verify badges appear with correct team color and score labels; verify ties between lead changes do not count as a lead change
29. Reports → Match Log → verify lead-change rows show a colored score pill and "Lead Change – Us/Them" in column 8; verify non-lead-change rows have an empty column 8
30. Setup → Developer Tools → click "Open Sample Data Generator" → verify `seed-sample-data.html` opens in a new tab
31. Setup → App Settings → Date format → change to `MM/DD/YYYY`; verify History list, Reports data picker, match info banner, Event Summary, and Progress Trend all display the new format
32. Reports → Progress Trend (horizontal, > 8 matches) → verify chart splits into multiple stacked SVGs with matching Y scale and `(1/N)` counter
33. Reports → Progress Trend → hover a data point → verify only the value pill appears (no native browser tooltip below it)
