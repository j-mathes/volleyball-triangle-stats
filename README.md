# Triangle Stats

Web-based volleyball stat tracker.

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge).
2. Enter a match name and click **Start Match**.
3. Enter a set number and click **Start Set**.
4. Tap the 12 stat buttons in the triangle layout to record events.
5. Use **Undo** / **Redo** to correct mistakes.
6. **End Set** / **End Match** when finished.
7. **Export JSON** for full replay data or **Export CSV** for a coach-readable summary.

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

## Persistence

Match data is stored in the browser's IndexedDB. Refreshing the page restores
the most recent match automatically. Match history is available in the sidebar.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [QA Checklist](docs/QA_CHECKLIST.md)
- [Release Check](docs/RELEASE_CHECK.md)
