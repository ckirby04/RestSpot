# Supabase setup

Everything here fits in Supabase's free plan. Free projects pause after about a week without
activity; un-pause them from the dashboard.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a new project (pick a US region near
   Arkansas, e.g. East US).
2. Save the database password in a password manager. The app never needs it.

## 2. Apply the database schema

**SQL Editor (simplest):** open _SQL Editor → New query_, paste the contents of
`supabase/migrations/20261019000000_init.sql`, and run it. This enables PostGIS and `pg_trgm`,
creates the tables, row-level security policies, and functions.

**Or with the Supabase CLI** (no install needed):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## 3. Load seed data (optional)

Paste `supabase/seed/osm-nwa.sql` into the SQL Editor and run it. See
[`supabase/seed/README.md`](../supabase/seed/README.md).

## 4. Configure authentication

_Authentication → URL Configuration_

- **Site URL:** your deployed URL (or `http://localhost:5173` while developing)
- **Redirect URLs:** add `http://localhost:5173/**` and your deployed URL with `/**`

_Authentication → Providers → Email_: leave enabled. Keep **Confirm email** on for production.
Minimum password length: 8 (matches the proposal).

### Google sign-in (free)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project →
   _APIs & Services → OAuth consent screen_ (External, add your app name and email).
2. _Credentials → Create credentials → OAuth client ID → Web application_.
   - Authorized JavaScript origins: `http://localhost:5173` and your deployed URL
   - Authorized redirect URI: the callback URL shown in Supabase under
     _Authentication → Providers → Google_ (looks like `https://<ref>.supabase.co/auth/v1/callback`)
3. Paste the client ID and secret into Supabase's Google provider and enable it.

### Apple sign-in (requires a paid Apple Developer account)

Apple sign-in needs an Apple Developer Program membership ($99/yr), which is also required to
publish the iOS app. Once the team has one, configure the Apple provider in Supabase following its
guide, then set `VITE_ENABLE_APPLE_SIGNIN=true`. Until then the Apple button is hidden.

## 5. Connect the website

_Project Settings → API_: copy the **Project URL** and the **anon / publishable key** into
`apps/web/.env.local`:

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

The anon key is meant to be public; row-level security protects the data.
**Never put the `service_role` key in the app or commit it.**

Restart `npm run dev`. The yellow "Local demo database" banner disappears when the app is using
Supabase.

## 6. Make yourself an admin

Sign up in the app, then run in the SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Admins see the Reports and Users tabs in the dashboard and moderation tools on listings.

## 7. Realtime (optional)

The migration adds `locations` to the `supabase_realtime` publication, so new listings and edits
appear for other users within seconds. If you created the project's publication later, re-run:

```sql
alter publication supabase_realtime add table public.locations;
```
