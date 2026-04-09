# Architecture

## Overview

Triangle Stats is a vanilla HTML/JS/CSS single-page application with three pages (Stats, Setup, History) toggled via `style.display`. There is no build step, framework, or package manager. All code lives in three files at the repo root:

- `index.html` — HTML shell and layout
- `app.js` — Domain engine, IndexedDB persistence, and UI wiring
- `styles.css` — Visual styling

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
- **Version:** 2

| Store | Key | Indexes | Description |
|-------|-----|---------|-------------|
| `matches` | `matchId` | `updatedAt` | Match records with full event timeline |
| `seasons` | `id` | — | Season names |
| `events` | `id` | `seasonId` | Event names with type and optional seasonId |

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
| `createdAt` | ISO timestamp | When the record was created |
| `updatedAt` | ISO timestamp | Last save time (auto-updated) |
| `endedAt` | ISO timestamp \| null | When the match was ended (null if in-progress) |
| `cursor` | number | Event replay position (for undo/redo) |
| `events` | array | Domain events timeline |

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

## Metadata Panel

The metadata panel is shown below the control bar only when a set is active. It contains three zones:

- **Left — Our Rotation**: R1–R6 buttons. Shown when rotation mode is "Ours Only" or "Both Sides".
- **Center — Jersey # and Event Codes**: A text input for jersey number and 11 color-coded event code buttons.
- **Right — Their Rotation**: R1–R6 buttons. Shown only when rotation mode is "Both Sides".

### Event Code Applicability

Event codes are silently dropped when the stat type doesn't accept them. The `STAT_EC_CATS` map defines which categories each stat key allows:

| Stat Keys | Accepts |
|-----------|--------|
| Aces (us/opponent) | nothing |
| Kills (first ball / transition, us/opponent) | nothing |
| Misses (us/opponent) | `"both"` and `"miss"` codes |
| Stops (first ball / transition, us/opponent) | `"both"` and `"stop"` codes |

### Event Code Color Groups

| Color | Category | Codes |
|-------|---------|-------|
| Purple | Both misses and stops | Net, Out |
| Orange | Misses only | Foot, Rot, Err, Penalty |
| Blue | Stops only | Miss, Drop, Roof, Catch, Double |

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
2. Async: opens IndexedDB, loads all matches
3. Finds the most recent match by `updatedAt`
4. **Only restores if in-progress** (i.e., `endedAt` is null) — completed matches are not auto-restored

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
  "matches": [...]
}
```

**CSV Export** (`{name}_{date}.csv`):
Header row + one row per set + match-total row. Columns include set label, scores, category totals, and all 12 raw stat counts.

### Import Logic

- Detects format (single match vs bulk) from `type` field
- Checks each record's ID against existing data
- Skips duplicates — never silently overwrites
- Reports summary: items imported vs. skipped

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
13. Setup → set Rotation Tracking to "Both Sides", start a match, verify rotation buttons appear on both sides
14. Select R3 (ours), enter jersey "12", select "Net", press "Our Miss" → verify metadata in exported JSON event
15. Press any stat button with a non-applicable code selected (e.g. "Drop" + "Our Ace") → verify event code is null in export
16. End Set → verify all rotation/jersey/code selections are cleared
17. Enable "Keep rotation", select R2, press two stat buttons → verify rotation persists across both; End Set → verify it clears
