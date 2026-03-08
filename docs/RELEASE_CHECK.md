# Release Check (5-Minute)

Run this before tagging or sharing a build.

## 1. Automated Gate (2 minutes)
Run from repo root:

```bash
npm run lint
npm run typecheck:refs
npm run typecheck:all
npm run test:all
```

Pass criteria:
- all commands exit with code `0`
- no failing tests

## 2. Web Smoke (1 minute)
Commands:

```bash
npm run dev:web
```

Checklist:
- start match, start set, tap 3-4 stat buttons
- verify triangle totals and score update live
- export JSON and CSV from UI
- refresh page and confirm match restores

## 3. Mobile Smoke (1 minute)
Commands:

```bash
npm run dev:mobile
```

Checklist:
- open in Expo Go on iPhone
- start match and set, tap 3-4 stat buttons
- verify undo/redo works
- share JSON and CSV from app
- close/reopen app and confirm restore

## 4. Manual Edge Cases (1 minute)
Quick checks:
- undo after ending a set
- redo invalidation after adding a new event post-undo
- ending match while no active set
- history load switches to selected timeline

## 5. Release Decision
Ship only if all above pass.

If any check fails:
- capture failing step
- add a short note to `docs/TASK_BOARD.md`
- fix and rerun this checklist

After completion:
- fill `docs/RELEASE_SIGNOFF_TEMPLATE.md` and store it as a dated sign-off note
