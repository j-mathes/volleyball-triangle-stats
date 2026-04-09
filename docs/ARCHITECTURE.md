# Architecture

Triangle Stats uses an event-sourced state model.

- Every button press records a `STAT_INCREMENTED` event.
- Match and set lifecycle actions are also events.
- Current state is derived by replaying events up to a cursor.
- Undo and redo move the replay cursor backward or forward.

This ensures:
- full audit history
- deterministic reconstruction
- robust JSON export

## Data Model

### Hierarchy

- **Season** (optional) — e.g., "Spring 2026"
- **Event** (optional) — e.g., "Spring Invitational", with type: tournament / league / practice
- **Match** — the core tracked entity

All IDs use `crypto.randomUUID()` for global uniqueness across devices.

### IndexedDB Stores

| Store | Key | Description |
|-------|-----|-------------|
| `matches` | `matchId` | Match records with events timeline |
| `seasons` | `id` | Season names |
| `events` | `id` | Event names with type and optional seasonId |

### Match Record Fields

- `matchId` — UUID
- `matchName` — user-entered name
- `matchDate` — when the match happened (user-editable, defaults to creation time)
- `matchFormat` — "bestOf" or "straightSets"
- `totalSets` — number of sets configured
- `seasonId` — optional FK to seasons store
- `eventId` — optional FK to events store
- `createdAt` — system timestamp when record was created
- `updatedAt` — system timestamp of last save
- `cursor` — event replay position (for undo/redo)
- `events` — array of domain events

## Import / Export

- **Single match export** includes the match record plus its season/event context (self-contained)
- **Bulk export** includes all seasons, events, and matches
- **Import** detects format (single vs bulk), skips duplicates by ID, never silently merges

## File Structure

All code lives in three files at the repo root:

- `index.html` — HTML shell and layout
- `app.js` — Domain engine, IndexedDB persistence, and UI wiring
- `styles.css` — Visual styling

No build step, framework, or package manager is required.
Open `index.html` directly in a browser to run.

## Quick Smoke Test

1. Open `index.html` in a browser
2. Start a match, tap a few stat buttons, verify totals update
3. End Set → verify auto-progression to next set
4. Undo/Redo → verify values restore correctly
5. Refresh page → verify match restores from IndexedDB
6. Export JSON, Export CSV → verify files download
7. Export All → verify bulk file includes seasons/events/matches
8. Import a previously exported file → verify duplicates are skipped
