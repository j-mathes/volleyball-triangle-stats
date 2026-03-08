# Triangle Stats

Cross-platform volleyball stat tracker for iPhone and web.

## Planning Docs

- Project plan: `docs/PROJECT_PLAN.md`
- Execution checklist: `docs/TASK_BOARD.md`
- Architecture notes: `docs/ARCHITECTURE.md`
- Manual QA checklist: `docs/QA_CHECKLIST.md`
- Release check: `docs/RELEASE_CHECK.md`
- Release sign-off template: `docs/RELEASE_SIGNOFF_TEMPLATE.md`

## Tracked Categories

- Terminal Serves
- First Ball Points
- Transition Points

Each category tracks "us" and "opponent" statistics, with real-time derived totals.

## Current Status

Shared domain engine, persistence adapters, and first interactive app shells are in place.

## Run Locally

```bash
npm install
npm run dev:web
```

For mobile (Expo):

```bash
npm run dev:mobile
```

Quality checks:

```bash
npm run lint
npm run typecheck:refs
npm run typecheck:all
npm run typecheck
npm test
npm run test:all
```
