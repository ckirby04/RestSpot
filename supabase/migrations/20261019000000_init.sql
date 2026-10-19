-- RestSpot initial schema.
--
-- Model: one `locations` row per map pin, holding one or more `rooms`
-- (men's / women's / all-gender). See docs/DECISIONS.md.
--
-- Security model:
--   * Everyone (including anonymous guests) can read active listings.
--   * Signed-in, non-suspended users write listings only through the
--     SECURITY DEFINER functions below, which validate input, rate-limit,
--     and record edit history in the same transaction.
--   * Reviews are read through get_location_reviews() so anonymous reviews
--     never expose their author to other users.
--   * Admin-only operations check is_admin().

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  role text not null default 'user' check (role in ('user', 'admin')),
  suspended_until timestamptz,
  suspension_reason text check (char_length(suspension_reason) <= 500),
  created_at timestamptz not null default now()
);

-- Create a profile whenever a user signs up (email, Google, or Apple).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );
begin
  insert into public.profiles (id, display_name) values (new.id, left(name, 50));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Signed in and not currently suspended.
create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and (suspended_until is null or suspended_until <= now())
  );
$$;

create function public.require_active_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to contribute' using errcode = '28000';
  end if;
  if not is_active_user() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Locations and rooms
-- ---------------------------------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  geog geography (point, 4326) not null,
  time_zone text not null default 'America/Chicago',
  access_type text not null check (access_type in ('public', 'customers_only', 'restricted')),
  fee text not null default 'unknown' check (fee in ('free', 'paid', 'unknown')),
  key_required text not null default 'unknown' check (key_required in ('yes', 'no', 'unknown')),
  hours jsonb not null default '[{"kind":"unknown"},{"kind":"unknown"},{"kind":"unknown"},{"kind":"unknown"},{"kind":"unknown"},{"kind":"unknown"},{"kind":"unknown"}]'
    check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) = 7),
  notes text check (char_length(notes) <= 500),
  source text not null default 'user' check (source in ('user', 'osm', 'poi_inferred')),
  -- External id for imported rows (e.g. "osm:node/123"), so re-imports update instead of duplicating.
  source_ref text unique,
  verified boolean not null default false,
  last_confirmed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  merged_into uuid references public.locations (id)
);

create index locations_geog_idx on public.locations using gist (geog);
create index locations_name_trgm_idx on public.locations using gin (name gin_trgm_ops);
create index locations_active_idx on public.locations (id) where deleted_at is null;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  designation text not null check (designation in ('mens', 'womens', 'all_gender')),
  layout text not null check (layout in ('single_user', 'multi_stall', 'family')),
  changing_table text not null default 'unknown' check (changing_table in ('yes', 'no', 'unknown')),
  ada_accessible text not null default 'unknown' check (ada_accessible in ('yes', 'no', 'unknown')),
  position smallint not null default 0,
  constraint family_rooms_are_all_gender check (layout <> 'family' or designation = 'all_gender')
);

create index rooms_location_idx on public.rooms (location_id);

-- Field-level edit history for every change to a listing.
create table public.location_edits (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations (id) on delete cascade,
  editor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('create', 'update', 'confirm', 'rollback', 'merge', 'delete', 'restore')),
  -- { "field": { "old": ..., "new": ... }, ... }
  changes jsonb not null default '{}',
  -- Full snapshot after the edit, used for rollback.
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create index location_edits_location_idx on public.location_edits (location_id, created_at desc);
create index location_edits_editor_idx on public.location_edits (editor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reviews, reports, favorites
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  -- Null after the author deletes their account; the review remains, anonymized.
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  overall smallint not null check (overall between 1 and 5),
  cleanliness smallint not null check (cleanliness between 1 and 5),
  comment text check (char_length(comment) <= 500),
  anonymous boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, author_id)
);

