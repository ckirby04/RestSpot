## What and why

<!-- What does this change, and why? Link the issue if there is one. -->

## How to test

<!-- Steps a reviewer can follow, or "covered by tests". Add a screenshot for UI changes. -->

## Checklist

- [ ] `npm run format`, `npm run typecheck`, `npm run lint`, and `npm test` pass
- [ ] New or changed screens have an end-to-end test (`apps/web/e2e`)
- [ ] Database change? Added a **new** migration file and tests in `supabase/tests`, and noted below
      that it must be run in the Supabase SQL editor after merging
- [ ] Docs updated if behavior, setup, or decisions changed (`docs/`)
- [ ] No secrets committed (only the public anon key belongs in the app)

## Database migration to run after merge

<!-- File name(s) in supabase/migrations, or "none". -->
