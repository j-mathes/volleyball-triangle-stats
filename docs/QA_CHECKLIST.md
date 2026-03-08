# Manual QA Checklist

Use this checklist on both web and iPhone builds.

## Match Lifecycle
- [ ] Start a new match and confirm it appears in history.
- [ ] Start Set 1 and verify active set indicator updates.
- [ ] End Set 1 and confirm active set clears.
- [ ] End match and verify match is marked closed in current state.
- [ ] Start a second set before ending the match and confirm set ordering remains correct.

## Stat Tracking
- [ ] Tap each of the 12 stat actions at least once and verify tally increments.
- [ ] Verify triangle category values update immediately.
- [ ] Verify aggregate score updates after each scoring event.
- [ ] Verify per-set values contribute correctly to match total.

## Undo/Redo
- [ ] Perform 3 increments, undo all 3, then redo all 3 and verify exact values restore.
- [ ] Undo after `SET_ENDED` and confirm set becomes active again.
- [ ] Undo once, then add a new increment and confirm redo is disabled.

## Persistence
- [ ] Web: refresh browser and verify current match state restores exactly.
- [ ] iPhone: close and relaunch app and verify current match state restores.
- [ ] Load a previous match from history and verify its timeline-derived state.

## Export
- [ ] Export JSON and verify payload includes `schemaVersion`, `timeline.events`, and `timeline.cursor`.
- [ ] Replay exported JSON timeline and confirm reconstructed state equals exported state.
- [ ] Export CSV and open in spreadsheet software.
- [ ] Confirm CSV contains one row per set plus one `match-total` row.
- [ ] Confirm CSV columns align with expected 12 stats, 3 triangle categories, and score columns.

## UI/Interaction
- [ ] Verify triangle layout is usable in desktop web viewport.
- [ ] Verify triangle layout remains usable in narrow/mobile web viewport.
- [ ] Verify tap targets are comfortable on iPhone.
- [ ] Verify no buttons are enabled when required preconditions are missing (for example, increment with no active set).
