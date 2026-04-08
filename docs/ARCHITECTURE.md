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

## File Structure

All code lives in three files at the repo root:

- `index.html` — HTML shell and layout
- `app.js` — Domain engine, IndexedDB persistence, and UI wiring
- `styles.css` — Visual styling

No build step, framework, or package manager is required.
Open `index.html` directly in a browser to run.
