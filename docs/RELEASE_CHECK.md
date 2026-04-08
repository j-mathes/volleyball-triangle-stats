# Release Check

Run this before tagging or sharing a build.

## 1. Web Smoke (2 minutes)

Open `index.html` in a browser.

Checklist:
- start match, start set, tap 3-4 stat buttons
- verify triangle totals and score update live
- export JSON and CSV from UI
- refresh page and confirm match restores

## 2. Manual Edge Cases (1 minute)
Quick checks:
- undo after ending a set
- redo invalidation after adding a new event post-undo
- ending match while no active set
- history load switches to selected timeline

## 3. Release Decision
Ship only if all above pass.

If any check fails:
- capture failing step
- add a short note to `docs/TASK_BOARD.md`
- fix and rerun this checklist

After completion:
- fill `docs/RELEASE_SIGNOFF_TEMPLATE.md` and store it as a dated sign-off note
