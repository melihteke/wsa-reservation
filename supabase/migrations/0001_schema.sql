-- WSA Reservations: schema, row level security and seed data.
-- Run in the Supabase SQL editor (or `supabase db push`) before 0002_functions.sql.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('member', 'admin');
create type public.member_status as enum ('pending', 'approved', 'blocked');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  full_name   text,
  avatar_url  text,
  provider    text,
  role        public.user_role not null default 'member',
  status      public.member_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_status_idx on public.profiles (status);

-- Emails an admin approved up front: whoever signs in with this email (any provider) is approved.
create table public.allowed_emails (
  email      text primary key check (email = lower(btrim(email)) and email like '%@%'),
  role       public.user_role not null default 'member',
  full_name  text,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.equipment_types (
  slug       text primary key check (slug ~ '^[a-z0-9-]+$'),
  name_nl    text not null,
  name_en    text not null,
  icon       text not null,
  quantity   integer not null check (quantity >= 0),
  sort_order integer not null default 0,
  active     boolean not null default true
);

-- Single-row table with the booking rules admins can change.
create table public.settings (
  id           boolean primary key default true check (id),
  open_time    time not null default '09:00',
  close_time   time not null default '21:00',
  max_minutes  integer not null default 180 check (max_minutes between 30 and 720),
  step_minutes integer not null default 30 check (step_minutes in (15, 30, 60)),
  booking_days integer not null default 2 check (booking_days between 1 and 7),
  time_zone    text not null default 'Europe/Amsterdam',
  updated_at   timestamptz not null default now(),
  check (open_time < close_time),
  check (max_minutes % step_minutes = 0)
);

create table public.reservations (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  equipment    text not null references public.equipment_types (slug) on update cascade,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  check (end_at > start_at)
);
create index reservations_equipment_time_idx on public.reservations (equipment, start_at, end_at) where cancelled_at is null;
create index reservations_user_idx on public.reservations (user_id, end_at desc);
create index reservations_start_idx on public.reservations (start_at);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved' and role = 'admin');
$$;

-- Creates the profile for every new auth user. Approved straight away when the email was
-- pre-approved, or when an approved account with the same email already exists (same person
-- signing in with another provider that Supabase did not link).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email   text := lower(btrim(coalesce(new.email, new.raw_user_meta_data ->> 'email', '')));
  v_allowed public.allowed_emails;
  v_twin    public.profiles;
begin
  select * into v_allowed from public.allowed_emails where email = v_email and v_email <> '';
  if not found then
    select * into v_twin from public.profiles
     where lower(email) = v_email and v_email <> '' and status = 'approved'
     order by created_at limit 1;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, provider, role, status, approved_at)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', v_allowed.full_name,
             new.raw_user_meta_data ->> 'user_name', split_part(v_email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.raw_app_meta_data ->> 'provider',
    coalesce(v_allowed.role, v_twin.role, 'member'),
    case when v_allowed.email is not null or v_twin.id is not null then 'approved' else 'pending' end::public.member_status,
    case when v_allowed.email is not null or v_twin.id is not null then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security. Writes to profiles/reservations only happen through the RPCs in
-- 0002_functions.sql, which check every rule.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.equipment_types enable row level security;
alter table public.settings enable row level security;
alter table public.reservations enable row level security;

create policy "profiles: read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: admins read all" on public.profiles for select to authenticated using (public.is_admin());

create policy "allowed_emails: admins" on public.allowed_emails for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "equipment: everyone reads" on public.equipment_types for select to anon, authenticated using (true);
create policy "equipment: admins update" on public.equipment_types for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "settings: everyone reads" on public.settings for select to anon, authenticated using (true);
create policy "settings: admins update" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Approved members see all reservations (equipment and times; names come from live_board()),
-- which also lets Supabase Realtime push changes to them.
create policy "reservations: approved members read" on public.reservations for select to authenticated
  using (public.is_approved());

revoke insert, update, delete on public.profiles, public.reservations from anon, authenticated;
revoke all on public.allowed_emails from anon;
revoke insert, delete on public.equipment_types, public.settings from anon, authenticated;
revoke update on public.equipment_types, public.settings from anon;

-- ---------------------------------------------------------------------------
-- Realtime: push reservation changes to the live board.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reservations;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
insert into public.settings (id) values (true);

insert into public.equipment_types (slug, name_nl, name_en, icon, quantity, sort_order) values
  ('laser-pico', 'Laser Pico',   'Laser Pico',   'dinghy',     6, 10),
  ('kielboot',   'Kielboot',     'Keelboat',     'keelboat',   2, 20),
  ('waterfiets', 'Waterfiets',   'Pedal boat',   'pedalboat', 10, 30),
  ('sup',        'Supboard',     'SUP board',    'sup',       10, 40),
  ('windsurf',   'Windsurfplank', 'Windsurf board', 'windsurf', 10, 50);
