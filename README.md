# RestSpot

**A crowdsourced restroom finder.** Find restrooms that meet your needs — wheelchair access,
changing tables, all-gender or family rooms, free and public access, open now — not just the
closest one.

**Live site:** https://restspot.vercel.app

University of Arkansas CSCE Capstone, Fall 2026 · Luke Fletcher, Lane Harper, Alex Hayek,
Clark Kirby, Eli McCrary, Will Whitlow · Sponsor: Dr. Suman Mitra (Civil Engineering)

## Where things stand

The **website is feature-complete** for the proposal's requirements and deployed on Vercel +
Supabase with ~390 seeded restrooms in Northwest Arkansas. The **iOS/Android apps haven't been
started**; the shared code in `packages/shared` is built to be reused by them.

See **[docs/STATUS.md](docs/STATUS.md)** for what's done, what's next, known issues, and who owns
which accounts.

## Get it running (5 minutes)

You need **Node 22+** and Git.

```bash
git clone https://github.com/ckirby04/RestSpot.git
cd RestSpot
npm install
npm run dev
```

Open http://localhost:5173. **No accounts or keys needed:** without Supabase keys, the app runs on
a database inside your browser (PGlite) that executes the real schema and loads sample data around
campus. Sign in as `demo@restspot.test` or `admin@restspot.test`, password `password123`.

To develop against the real Supabase project instead, copy `apps/web/.env.example` to
`apps/web/.env.local` and fill in the URL and anon key (ask Clark, or see
[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)). Be careful: that's the production database.

## Documentation

| Doc                                                              | Read it when…                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)                               | Before your first change: workflow, testing, database changes, code style |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                     | You want to understand how the pieces fit together                        |
| [docs/STATUS.md](docs/STATUS.md)                                 | You're picking up work: done, next, known issues, accounts                |
| [docs/DECISIONS.md](docs/DECISIONS.md)                           | You're wondering _why_ something is the way it is                         |
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)                 | Setting up or changing the Supabase project, auth, or Vercel              |
| [supabase/seed/README.md](supabase/seed/README.md)               | Loading or regenerating OpenStreetMap seed data                           |
| [Proposal (PDF)](docs/RestSpot%20-%20Preliminary%20Proposal.pdf) | The original requirements                                                 |

## Repository layout

```
apps/web/              The website: React + TypeScript + Vite
  src/pages/           One file per screen (search, restroom, add/edit, auth, dashboard)
  src/dev/             Local in-browser database + sample data (dev only)
  e2e/                 Playwright end-to-end tests
packages/shared/       Shared with the future mobile app: types, validation, API client, helpers
supabase/
  migrations/          Database schema, security rules, and server functions (SQL)
  tests/               Database tests (run the real migrations in PGlite)
  seed/                OpenStreetMap seed data (SQL)
tools/osm-import/      Generates seed data from OpenStreetMap
docs/                  Proposal, status, architecture, decisions, setup guides
```

## Commands

Run from the repo root.

| Command             | What it does                                                                        |
| ------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`       | Start the website at http://localhost:5173                                          |
| `npm test`          | Unit, database, and importer tests (~30 s)                                          |
| `npm run test:e2e`  | Browser tests (~1 min). First time: `npx playwright install chromium` in `apps/web` |
| `npm run typecheck` | TypeScript checks for every package                                                 |
| `npm run lint`      | Lint the website                                                                    |
| `npm run format`    | Auto-format everything with Prettier (`format:check` to just check)                 |
| `npm run build`     | Production build into `apps/web/dist`                                               |

CI runs all of these on every push and pull request.

## Tech at a glance

React 19, TypeScript, Vite, TanStack Query, React Router · MapLibre GL with free OpenFreeMap tiles
· Nominatim geocoding · Supabase (Postgres + PostGIS, Auth, Row-Level Security, Realtime) · Vitest,
PGlite, Playwright, axe · Vercel · Everything runs on free tiers.

## Data credits

Map data and seed restrooms © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, available under the Open Database License. Map tiles by
[OpenFreeMap](https://openfreemap.org).
