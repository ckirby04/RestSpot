# Supabase and Vercel setup

How the production backend and hosting are set up, and how to recreate them. Everything here fits
in the free plans.

**Our project:** Supabase `RestSpot` (ref `maebnbpimejhqdjapmok`, West US) and Vercel project
`restspot` serving https://restspot.vercel.app. Ask Clark to invite you (see
[STATUS.md](STATUS.md#accounts-and-access)).

> Free Supabase projects pause after about a week with no activity. If the site can't load data,
> check the Supabase dashboard and click **Restore project**.

## 1. Create the Supabase project

_Only needed for a new environment; ours exists._

1. Sign in at [supabase.com](https://supabase.com) and create a project (a US region).
2. Save the database password in a password manager. The app never needs it.

## 2. Apply the schema

Open **SQL Editor → New query**, paste `supabase/migrations/20261019000000_init.sql`, and run it.
It enables PostGIS and `pg_trgm` and creates the tables, row-level security policies, and functions.

**Later migrations:** run each new file in `supabase/migrations/` the same way, in filename order,
once its pull request merges. Never re-run or edit one that's already applied.

The Supabase CLI also works (`npx supabase login`, `npx supabase link --project-ref <ref>`,
`npx supabase db push`), but it needs the database password.

## 3. Load seed data

Paste `supabase/seed/osm-nwa.sql` into a new SQL Editor query and run it. The editor will just say
_"Success. No rows returned"_. To check:

```sql
select source, count(*) from public.locations group by source;
```

Expect about 117 `osm` and 276 `poi_inferred`. It's safe to run again. See
[supabase/seed/README.md](../supabase/seed/README.md).

## 4. Authentication

**Authentication → URL Configuration**

- **Site URL:** `https://restspot.vercel.app`
- **Redirect URLs:** `https://restspot.vercel.app/**` and `http://localhost:5173/**`

**Authentication → Sign In / Providers**

- **Email:** enabled; minimum password length **8** (matches the proposal).
- **Confirm email:** Supabase's built-in email service only sends to members of the Supabase
  organization, and only a few per hour. Keep **Confirm email off** until custom SMTP is set up
  (below), or other people won't be able to finish signing up.

### Custom email (before a public launch)

Sign up for a free SMTP provider (for example [Resend](https://resend.com), 3,000 emails/month),
then fill in **Authentication → Emails → SMTP Settings**. After that, turn **Confirm email** back on
and test sign-up and password reset.

### Google sign-in (free)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, then
   **APIs & Services → OAuth consent screen** (External; app name, support email).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://restspot.vercel.app` and `http://localhost:5173`
   - Authorized redirect URI: the callback URL shown in Supabase under
     **Authentication → Sign In / Providers → Google** (`https://<ref>.supabase.co/auth/v1/callback`)
3. Paste the client ID and secret into Supabase's Google provider and enable it.

The "Continue with Google" button already exists in the app.

### Apple sign-in (needs a $99/yr Apple Developer account)

The same account is required to publish the iOS app. Once the team has one, configure the Apple
provider in Supabase, then set `VITE_ENABLE_APPLE_SIGNIN=true` in Vercel and redeploy.

## 5. Admins

Sign up in the app, then run in the SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'someone@example.com');

-- Check (the update itself reports "No rows returned" even when it works):
select u.email, p.display_name, p.role from auth.users u join public.profiles p on p.id = u.id;
```

Admins see **Reports** and **Users** tabs in the dashboard and moderation tools on each listing.

## 6. Keys

**Project Settings → API** has the **Project URL** and the **anon / publishable key**.

- The anon key is **public by design**; it ships in the website. Row-level security protects the data.
- **Never** use the `service_role` key or the database password in the app, in Vercel's `VITE_`
  variables, in chat, or in Git.

For local development against Supabase, put the two values in `apps/web/.env.local` (gitignored):

```bash
VITE_SUPABASE_URL=https://maebnbpimejhqdjapmok.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Remember that this is the production database.

## 7. Vercel

The project imports this GitHub repo with **Root Directory `./`**. Build settings come from the root
`vercel.json` (`npm ci`, `npm run build`, output `apps/web/dist`, SPA rewrites).

- **Production** deploys every push to `main`. Pull requests get preview deployments.
- **Environment variables:** **Settings → Environments → Production** (and Preview): add
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Vite bakes them in at build time, so after
  changing them, **Deployments → ⋯ → Redeploy**.
- Don't create custom environments; that's a paid feature and not needed.

## 8. Realtime

The migration adds `locations` to the `supabase_realtime` publication so new listings and edits
show up for other users within seconds. If that ever needs re-doing:

```sql
alter publication supabase_realtime add table public.locations;
```
