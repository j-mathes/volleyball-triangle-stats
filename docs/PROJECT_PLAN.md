# Triangle Stats Project Plan

## Goal
Build Triangle Stats as a shared TypeScript monorepo using React Native (Expo) for iPhone and React for web, backed by an event-sourced domain layer that supports real-time updates, undo/redo, per-set and match aggregates, and JSON/CSV export.

## Product Scope (v1)
Included:
- iPhone app (Expo) and browser app sharing one domain package
- 12 canonical counters and 3 triangle categories
- Match + set lifecycle controls
- Event timeline with undo/redo pointer semantics
- Match history (local only)
- JSON export (full replay fidelity)
- CSV export (coach-readable summaries)

Excluded:
- Cloud sync / accounts
- Multi-device conflict resolution
- Advanced analytics dashboards

## Canonical Formulas
- Terminal Serves = (our aces + their misses) - (their aces + our misses)
- First Ball Points = (our kills + our stops) - (their kills + their stops)
- Transition Points = (our kills + our stops) - (their kills + their stops)

## Architecture
- Event sourced: all user actions are events
- Deterministic replay: state is derived, not manually mutated
- Undo/redo: cursor over immutable event history
- Shared package (`packages/shared`) owns domain types, formulas, engine, and export
- Platform apps (`apps/mobile`, `apps/web`) render UI and use persistence adapters

## Delivery Phases

### Phase 1: Foundation
- Monorepo setup (`apps/mobile`, `apps/web`, `packages/shared`)
- Shared TypeScript contracts
- Canonical stat keys and category mappings

### Phase 2: Domain Engine
- Entities: Match, Set, Event, DerivedState, UndoRedoState
- Events: `MATCH_STARTED`, `SET_STARTED`, `STAT_INCREMENTED`, `SET_ENDED`, `MATCH_ENDED`
- Undo/redo policy: cursor-based timeline navigation (undo/redo are not stored as standalone domain events)
- Pure reducer/selectors for 12 tallies, 3 categories, set score, and match aggregate
- Unit tests for formulas, replay behavior, lifecycle, and undo/redo

### Phase 3: Persistence + Repository
- iPhone: AsyncStorage adapter
- Web: IndexedDB adapter (optional metadata fallback)
- Repository APIs: create/list/load/append/get history

### Phase 4: Core UI
- Triangle layout:
  - Top: Terminal Serves
  - Bottom-left: First Ball Points
  - Bottom-right: Transition Points
- 12 tappable/clickable stat buttons with live counts
- Action bar: start/end match and set, undo, redo
- Match history screen

### Phase 5: Export
- JSON export with schema version + full event timeline + cursor metadata
- CSV export with per-set rows and one aggregate row
- Web download + iPhone share/email flow

### Phase 6: Verification
- Integration flows from match start to export
- Persistence restore checks after restart/refresh
- QA edge cases: undo after set end, redo invalidation after new event, open-set match end, formula consistency

## Current Repository Status
Completed in scaffold form:
- Base monorepo folders
- Shared domain starter files (`types.ts`, `constants.ts`, `formulas.ts`, `matchEngine.ts`, `export.ts`)
- App entry placeholders for mobile and web
- Basic architecture/readme docs

Next major milestone:
- Make mobile + web apps runnable and wire the first interactive triangle stat screen to shared engine