create index reviews_location_idx on public.reviews (location_id) where not hidden;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null default auth.uid(),
  reason text not null check (reason in ('closed', 'incorrect_info', 'duplicate', 'inappropriate')),
  comment text check (char_length(comment) <= 500),
  -- For 'duplicate' reports: the listing this one duplicates, if known.
  duplicate_of uuid references public.locations (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_open_idx on public.reports (created_at) where status = 'open';

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.hhmm_to_minutes(t text) returns int
language sql immutable as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int;
$$;

-- Whether a restroom is open at `at`, in the restroom's own time zone.
-- Mirrors isOpenNow() in packages/shared/src/hours.ts. Null = unknown.
create function public.is_open_at(hours jsonb, tz text, at timestamptz default now())
returns boolean
language plpgsql stable as $$
declare
  local_ts timestamp := at at time zone tz;
  dow int := extract(dow from local_ts)::int;
  mins int := extract(hour from local_ts)::int * 60 + extract(minute from local_ts)::int;
  today jsonb := hours -> dow;
  yesterday jsonb := hours -> ((dow + 6) % 7);
  o int;
  c int;
begin
  if yesterday ->> 'kind' = 'open' then
    o := hhmm_to_minutes(yesterday ->> 'open');
    c := hhmm_to_minutes(yesterday ->> 'close');
    if c <= o and mins < c then
      return true;
    end if;
  end if;

  case today ->> 'kind'
    when 'closed' then return false;
    when 'all_day' then return true;
    when 'open' then
      o := hhmm_to_minutes(today ->> 'open');
      c := hhmm_to_minutes(today ->> 'close');
      if c > o then
        return mins >= o and mins < c;
      end if;
      return mins >= o;
    else
      return null;
  end case;
end;
$$;

create function public.validate_hours(hours jsonb) returns void
language plpgsql immutable as $$
declare
  d jsonb;
begin
  if jsonb_typeof(hours) <> 'array' or jsonb_array_length(hours) <> 7 then
    raise exception 'Hours must list all 7 days' using errcode = '22023';
  end if;
  for d in select * from jsonb_array_elements(hours) loop
    if d ->> 'kind' not in ('unknown', 'closed', 'all_day', 'open') then
      raise exception 'Invalid hours kind: %', d ->> 'kind' using errcode = '22023';
    end if;
    if d ->> 'kind' = 'open' and (
      coalesce(d ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(d ->> 'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    ) then
      raise exception 'Hours must use 24-hour HH:MM' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Rate limit: at most `max_count` rows of `kind` edits by the current user within `window`.
create function public.check_edit_rate(kinds text[], max_count int, win interval) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if is_admin() then
    return;
  end if;
  if (
    select count(*) from location_edits
    where editor_id = auth.uid() and kind = any (kinds) and created_at > now() - win
  ) >= max_count then
    raise exception 'Too many changes — please wait a bit and try again' using errcode = '54000';
  end if;
end;
$$;

-- JSON representation of a listing (location + rooms). Used for API results and edit snapshots.
create function public.location_json(loc public.locations) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', loc.id,
    'name', loc.name,
    'lat', st_y(loc.geog::geometry),
    'lng', st_x(loc.geog::geometry),
    'time_zone', loc.time_zone,
    'access_type', loc.access_type,
    'fee', loc.fee,
    'key_required', loc.key_required,
    'hours', loc.hours,
    'notes', loc.notes,
    'source', loc.source,
    'verified', loc.verified,
    'last_confirmed_at', loc.last_confirmed_at,
    'created_at', loc.created_at,
    'updated_at', loc.updated_at,
    'deleted_at', loc.deleted_at,
    'merged_into', loc.merged_into,
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'designation', r.designation,
        'layout', r.layout,
        'changing_table', r.changing_table,
        'ada_accessible', r.ada_accessible
      ) order by r.position, r.id)
      from rooms r where r.location_id = loc.id
    ), '[]'::jsonb)
  );
$$;

-- Field-by-field diff of two location_json() snapshots.
create function public.jsonb_diff(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('old', a -> k, 'new', b -> k)), '{}'::jsonb)
  from (
    select k from jsonb_object_keys(coalesce(b, '{}'::jsonb)) k
    where k not in ('id', 'created_at', 'updated_at', 'last_confirmed_at')
  ) keys
  where (a -> k) is distinct from (b -> k);
$$;

