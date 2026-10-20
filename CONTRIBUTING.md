# Contributing to RestSpot

Read this before your first change. If anything here is wrong or missing, fix it in the same pull
request.

## Setup

1. Install **Node 22+** and Git.
2. `git clone https://github.com/ckirby04/RestSpot.git && cd RestSpot && npm install`
3. `npm run dev` and open http://localhost:5173.

You don't need any accounts to develop. With no Supabase keys, the app runs on an in-browser
database (see [Local database](#local-database)). For end-to-end tests, also run
`npx playwright install chromium` once in `apps/web`.

Recommended VS Code extensions: Prettier (format on save) and Playwright Test.

## Workflow

- **`main` is production.** Every push to `main` deploys to https://restspot.vercel.app.
  Don't push to `main` directly.
- **Work on a branch** named for what it does: `feature/closes-soon-badge`, `fix/review-form-focus`,
  `mobile/expo-setup`. Branch from the latest `main`.
- **Open a pull request into `main`.** Vercel posts a preview link on the PR, and CI runs formatting,
  types, lint, unit/database tests, the build, and the browser tests. Get one teammate's review, then
  merge.
- Keep pull requests small and focused; one feature or fix each.
- Before pushing: `npm run format && npm run typecheck && npm run lint && npm test`.

## Where things go

| You're changing…                         | Look in                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| A screen                                 | `apps/web/src/pages/`                                                   |
| Shared UI pieces (badges, stars, dialog) | `apps/web/src/components/ui.tsx`                                        |
| The map                                  | `apps/web/src/map/RestroomMap.tsx`                                      |
| Data fetching / caching in the web app   | `apps/web/src/api/hooks.ts`                                             |
| Types, validation, labels, hours logic   | `packages/shared/src/` (also used by the future mobile app)             |
| What the client can ask the backend      | `packages/shared/src/api.ts` (interface) + `client.ts` (implementation) |
| Tables, security rules, server functions | `supabase/migrations/` (see below)                                      |
| Styles                                   | `apps/web/src/index.css` (CSS variables at the top)                     |

**`packages/shared` must stay platform-neutral**: no DOM, no React, no browser-only APIs. The Expo
app will import it.

## Changing the database

The production database already has `supabase/migrations/20261019000000_init.sql` applied.
**Never edit a migration that has been applied.** Instead:

1. Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_short_description.sql`.
2. Write the change in plain SQL. Keep row-level security on, grant only what clients need, and
   prefer `SECURITY DEFINER` functions (with `set search_path`) for writes that need validation.
3. Add tests in `supabase/tests/schema.test.ts`. They run your migration in PGlite with a fake
   Supabase `auth` schema, so you can test policies as `anon`, a user, or an admin.
4. If clients need it, update `packages/shared` (types, mappers, `api.ts`, `client.ts`).
5. `npm test`. The local dev database rebuilds itself automatically when migrations change.
6. After the PR merges, someone with Supabase access pastes the new migration into the
   **Supabase SQL editor** and runs it. Note it in the PR description so it isn't forgotten.

## Testing

| Suite              | Where                            | Runs                                                       |
| ------------------ | -------------------------------- | ---------------------------------------------------------- |
| Shared logic       | `packages/shared/src/*.test.ts`  | `npm test`                                                 |
| Database           | `supabase/tests/`                | `npm test` (real migrations in PGlite, incl. RLS)          |
| OSM importer       | `tools/osm-import/src/*.test.ts` | `npm test`                                                 |
| Browser end-to-end | `apps/web/e2e/`                  | `npm run test:e2e` (Playwright + axe accessibility checks) |

End-to-end tests run against the local in-browser database with the map tiles and geocoder stubbed,
so they don't need the network. Each test gets a fresh database. Use the helpers in
`e2e/fixtures.ts` (`signIn`, `openRestroom`, `mapPins`, `pageAs`) and prefer accessible selectors
(`getByRole`, `getByLabel`). If you add a screen, add an end-to-end test and an accessibility check
for it.

## Local database

`apps/web/src/dev/localBackend.ts` runs the real migrations in the browser with PGlite and stores
the data in IndexedDB. It loads the sample data from `src/dev/sampleData.ts`. Useful facts:

- It's only used when `VITE_SUPABASE_URL` is unset (or `VITE_BACKEND=local`), and is never included
  in production builds.
- It rebuilds itself when a migration or the sample data changes. To reset it by hand, clear the
  site's data in your browser's dev tools (Application → Storage).
- Google/Apple sign-in are simulated with fake accounts. Emails are never sent.

## Code style

- Prettier formats everything (`npm run format`); CI fails on unformatted code.
- TypeScript strict mode; no `any` in app code unless you're mapping raw database rows.
- Keep components small and colocate page-only pieces in the page file.
- Use `useNow()` instead of `new Date()` while rendering.
- Write comments that explain _why_, not _what_.

## Accessibility

The proposal requires WCAG 2.1 AA. In practice:

- Every input has a visible `<label>`; groups of options use `<fieldset>` + `<legend>`.
- Never convey something by color alone (open/closed status always has text).
- Interactive things are real `<button>`s and `<a>`s and are reachable by keyboard.
- Run `npm run test:e2e`: the accessibility tests fail on new axe violations.

## Security

- The Supabase **anon key is public**; it ships in the website. Security comes from row-level
  security and the checks inside database functions.
- **Never** put the `service_role` key, database password, or any other secret in the code, in
  `.env` files that get committed, or in Vercel's `VITE_` variables (those are public).
- `.env.local` is gitignored; keep it that way.
