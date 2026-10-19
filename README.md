# RestSpot

A crowdsourced restroom finder: find restrooms that meet your needs — wheelchair access,
changing tables, all-gender or family rooms, free/public access, open now — not just the closest one.

University of Arkansas CSCE Capstone, Fall 2026, sponsored by Dr. Suman Mitra.
See the [proposal](docs/RestSpot%20-%20Preliminary%20Proposal.pdf) and the running
[decisions log](docs/DECISIONS.md).

## Quick start

Requires Node 22+.

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Supabase keys configured, the app runs against a **local
in-browser database** (PGlite) that executes the real Supabase migrations and loads sample data
around campus. Sign in as `demo@restspot.test` or `admin@restspot.test` (password `password123`).

To use a real Supabase project, follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) and put
your keys in `apps/web/.env.local` (see `apps/web/.env.example`).

## Repository layout

```
apps/web/            React + TypeScript + Vite website
  src/pages/         Search, restroom detail, add/edit form, auth, dashboard
  src/map/           MapLibre map (OpenFreeMap tiles — free, no API key)
  src/dev/           Local PGlite backend + sample data (dev only, never in production builds)
packages/shared/     Code shared with the future Expo mobile app:
                     domain types, validation (zod), API client, Supabase backend, labels, hours/geo helpers
supabase/
  migrations/        Database schema, row-level security, and RPC functions (Postgres + PostGIS)
  tests/             Database tests: run the real migrations in PGlite with a stubbed auth schema
  seed/              OpenStreetMap seed data (SQL)
tools/osm-import/    Generates seed SQL from OpenStreetMap
docs/                Proposal, decisions log, setup guides
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the website (local database unless Supabase keys are set) |
| `npm test` | All tests: shared logic, database (RLS, RPCs, 10k-row performance), importer |
| `npm run typecheck` | TypeScript across all packages |
| `npm run lint` | Lint the website |
| `npm run build` | Production build of the website into `apps/web/dist` |
| `npm run import -w @restspot/osm-import -- --preset nwa --likely --out <file>` | Regenerate OSM seed data |

## Architecture in brief

- **One API, two backends.** The UI only talks to `RestSpotApi` (`packages/shared/src/api.ts`).
  `createRestSpotApi` implements it once on top of a small transport; Supabase and the local PGlite
  database each supply only the transport and auth. The Expo app will reuse the same package.
- **Security lives in the database.** Clients use the public anon key. Row-level security and
  `SECURITY DEFINER` functions enforce who can read and write what: guests read, signed-in users
  contribute (wiki-style, rate-limited, with edit history), anonymous reviews hide their author,
  and admin actions check the caller's role.
- **Listings are locations with rooms.** One map pin per place, each with men's / women's /
  all-gender rooms that carry their own accessibility and changing-table info. Unknown facts are
  stored as "unknown", never as "no".
- **Everything is free-tier.** Supabase free plan, OpenFreeMap tiles, Nominatim geocoding,
  OpenStreetMap seed data, static hosting.

## Deploying the website

The site is a static single-page app. On Vercel, Netlify, or Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `apps/web/dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

SPA routing is configured in `apps/web/vercel.json` and `apps/web/public/_redirects`.