-- Replace a listing's rooms from a JSON array.
create function public.replace_rooms(loc_id uuid, rooms_in jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  i int := 0;
begin
  if jsonb_typeof(rooms_in) <> 'array' or jsonb_array_length(rooms_in) = 0 then
    raise exception 'Add at least one room' using errcode = '22023';
  end if;
  if jsonb_array_length(rooms_in) > 20 then
    raise exception 'Too many rooms' using errcode = '22023';
  end if;
  delete from rooms where location_id = loc_id;
  for r in select * from jsonb_array_elements(rooms_in) loop
    insert into rooms (location_id, designation, layout, changing_table, ada_accessible, position)
    values (
      loc_id,
      r ->> 'designation',
      r ->> 'layout',
      coalesce(r ->> 'changing_table', 'unknown'),
      coalesce(r ->> 'ada_accessible', 'unknown'),
      i
    );
    i := i + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API: search and read
-- ---------------------------------------------------------------------------

create function public.search_restrooms(
  near_lat double precision,
  near_lng double precision,
  radius_miles double precision default 2,
  ada_accessible boolean default false,
  changing_table boolean default false,
  all_gender boolean default false,
  family boolean default false,
  single_user boolean default false,
  public_only boolean default false,
  free_only boolean default false,
  open_now boolean default false,
  min_cleanliness double precision default null,
  max_results int default 200
)
returns table (
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  time_zone text,
  access_type text,
  fee text,
  key_required text,
  hours jsonb,
  notes text,
  source text,
  verified boolean,
  last_confirmed_at timestamptz,
  updated_at timestamptz,
  rooms jsonb,
  avg_overall numeric,
  avg_cleanliness numeric,
  review_count int,
  is_open boolean
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  origin geography := st_setsrid(st_makepoint(near_lng, near_lat), 4326)::geography;
  radius_m double precision;
begin
  if near_lat not between -90 and 90 or near_lng not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  radius_m := least(greatest(coalesce(radius_miles, 2), 0.1), 25) * 1609.344;

  return query
  select
    l.id,
    l.name,
    st_y(l.geog::geometry),
    st_x(l.geog::geometry),
    st_distance(l.geog, origin),
    l.time_zone,
    l.access_type,
    l.fee,
    l.key_required,
    l.hours,
    l.notes,
    l.source,
    l.verified,
    l.last_confirmed_at,
    l.updated_at,
    rm.rooms,
    rv.avg_overall,
    rv.avg_cleanliness,
    rv.review_count,
    is_open_at(l.hours, l.time_zone)
  from locations l
  cross join lateral (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'designation', r.designation,
        'layout', r.layout,
        'changing_table', r.changing_table,
        'ada_accessible', r.ada_accessible
      ) order by r.position, r.id), '[]'::jsonb) as rooms,
      bool_or(r.ada_accessible = 'yes') as has_ada,
      bool_or(r.changing_table = 'yes') as has_changing,
      bool_or(r.designation = 'all_gender') as has_all_gender,
      bool_or(r.layout = 'family') as has_family,
      bool_or(r.layout in ('single_user', 'family')) as has_single
    from rooms r where r.location_id = l.id
  ) rm
  cross join lateral (
    select
      round(avg(v.overall), 1) as avg_overall,
      round(avg(v.cleanliness), 1) as avg_cleanliness,
      count(*)::int as review_count
    from reviews v where v.location_id = l.id and not v.hidden
  ) rv
  where l.deleted_at is null
    and st_dwithin(l.geog, origin, radius_m)
    and (not search_restrooms.ada_accessible or coalesce(rm.has_ada, false))
    and (not search_restrooms.changing_table or coalesce(rm.has_changing, false))
    and (not search_restrooms.all_gender or coalesce(rm.has_all_gender, false))
    and (not search_restrooms.family or coalesce(rm.has_family, false))
    and (not search_restrooms.single_user or coalesce(rm.has_single, false))
    and (not public_only or l.access_type = 'public')
    and (not free_only or l.fee = 'free')
    and (not open_now or is_open_at(l.hours, l.time_zone) is true)
    and (min_cleanliness is null or rv.avg_cleanliness >= min_cleanliness)
  order by l.geog <-> origin
  limit least(greatest(coalesce(max_results, 200), 1), 500);
end;
$$;

-- Listing plus review summary and the caller's favorite status.
create function public.location_detail_json(loc public.locations) returns jsonb
language sql stable security definer set search_path = public as $$
  select location_json(loc) || jsonb_build_object(
    'avg_overall', (select round(avg(overall), 1) from reviews v where v.location_id = loc.id and not v.hidden),
    'avg_cleanliness', (select round(avg(cleanliness), 1) from reviews v where v.location_id = loc.id and not v.hidden),
    'review_count', (select count(*) from reviews v where v.location_id = loc.id and not v.hidden),
    'is_open', is_open_at(loc.hours, loc.time_zone),
    'is_favorite', exists (select 1 from favorites f where f.location_id = loc.id and f.user_id = auth.uid()),
    'created_by_me', loc.created_by is not null and loc.created_by = auth.uid()
  );
