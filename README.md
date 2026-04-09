# Triangle Stats

Web-based volleyball stat tracker.

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge).
2. Optionally go to **Setup** to configure match format, number of sets, and match organization (season/event).
3. On the **Stats** page, enter a match name, set the date/time, and click **Start Match**.
4. Tap the 12 stat buttons in the triangle layout to record events.
5. Use **Undo** / **Redo** to correct mistakes.
6. **End Set** / **End Match** when finished.
7. On the **History** page:
   - **Export JSON** for a single match with full replay data.
   - **Export CSV** for a coach-readable summary.
   - **Export All** to back up all seasons, events, and matches.
   - **Import** to load data from a JSON export file (single match or bulk).
   - **Resume Match** to continue an unfinished match.

No build tools, npm, or server required.

## File Structure

- `index.html` — Main entry point
- `app.js` — All application logic (domain engine, persistence, UI wiring)
- `styles.css` — Visual styling

## Tracked Categories

- **Terminal Serves** = (our aces + their misses) − (their aces + our misses)
- **First Ball Points** = (our kills + our stops) − (their kills + their stops)
- **Transition Points** = (our kills + our stops) − (their kills + their stops)

Each category tracks "us" and "opponent" statistics, with real-time derived totals.

## Data Organization

Matches can optionally be organized into a hierarchy:

- **Season** (e.g., "Spring 2026") — broadest grouping
- **Event** (e.g., "Spring Invitational") — with a type: Tournament, League, or Practice
- **Match** — the individual stat-tracked game

All organization is optional. Matches work fine without any season or event.

## Persistence

Match data is stored in the browser's IndexedDB (database: `triangle-stats`,
stores: `matches`, `seasons`, `events`). Refreshing the page restores the most
recent match automatically.

## Import / Export

- **Export JSON** (per match): produces a self-contained `.json` file with the match data plus its season/event context.
- **Export All**: produces a bulk `.json` file containing all seasons, events, and matches.
- **Import**: reads a `.json` file (single match or bulk), skips duplicates by ID, and adds new data.
- **Export CSV**: produces a coach-readable summary of a single match.

Import never silently overwrites — duplicates are skipped. Use this for backup, sharing between devices, or combining data from multiple trackers.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
