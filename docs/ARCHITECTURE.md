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