$$;

create function public.get_location(location_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select location_detail_json(l)
  from locations l
  where l.id = get_location.location_id and (l.deleted_at is null or is_admin());
$$;

-- The caller's saved listings, most recently saved first.
create function public.get_favorites() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select location_detail_json(l)
  from favorites f
  join locations l on l.id = f.location_id
  where f.user_id = auth.uid() and l.deleted_at is null
  order by f.created_at desc;
$$;

-- The caller's reviews and listing edits, for their dashboard.
create function public.get_my_contributions() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'location_id', v.location_id, 'location_name', l.name,
        'overall', v.overall, 'cleanliness', v.cleanliness, 'comment', v.comment,
        'anonymous', v.anonymous, 'hidden', v.hidden, 'created_at', v.created_at
      ) order by v.created_at desc)
      from reviews v join locations l on l.id = v.location_id
      where v.author_id = auth.uid()
    ), '[]'::jsonb),
    'edits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'location_id', e.location_id, 'location_name', l.name,
        'kind', e.kind, 'changed_fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(e.changes) k),
        'created_at', e.created_at
      ) order by e.created_at desc)
      from (select * from location_edits where editor_id = auth.uid() order by created_at desc limit 100) e
      join locations l on l.id = e.location_id
    ), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

-- Reviews for a listing. Anonymous reviews hide the author from everyone except admins.
create function public.get_location_reviews(location_id uuid)
returns table (
  id uuid,
  overall smallint,
  cleanliness smallint,
  comment text,
  anonymous boolean,
  hidden boolean,
  author_display_name text,
  author_id uuid,
  is_mine boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    v.id, v.overall, v.cleanliness, v.comment, v.anonymous, v.hidden,
    case when not v.anonymous or is_admin() then p.display_name end,
    case when is_admin() then v.author_id end,
    v.author_id is not null and v.author_id = auth.uid(),
    v.created_at, v.updated_at
  from reviews v
  left join profiles p on p.id = v.author_id
  where v.location_id = get_location_reviews.location_id
    and (not v.hidden or is_admin())
  order by v.created_at desc;
$$;

create function public.get_location_history(location_id uuid)
returns table (id bigint, kind text, changes jsonb, editor_display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.kind, e.changes, p.display_name, e.created_at
  from location_edits e
  left join profiles p on p.id = e.editor_id
  where e.location_id = get_location_history.location_id
  order by e.created_at desc, e.id desc
  limit 100;
$$;

-- Listings with a similar name within `radius_m` meters (default 50 m), for duplicate warnings.
create function public.find_possible_duplicates(
  near_lat double precision,
  near_lng double precision,
  candidate_name text,
  radius_m double precision default 50,
  exclude_id uuid default null
)
returns table (id uuid, name text, distance_meters double precision, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  with origin as (select st_setsrid(st_makepoint(near_lng, near_lat), 4326)::geography as g)
  select l.id, l.name, st_distance(l.geog, o.g), similarity(lower(l.name), lower(candidate_name))
  from locations l, origin o
  where l.deleted_at is null
    and (exclude_id is null or l.id <> exclude_id)
    and st_dwithin(l.geog, o.g, least(greatest(radius_m, 1), 500))
    and similarity(lower(l.name), lower(candidate_name)) >= 0.3
  order by 4 desc, 3;
$$;

-- ---------------------------------------------------------------------------
-- Contributor API (signed-in, not suspended)
-- ---------------------------------------------------------------------------

-- Create (payload without id) or update (payload with id) a listing and its rooms.
-- payload: { id?, name, lat, lng, time_zone, access_type, fee, key_required, hours, notes, rooms: [...] }
create function public.save_location(payload jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := require_active_user();
  loc_id uuid := nullif(payload ->> 'id', '')::uuid;
  before jsonb;
  after jsonb;
  diff jsonb;
  tz text := coalesce(nullif(payload ->> 'time_zone', ''), 'America/Chicago');
  lat double precision := (payload ->> 'lat')::double precision;
  lng double precision := (payload ->> 'lng')::double precision;
  clean_notes text := nullif(trim(payload ->> 'notes'), '');
  existing locations;
begin
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where pg_timezone_names.name = tz) then
    raise exception 'Unknown time zone: %', tz using errcode = '22023';
  end if;
  perform validate_hours(payload -> 'hours');

  if loc_id is null then
    perform check_edit_rate(array['create'], 10, interval '1 hour');
    insert into locations (name, geog, time_zone, access_type, fee, key_required, hours, notes, created_by)
    values (
      trim(payload ->> 'name'),
      st_setsrid(st_makepoint(lng, lat), 4326)::geography,
      tz,
      payload ->> 'access_type',
      coalesce(payload ->> 'fee', 'unknown'),
      coalesce(payload ->> 'key_required', 'unknown'),
      payload -> 'hours',
      clean_notes,
      uid
    )
    returning id into loc_id;
    perform replace_rooms(loc_id, payload -> 'rooms');
    select location_json(l) into after from locations l where l.id = loc_id;
    insert into location_edits (location_id, editor_id, kind, changes, snapshot)
    values (loc_id, uid, 'create', jsonb_diff('{}'::jsonb, after), after);
    return loc_id;
  end if;

  perform check_edit_rate(array['update'], 60, interval '1 hour');
  select * into existing from locations where id = loc_id for update;
  if not found or (existing.deleted_at is not null and not is_admin()) then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  before := location_json(existing);

  update locations set
    name = trim(payload ->> 'name'),
    geog = st_setsrid(st_makepoint(lng, lat), 4326)::geography,
    time_zone = tz,
    access_type = payload ->> 'access_type',
    fee = coalesce(payload ->> 'fee', 'unknown'),
    key_required = coalesce(payload ->> 'key_required', 'unknown'),
    hours = payload -> 'hours',
    notes = clean_notes,
    updated_at = now()
  where id = loc_id;
  perform replace_rooms(loc_id, payload -> 'rooms');

  select location_json(l) into after from locations l where l.id = loc_id;
  -- Room ids are regenerated on every save; compare rooms by content only.
  diff := jsonb_diff(
    before || jsonb_build_object('rooms', (select coalesce(jsonb_agg(r - 'id'), '[]') from jsonb_array_elements(before -> 'rooms') r)),
    after || jsonb_build_object('rooms', (select coalesce(jsonb_agg(r - 'id'), '[]') from jsonb_array_elements(after -> 'rooms') r))
  );
  if diff <> '{}'::jsonb then
    insert into location_edits (location_id, editor_id, kind, changes, snapshot)
    values (loc_id, uid, 'update', diff, after);
  end if;
  return loc_id;
end;
$$;

-- "This info is still accurate." Marks the listing verified and refreshes its confirmation date.
create function public.confirm_location(location_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_active_user();
begin
  perform check_edit_rate(array['confirm'], 60, interval '1 hour');
  update locations set verified = true, last_confirmed_at = now()
  where id = confirm_location.location_id and deleted_at is null;
  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  insert into location_edits (location_id, editor_id, kind) values (confirm_location.location_id, uid, 'confirm');
end;
$$;

-- Create or replace the caller's review of a listing (one review per user per listing).
create function public.save_my_review(
  location_id uuid,
  overall int,
  cleanliness int,
  comment text default null,
  anonymous boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_active_user();
  clean_comment text := nullif(trim(comment), '');
begin
  if not exists (select 1 from locations l where l.id = save_my_review.location_id and l.deleted_at is null) then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  insert into reviews as v (location_id, author_id, overall, cleanliness, comment, anonymous)
  values (save_my_review.location_id, uid, overall, cleanliness, clean_comment, coalesce(anonymous, false))
  on conflict on constraint reviews_location_id_author_id_key do update set
    overall = excluded.overall,
    cleanliness = excluded.cleanliness,
    comment = excluded.comment,
    anonymous = excluded.anonymous,
    updated_at = now();
end;
$$;

create function public.delete_my_review(location_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from reviews v where v.location_id = delete_my_review.location_id and v.author_id = auth.uid();
end;
$$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin API
-- ---------------------------------------------------------------------------

create function public.admin_set_location_deleted(location_id uuid, deleted boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_admin();
begin
  update locations
  set deleted_at = case when deleted then now() end, updated_at = now()
  where id = admin_set_location_deleted.location_id;
  insert into location_edits (location_id, editor_id, kind)
  values (admin_set_location_deleted.location_id, uid, case when deleted then 'delete' else 'restore' end);
end;
$$;

-- Merge `duplicate_id` into `keep_id`: move reviews (keeping the newest per author),
-- favorites and reports, then retire the duplicate.
create function public.admin_merge_locations(duplicate_id uuid, keep_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_admin();
begin
  if duplicate_id = keep_id then
    raise exception 'Cannot merge a listing into itself' using errcode = '22023';
  end if;
  if not exists (select 1 from locations where id = keep_id and deleted_at is null) then
    raise exception 'Listing to keep not found' using errcode = 'P0002';
  end if;

  -- Drop the duplicate's review when the same author already reviewed the kept listing.
  delete from reviews d
  where d.location_id = duplicate_id
    and exists (select 1 from reviews k where k.location_id = keep_id and k.author_id = d.author_id);
  update reviews set location_id = keep_id where location_id = duplicate_id;

  insert into favorites (user_id, location_id, created_at)
  select user_id, keep_id, created_at from favorites where location_id = duplicate_id
  on conflict do nothing;
  delete from favorites where location_id = duplicate_id;

  update reports set location_id = keep_id where location_id = duplicate_id and status <> 'open';
  update reports set status = 'resolved', resolved_by = uid, resolved_at = now()
  where location_id = duplicate_id and status = 'open';

  update locations set deleted_at = now(), merged_into = keep_id, updated_at = now() where id = duplicate_id;
  insert into location_edits (location_id, editor_id, kind, changes)
  values (duplicate_id, uid, 'merge', jsonb_build_object('merged_into', jsonb_build_object('old', null, 'new', keep_id)));
end;
$$;

-- Restore a listing to the snapshot recorded by a previous edit.
create function public.admin_rollback_location(edit_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := require_admin();
  e location_edits;
  before jsonb;
  after jsonb;
  s jsonb;
begin
  select * into e from location_edits where id = edit_id;
  if not found or e.snapshot is null then
    raise exception 'That edit cannot be rolled back' using errcode = '22023';
  end if;
  s := e.snapshot;
  select location_json(l) into before from locations l where l.id = e.location_id for update;

  update locations set
    name = s ->> 'name',
    geog = st_setsrid(st_makepoint((s ->> 'lng')::double precision, (s ->> 'lat')::double precision), 4326)::geography,
    time_zone = s ->> 'time_zone',
    access_type = s ->> 'access_type',
    fee = s ->> 'fee',
    key_required = s ->> 'key_required',
    hours = s -> 'hours',
    notes = s ->> 'notes',
    updated_at = now()
  where id = e.location_id;
  perform replace_rooms(e.location_id, s -> 'rooms');

  select location_json(l) into after from locations l where l.id = e.location_id;
  insert into location_edits (location_id, editor_id, kind, changes, snapshot)
  values (e.location_id, uid, 'rollback', jsonb_diff(before, after) || jsonb_build_object('rolled_back_to', jsonb_build_object('old', null, 'new', edit_id)), after);
end;
$$;

create function public.admin_set_review_hidden(review_id uuid, hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update reviews set hidden = admin_set_review_hidden.hidden where id = review_id;
end;
$$;

create function public.admin_resolve_report(report_id uuid, status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_admin();
begin
  if status not in ('open', 'resolved', 'dismissed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update reports set
    status = admin_resolve_report.status,
    resolved_by = case when admin_resolve_report.status = 'open' then null else uid end,
    resolved_at = case when admin_resolve_report.status = 'open' then null else now() end
  where id = report_id;
end;
$$;

-- Suspend (until a time) or unsuspend (null) a user. Admins cannot suspend themselves.
create function public.admin_set_suspension(user_id uuid, until timestamptz, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_admin();
begin
  if user_id = uid then
    raise exception 'You cannot suspend yourself' using errcode = '22023';
  end if;
  update profiles set suspended_until = until, suspension_reason = case when until is null then null else reason end
  where id = user_id;
end;
$$;

create function public.admin_list_reports(status_filter text default 'open')
returns table (
  id uuid,
  location_id uuid,
  location_name text,
  location_deleted boolean,
  reason text,
  comment text,
  duplicate_of uuid,
  duplicate_of_name text,
  status text,
  reporter_id uuid,
  reporter_display_name text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select r.id, r.location_id, l.name, l.deleted_at is not null, r.reason, r.comment,
         r.duplicate_of, d.name, r.status, r.reporter_id, p.display_name, r.created_at, r.resolved_at
  from reports r
  join locations l on l.id = r.location_id
  left join locations d on d.id = r.duplicate_of
  left join profiles p on p.id = r.reporter_id
  where status_filter is null or r.status = status_filter
  order by r.created_at desc
  limit 500;
end;
$$;

create function public.admin_list_users(search text default null)
returns table (
  id uuid,
  display_name text,
  email text,
  role text,
  suspended_until timestamptz,
  suspension_reason text,
  created_at timestamptz,
  review_count bigint,
  edit_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select p.id, p.display_name, u.email::text, p.role, p.suspended_until, p.suspension_reason, p.created_at,
         (select count(*) from reviews v where v.author_id = p.id),
         (select count(*) from location_edits e where e.editor_id = p.id)
  from profiles p
  join auth.users u on u.id = p.id
  where search is null or p.display_name ilike '%' || search || '%' or u.email ilike '%' || search || '%'
  order by p.created_at desc
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.rooms enable row level security;
alter table public.location_edits enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.favorites enable row level security;

-- Supabase grants table privileges to anon/authenticated by default; start from nothing
-- and grant only what clients use directly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Profiles: users read and rename themselves. Roles and suspensions change only via admin RPCs.
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Listings: readable by everyone; written only via save_location() and admin RPCs.
create policy "read active locations" on public.locations for select to anon, authenticated using (deleted_at is null or is_admin());
create policy "read rooms" on public.rooms for select to anon, authenticated using (true);
grant select on public.locations, public.rooms to anon, authenticated;

-- Reviews: written directly (one per user per listing); read via get_location_reviews().
create policy "read own reviews" on public.reviews for select to authenticated using (author_id = auth.uid() or is_admin());
create policy "write own review" on public.reviews for insert to authenticated with check (author_id = auth.uid() and is_active_user() and not hidden);
create policy "update own review" on public.reviews for update to authenticated using (author_id = auth.uid() and is_active_user()) with check (author_id = auth.uid() and not hidden);
create policy "delete own review" on public.reviews for delete to authenticated using (author_id = auth.uid());
grant select, delete on public.reviews to authenticated;
grant insert (location_id, overall, cleanliness, comment, anonymous) on public.reviews to authenticated;
grant update (overall, cleanliness, comment, anonymous, updated_at) on public.reviews to authenticated;

-- Reports: anyone signed in files them; only admins (and the reporter) can read them.
create policy "file report" on public.reports for insert to authenticated with check (reporter_id = auth.uid() and is_active_user());
create policy "read own reports" on public.reports for select to authenticated using (reporter_id = auth.uid() or is_admin());
grant select on public.reports to authenticated;
grant insert (location_id, reason, comment, duplicate_of) on public.reports to authenticated;

-- Favorites: private to each user.
create policy "own favorites" on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.favorites to authenticated;

-- Edit history: read via get_location_history().

-- Functions callable by clients.
grant execute on function
  public.search_restrooms(double precision, double precision, double precision, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, double precision, int),
  public.get_location(uuid),
  public.get_favorites(),
  public.get_my_contributions(),
  public.get_location_reviews(uuid),
  public.get_location_history(uuid),
  public.find_possible_duplicates(double precision, double precision, text, double precision, uuid),
  public.is_open_at(jsonb, text, timestamptz),
  public.is_admin()
to anon, authenticated;

grant execute on function
  public.save_location(jsonb),
  public.confirm_location(uuid),
  public.save_my_review(uuid, int, int, text, boolean),
  public.delete_my_review(uuid),
  public.delete_my_account(),
  public.admin_set_location_deleted(uuid, boolean),
  public.admin_merge_locations(uuid, uuid),
  public.admin_rollback_location(bigint),
  public.admin_set_review_hidden(uuid, boolean),
  public.admin_resolve_report(uuid, text),
  public.admin_set_suspension(uuid, timestamptz, text),
  public.admin_list_reports(text),
  public.admin_list_users(text)
to authenticated;

-- RLS policies call these helpers as the requesting role.
grant execute on function public.is_active_user() to anon, authenticated;

-- Realtime: lets clients see new listings and edits within seconds (Supabase only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.locations;
  end if;
end;
$$;
