# Architecture

## Overview

Triangle Stats is a vanilla HTML/JS/CSS single-page application with four pages (Stats, Reports, History, Setup) toggled via `style.display`. There is no build step, framework, or package manager. All code lives in three files at the repo root:

- `index.html` — HTML shell and layout
- `app.js` — Domain engine, IndexedDB persistence, and UI wiring
- `styles.css` — Visual styling

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

All three pages are hidden by default in CSS (`display: none`). The `showPage(name)` function toggles visibility and updates the nav bar active state. On page load, `showPage("stats")` is called synchronously before any async DB work to prevent visual flash.

## Data Model

### Hierarchy

- **Season** (optional) — e.g., "Spring 2026"
- **Event** (optional) — e.g., "Spring Invitational", with type: tournament / league / practice
- **Match** — the core tracked entity

All IDs use `crypto.randomUUID()` for global uniqueness across devices.

### IndexedDB Configuration

- **Database name:** `triangle-stats`
- **Version:** 4

| Store | Key | Indexes | Description |
|-------|-----|---------|-------------|
| `matches` | `matchId` | `updatedAt` | Match records with full event timeline |
| `seasons` | `id` | — | Season names |
| `events` | `id` | `seasonId` | Event names with type and optional seasonId |
| `opponents` | `id` | — | Opponent names |
| `eventCodes` | `id` | — | User-defined event codes |

**Database version history:** v2 added `events`; v3 added `opponents`; v4 added `eventCodes` (seeded with 10 defaults on first open)

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

Opponents are managed via the **Opponents card** on the Setup page (add, per-item rename, per-item delete, delete all). The opponent picker on the Stats page (`statsOpponentSelect`) is disabled as soon as a match starts and cannot be changed mid-match. Selecting "— New Opponent —" opens an inline name input and a ✓ confirm button (or Enter key) to create and persist the new opponent immediately.

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
- Timer configurable via App Settings stepper on the Setup page

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
2. **App Settings** — Lock time stepper, triangle totals toggle, rotation mode, rotation persist, highlight color, event log colors
3. **Opponents** — Add by name (Enter or Add button), scrollable list with per-item ✕ delete and inline rename (click name → edit → Enter/blur saves), Delete All button with confirmation
4. **Event Codes** — Add (code + abbr + label + category), scrollable list with colored swatches and per-item ✕ delete, Reset to Defaults button (restores `DEFAULT_EVENT_CODES` seed with confirmation)

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
| Single Match | Tally Sheet, Match Summary, Momentum Chart, Set Flow, Error Breakdown, Player Stats, Rotation Performance |
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



## History Page

Matches are grouped hierarchically:
- **Season** → **Event** → **Match** (using collapsible `<details>` elements)
- Ungrouped matches (no season/event) appear in a separate section
- Sorted ascending by `matchDate` (oldest first)

Each match item shows: name, status badge (Complete / In Progress), and date/time.

Actions:
- **Delete individual match** — Confirmation dialog, removes from IndexedDB
- **Clear All** — Prompts to Export All first, then confirms full deletion of all three stores

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
11. Clear All → verify export prompt appears first, then confirmation
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
