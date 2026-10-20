# Project status and handoff

_Last updated: October 20, 2026_

## Summary

- **Website:** feature-complete for the proposal and live at https://restspot.vercel.app.
- **Data:** ~390 Northwest Arkansas restrooms imported from OpenStreetMap, all unverified until
  users confirm them.
- **Mobile apps:** not started. `packages/shared` is ready to be reused by an Expo app.
- **Tests:** 42 unit/database/importer tests and 33 browser tests, all run in CI.

## Proposal requirements

Section numbers refer to the [proposal](RestSpot%20-%20Preliminary%20Proposal.pdf).

| Requirement (§4.2)                                                                       | Status                                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Location detection; address search if location is denied                                 | ✅ Done                                                                       |
| Proximity search, 0.1–25 mi radius, default 2 mi, sorted by distance                     | ✅ Done                                                                       |
| Filters: ADA, changing table, family, gender-neutral, public, open now, min. cleanliness | ✅ Done (plus free, single-user)                                              |
| Restroom records: name, coordinates, access type, restroom type, amenities, hours, notes | ✅ Done (rooms model; see DECISIONS.md)                                       |
| Edit history (who, when, which fields)                                                   | ✅ Done, with admin rollback                                                  |
| Duplicate warning for similar names within 50 m                                          | ✅ Done                                                                       |
| Ratings (cleanliness + overall, 1–5) with 500-char comments; averages to one decimal     | ✅ Done (plus anonymous option)                                               |
| Accounts: valid email, password ≥ 8; only signed-in users contribute                     | ✅ Done (email; Google ready to configure)                                    |
| Problem reports with reasons → admin queue                                               | ✅ Done                                                                       |
| Moderation: edit/remove listings and reviews, merge duplicates, suspend                  | ✅ Done                                                                       |
| Directions via the device's maps app                                                     | ✅ Done                                                                       |
| WCAG 2.1 AA                                                                              | 🟡 Automated axe checks pass on main pages; no manual screen-reader audit yet |
| Map + results within 3 s on LTE                                                          | 🟡 Not measured yet                                                           |
| Filter changes within 1 s                                                                | ✅ (local queries are near-instant)                                           |
| Proximity query < 500 ms for 10,000 restrooms                                            | ✅ < 35 ms in tests                                                           |
| New edits visible to others within 5 s                                                   | 🟡 Realtime is wired up; not measured on production                           |
| 100 concurrent users                                                                     | 🟡 Not load-tested (Supabase free tier allows ~200 realtime connections)      |
| iOS and Android apps                                                                     | ⬜ Not started                                                                |

## Accounts and access

Everything is on free plans. **Clark currently owns all of these; teammates need to be invited.**

| Service              | What                                                             | How teammates get access                                                   |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| GitHub               | [`ckirby04/RestSpot`](https://github.com/ckirby04/RestSpot)      | Repo settings → Collaborators                                              |
| Vercel               | Project `restspot` (deploys `main` to restspot.vercel.app)       | Free Hobby plan has one member; teammates see preview links on PRs instead |
| Supabase             | Project `RestSpot` (ref `maebnbpimejhqdjapmok`, US West)         | Organization settings → Team → Invite                                      |
| Google Cloud (OAuth) | Not created yet                                                  | —                                                                          |
| Apple Developer      | Not created ($99/yr); needed for Apple sign-in and the App Store | Ask whether the university provides one                                    |

The Supabase anon key is public and lives in Vercel's environment variables and in each
developer's `apps/web/.env.local`. The database password and `service_role` key must never be
shared in chat, committed, or put in the app.

## Next steps

Roughly in priority order. Each is a good first pull request.

1. **Google sign-in.** Create the OAuth client and enable it in Supabase
   ([guide](SUPABASE_SETUP.md#google-sign-in-free)). No code changes needed.
2. **Email delivery.** Supabase's built-in email only reaches project members, so _Confirm email_ is
   currently off. Set up a free SMTP provider (e.g. Resend), turn confirmation back on, and test
   password reset.
3. **Better names for unnamed restrooms.** Many OSM restrooms import as "Public restroom". Name them
   after the nearest building or park in `tools/osm-import`.
4. **Performance pass.** Lazy-load the map library, measure the 3-second LTE target with Chrome's
   network throttling and Lighthouse, and measure realtime latency on production.
5. **Mobile app.** Start an Expo app in `apps/mobile` that reuses `packages/shared`. Map options:
   MapLibre React Native (free) or `react-native-maps`.
6. **Manual accessibility audit** with VoiceOver/TalkBack and keyboard only.
7. **Load test** search and realtime against Supabase's free tier.
8. Small features: "closes soon" badge, show distance on the detail page from the device, installable
   PWA, Refuge Restrooms data (check their license first).

## Known issues and limitations

- **Open now** depends on crowdsourced hours, which are often unknown.
- **"Likely" restrooms** (gas stations, chains) are inferred from the type of place, not confirmed.
  They're labeled as such until a user verifies them.
- **Nominatim** (address search) allows about one request per second for the whole app and forbids
  autocomplete. Heavy use would need a different geocoder.
- **Free Supabase projects pause** after about a week with no activity. Un-pause from the dashboard.
- Deleting an account sends the user to the sign-in page rather than the home page.
- The Apple sign-in button is hidden until `VITE_ENABLE_APPLE_SIGNIN=true`.

## History

- **Oct 19–20, 2026:** Website built, tested, and deployed by Clark (with Claude Code) on the
  `clark/web` branch, then fast-forwarded to `main`.
