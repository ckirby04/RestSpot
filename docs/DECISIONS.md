# RestSpot – Project Decisions

Running log of decisions made before and during web development. The original spec is
[`RestSpot - Preliminary Proposal.pdf`](./RestSpot%20-%20Preliminary%20Proposal.pdf); where this
file differs from the proposal, this file wins.

Status key: **Decided** · **Proposed** (awaiting team sign-off) · **Open**

## Process

| Topic          | Decision                                                                          | Status  |
| -------------- | --------------------------------------------------------------------------------- | ------- |
| Platform order | Website first, port to iOS/Android later                                          | Decided |
| Branching      | Single personal branch (`clark/web`) for web development; no feature branches yet | Decided |
| Timeline       | No fixed milestones yet; tackle work as it comes                                  | Decided |
| Budget         | $0 — free tiers only wherever possible                                            | Decided |

## Stack

| Layer                   | Choice                                                             | Notes                                                                                  | Status      |
| ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------- |
| Web frontend            | React + TypeScript (Vite)                                          | Shared `packages/` for types, validation, API client so the Expo app can reuse them    | Decided     |
| Mobile (later)          | React Native via Expo                                              | Reuses shared packages                                                                 | Decided     |
| Backend                 | Supabase (Postgres + PostGIS, Auth, Row-Level Security, Realtime)  | Free tier: 500 MB DB; project pauses after ~1 week of inactivity                       | Decided     |
| Map rendering           | MapLibre GL JS + OpenFreeMap tiles                                 | Free, no API key, no billing account                                                   | Implemented |
| Geocoding               | Nominatim (OSM)                                                    | Free; ~1 req/s and no autocomplete per its usage policy, so search runs on submit only | Implemented |
| Directions              | Deep link to Google/Apple Maps                                     | Per proposal; no API cost                                                              | Decided     |
| Web hosting             | Vercel, Netlify, or Cloudflare Pages (free tier)                   | Static SPA; rewrites configured for each                                               | Proposed    |
| Data fetching / routing | TanStack Query, React Router                                       | Query cache refetches on realtime changes                                              | Implemented |
| Local development       | In-browser Postgres (PGlite + PostGIS) running the real migrations | Develop and demo with no Supabase project; never shipped in production builds          | Implemented |
| Testing                 | Vitest; database tests run the real migrations in PGlite           | 10k-restroom search runs in <35 ms (target 500 ms)                                     | Implemented |
| CI                      | GitHub Actions: typecheck, lint, test, build                       | Free for public repos                                                                  | Implemented |

## Product / data model

| Topic               | Decision                                                                                                                               | Status                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Fee                 | Restrooms record free vs. paid (plus optional "key/code required")                                                                     | Decided                             |
| Edits               | Wiki-style: registered users' edits go live immediately; full edit history allows rollback                                             | Decided                             |
| "Open now"          | Evaluated in the **restroom's** local time zone, not the viewer's device                                                               | Decided                             |
| Auth                | Email + password (min 8 chars), Google, and Apple sign-in                                                                              | Decided — see Apple cost note below |
| Photos              | None                                                                                                                                   | Decided                             |
| Duplicate detection | Warn when a listing with a similar name (trigram similarity, `pg_trgm`) is within 50 m                                                 | Decided                             |
| Admin               | Same dashboard for all; admin features gated by role/permissions                                                                       | Decided                             |
| Review anonymity    | Reviewer chooses per review whether to show their display name or post anonymously (admins can always see the author)                  | Decided                             |
| Unknown values      | Every amenity is tri-state: yes / no / unknown — crowdsourced data must not treat "unknown" as "no"                                    | Implemented                         |
| Reviews             | One review per user per listing (editable); cleanliness + overall 1–5, optional 500-char comment                                       | Implemented                         |
| Account deletion    | Deletes account, favorites, reports; reviews remain but become anonymous; listings stay                                                | Implemented                         |
| Rate limits         | 10 new listings/hour, 60 edits/hour, 60 confirmations/hour per user (admins exempt)                                                    | Implemented                         |
| Verification        | "Info is accurate" button marks a listing verified and shows the last-confirmed date                                                   | Implemented                         |
| Moderation          | Admins remove/restore listings, merge duplicates (moving reviews and favorites), roll back to any version, hide reviews, suspend users | Implemented                         |
| Gender / room model | See below                                                                                                                              | Implemented                         |
| Seed data           | See below                                                                                                                              | Implemented                         |

### Gendered restrooms (implemented)

A real location often has several rooms that differ: a men's and a women's multi-stall room, and
sometimes a single-user all-gender or family room. Amenities also differ between them (a changing
table only in the women's room is a common complaint). A single per-location gender flag can't show that.

**Model:** one map pin per **location**, holding one or more **rooms**.

- Each room has a **designation**: Men's · Women's · All-gender.
- Each room has a **layout**: Single-user · Multi-stall · Family (a family room is always all-gender).
- Room-level amenities: changing table, ADA-accessible stall/room.
- Location-level attributes: name, coordinates, access type (public / customers only / restricted),
  fee, hours, notes.

**Ergonomics:**

- Adding a restroom: tap the chips for what exists — `Men's` `Women's` `All-gender` — and a room is
  created for each. Amenities default to "all rooms"; there is an optional "only in…" refinement for
  people who know the details.
- Filters ask what the user needs and look at every room: "All-gender available",
  "Changing table" (optionally "…in a room I can use"), "Single-user / private".
- Detail view shows the rooms as compact rows with icons, so a parent can see right away
  _which_ room has the changing table.

### Seed data (implemented)

Seed the database before crowdsourcing begins, with each record's source and confidence stored:

1. **OpenStreetMap** `amenity=toilets` and `toilets=yes` via Overpass API — real, mapped restrooms
   (license: ODbL; requires attribution, and derived databases are share-alike).
2. **Likely restrooms** from OSM points of interest (rest areas, travel stops, libraries, malls,
   fuel stations, major chains). Implemented with deterministic rules in `tools/osm-import` (free,
   repeatable). An LLM could later help classify ambiguous POIs or normalize messy hours, but it
   **must not invent locations**: every record traces back to a real OSM element.
3. Every seeded record has `source` (`osm`, `poi_inferred`, `user`) and `verified = false` until a
   user confirms it, which the UI shows so users can judge how much to trust it.
4. Refuge Restrooms has a public API; check its terms before importing (not imported yet).
5. Northwest Arkansas import: 117 mapped restrooms (30 with room details) and 276 likely ones —
   see `supabase/seed/`.

## Open questions

- **Apple Sign-In costs money:** it requires an Apple Developer Program membership
  ($99/yr), and that membership is needed anyway to publish on iOS. Options: build Google + email
  now and add Apple when the team gets a developer account (e.g. through the university).
