# Triangle Stats Task Board

Legend:
- [x] done
- [ ] pending
- [~] in progress

## Phase 1: Foundation
- [x] Create monorepo folder layout
- [x] Initialize root workspace metadata (`package.json`, docs)
- [x] Add starter shared package files
- [x] Configure strict TypeScript projects and references
- [x] Add linting and formatting baseline
- [x] Add real workspace scripts (`build`, `typecheck`, `test`)

## Phase 2: Domain Engine
- [x] Define core stat/event/domain types
- [x] Implement base formulas and derived categories
- [x] Implement replay-based state derivation
- [x] Implement cursor-style undo/redo
- [x] Implement starter JSON/CSV export functions
- [x] Add explicit `UNDO`/`REDO` event policy decision (timeline-only vs event-recorded)
- [x] Add unit tests for formulas and replay correctness
- [x] Add unit tests for lifecycle transitions and edge cases

## Phase 3: Persistence and Repository
- [x] Define shared repository interfaces and DTOs
- [x] Implement web persistence adapter (IndexedDB)
- [x] Implement mobile persistence adapter (AsyncStorage)
- [x] Add match list/history queries
- [x] Add restore-on-launch behavior

## Phase 4: Core UI
- [x] Make Expo app runnable from `apps/mobile`
- [x] Make web app runnable from `apps/web`
- [x] Build triangle layout and 12 stat actions
- [x] Wire lifecycle controls (start/end match and set)
- [x] Wire undo/redo controls
- [x] Add match history screen/page

## Phase 5: Export UX
- [x] Add JSON export UX for web download
- [x] Add CSV export UX for web download
- [x] Add iPhone share-sheet flow for JSON/CSV
- [x] Add schema version to JSON payload

## Phase 6: Verification
- [x] Add integration tests for end-to-end flow
- [x] Add persistence smoke tests (refresh/restart)
- [x] Validate JSON replay parity
- [ ] Validate CSV shape in spreadsheet tools
- [ ] Run manual QA edge-case checklist

Closeout helper:
- Use `docs/RELEASE_CHECK.md` for final pre-release verification flow.
- Record final manual outcomes in `docs/RELEASE_SIGNOFF_TEMPLATE.md`.

Verification note:
- Automated tests now validate CSV row/column shape and per-set plus match-total row format; spreadsheet compatibility still requires manual confirmation.
- Web and mobile repository adapters now have automated create/load/save/delete persistence tests.

## Current Blockers
- None. Node.js is installed and shared package checks are passing.
