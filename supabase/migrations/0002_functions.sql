-- WSA Reservations: RPCs. Every booking rule lives here, so the static front-end can't bypass it.
-- Errors are raised with a stable message code the front-end translates (see src/i18n/ui.ts).

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

-- Book equipment. Rules (all from public.settings):
--   * caller is an approved member
--   * duration is a multiple of step_minutes, between step_minutes and max_minutes
--   * start is on a step boundary, not before the current step, on today .. today + booking_days - 1
--     (local calendar days), and the whole booking fits between open_time and close_time
--   * the caller has no other reservation that is upcoming or still running
--   * at no moment of the requested window are all units of that equipment already booked
create or replace function public.create_reservation(p_equipment text, p_start timestamptz, p_minutes integer)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  s           public.settings;
  v_end       timestamptz;
  v_now_local timestamp;
  v_floor     timestamp;
  v_start_l   timestamp;
  v_end_l     timestamp;
  v_today     date;
  v_capacity  integer;
  v_peak      integer;
  v_row       public.reservations;
begin
  if v_uid is null or not public.is_approved() then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;

  select * into s from public.settings where id;

  if p_minutes is null or p_minutes < s.step_minutes or p_minutes > s.max_minutes or p_minutes % s.step_minutes <> 0 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if p_start is null then
    raise exception 'invalid_start' using errcode = 'P0001';
  end if;

  v_end       := p_start + make_interval(mins => p_minutes);
  v_now_local := now() at time zone s.time_zone;
  v_start_l   := p_start at time zone s.time_zone;
  v_end_l     := v_end at time zone s.time_zone;
  v_today     := v_now_local::date;
  v_floor     := date_trunc('hour', v_now_local)
                 + make_interval(mins => (extract(minute from v_now_local)::integer / s.step_minutes) * s.step_minutes);

  if extract(second from v_start_l) <> 0 or extract(minute from v_start_l)::integer % s.step_minutes <> 0 then
    raise exception 'invalid_start' using errcode = 'P0001';
  end if;
  if v_start_l < v_floor then
    raise exception 'start_in_past' using errcode = 'P0001';
  end if;
  if v_start_l::date > v_today + (s.booking_days - 1) then
    raise exception 'outside_booking_window' using errcode = 'P0001';
  end if;
  if v_start_l::time < s.open_time or v_end_l::date <> v_start_l::date or v_end_l::time > s.close_time then
    raise exception 'outside_opening_hours' using errcode = 'P0001';
  end if;

  -- Serialise bookings per member (one-at-a-time rule) and per equipment type (capacity).
  perform pg_advisory_xact_lock(hashtextextended('wsa-member:' || v_uid::text, 0));

  if exists (select 1 from public.reservations
              where user_id = v_uid and cancelled_at is null and end_at > now()) then
    raise exception 'already_has_reservation' using errcode = 'P0001';
  end if;

  select quantity into v_capacity from public.equipment_types
   where slug = p_equipment and active
   for update;
  if not found then
    raise exception 'unknown_equipment' using errcode = 'P0001';
  end if;

  -- Peak concurrent use inside [p_start, v_end): usage only rises at a start time, so checking the
  -- window start plus every booking start inside the window is enough.
  select coalesce(max(c), 0) into v_peak from (
    select (select count(*) from public.reservations r
             where r.equipment = p_equipment and r.cancelled_at is null
               and r.start_at <= t.pt and r.end_at > t.pt) as c
      from (select p_start as pt
            union
            select r.start_at from public.reservations r
             where r.equipment = p_equipment and r.cancelled_at is null
               and r.start_at > p_start and r.start_at < v_end) t
  ) x;

  if v_peak >= v_capacity then
    raise exception 'fully_booked' using errcode = 'P0001';
  end if;

  insert into public.reservations (user_id, equipment, start_at, end_at)
  values (v_uid, p_equipment, p_start, v_end)
  returning * into v_row;
  return v_row;
end;
$$;

-- Cancel an upcoming reservation, or end a running one now ("back on shore").
-- Members can do this for their own reservations, admins for anyone's.
create or replace function public.cancel_reservation(p_id bigint)
returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.reservations;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;

  select * into v_row from public.reservations where id = p_id for update;
  if not found or (v_row.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_row.cancelled_at is not null or v_row.end_at <= now() then
    raise exception 'already_finished' using errcode = 'P0001';
  end if;

  if v_row.start_at > now() then
    update public.reservations set cancelled_at = now() where id = p_id returning * into v_row;
  else
    update public.reservations set end_at = now() where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- Who is on the water now and who is coming, with names, for approved members.
create or replace function public.live_board()
returns table (
  id bigint, equipment text, start_at timestamptz, end_at timestamptz,
  user_id uuid, full_name text, avatar_url text, is_mine boolean
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.equipment, r.start_at, r.end_at, r.user_id, p.full_name, p.avatar_url, r.user_id = auth.uid()
    from public.reservations r
    join public.profiles p on p.id = r.user_id
   where public.is_approved()
     and r.cancelled_at is null
     and r.end_at > now()
   order by r.start_at, r.id;
$$;

-- ---------------------------------------------------------------------------
-- Public, anonymous aggregates (no names) for the home page
-- ---------------------------------------------------------------------------
create or replace function public.public_availability()
returns table (slug text, quantity integer, in_use integer)
language sql stable security definer set search_path = '' as $$
  select e.slug, e.quantity,
         (select count(*)::integer from public.reservations r
           where r.equipment = e.slug and r.cancelled_at is null
             and r.start_at <= now() and r.end_at > now())
    from public.equipment_types e
   where e.active
   order by e.sort_order, e.slug;
$$;

-- Reservations and hours on the water per local day, for the activity heatmap.
create or replace function public.club_activity(p_days integer default 365)
returns table (day date, reservations integer, hours numeric)
language sql stable security definer set search_path = '' as $$
  with s as (select time_zone from public.settings where id)
  select (r.start_at at time zone s.time_zone)::date as day,
         count(*)::integer,
         round(sum(extract(epoch from (least(r.end_at, now()) - r.start_at)) / 3600)::numeric, 1)
    from public.reservations r, s
   where r.cancelled_at is null
     and r.start_at <= now()
     and r.start_at >= now() - make_interval(days => least(greatest(p_days, 1), 800))
   group by 1
   order by 1;
$$;

create or replace function public.club_summary()
returns table (reservations integer, hours numeric, members integer, on_water integer, favourite text)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::integer from public.reservations where cancelled_at is null and start_at <= now()),
    (select coalesce(round(sum(extract(epoch from (least(end_at, now()) - start_at)) / 3600)::numeric, 0), 0)
       from public.reservations where cancelled_at is null and start_at <= now()),
    (select count(*)::integer from public.profiles where status = 'approved'),
    (select count(*)::integer from public.reservations
      where cancelled_at is null and start_at <= now() and end_at > now()),
    (select equipment from public.reservations where cancelled_at is null
      group by equipment order by count(*) desc, equipment limit 1);
$$;

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_update_member(p_user uuid, p_role public.user_role, p_status public.member_status)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.profiles;
begin
  perform public.assert_admin();
  if p_user = auth.uid() then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;

  update public.profiles
     set role = p_role,
         status = p_status,
         approved_at = case when p_status = 'approved' and status <> 'approved' then now() else approved_at end,
         approved_by = case when p_status = 'approved' and status <> 'approved' then auth.uid() else approved_by end
   where id = p_user
   returning * into v_row;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_status = 'blocked' then
    delete from public.allowed_emails where email = lower(v_row.email);
    update public.reservations set cancelled_at = now()
     where user_id = p_user and cancelled_at is null and start_at > now();
  end if;
  return v_row;
end;
$$;

-- Removes the member's login, profile and reservation history.
create or replace function public.admin_delete_member(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  perform public.assert_admin();
  if p_user = auth.uid() then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from public.profiles where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  delete from public.allowed_emails where email = v_email;
  delete from auth.users where id = p_user;
end;
$$;

-- Pre-approve an email. Existing pending accounts with that email are approved immediately.
create or replace function public.admin_add_email(p_email text, p_role public.user_role default 'member', p_full_name text default null)
returns public.allowed_emails
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_row   public.allowed_emails;
begin
  perform public.assert_admin();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  insert into public.allowed_emails (email, role, full_name, added_by)
  values (v_email, coalesce(p_role, 'member'), nullif(btrim(p_full_name), ''), auth.uid())
  on conflict (email) do update set role = excluded.role, full_name = coalesce(excluded.full_name, public.allowed_emails.full_name)
  returning * into v_row;

  update public.profiles
     set status = 'approved', role = v_row.role, approved_at = now(), approved_by = auth.uid()
   where lower(email) = v_email and status = 'pending';
  return v_row;
end;
$$;

create or replace function public.admin_remove_email(p_email text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  delete from public.allowed_emails where email = lower(btrim(p_email));
end;
$$;

-- Per-member usage between two moments (cancelled reservations counted separately).
create or replace function public.admin_member_stats(p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid, full_name text, email text, avatar_url text, role public.user_role, status public.member_status,
  reservations integer, cancelled integer, hours numeric, by_equipment jsonb, last_start timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select p.id, p.full_name, p.email, p.avatar_url, p.role, p.status,
         count(r.id) filter (where r.cancelled_at is null)::integer,
         count(r.id) filter (where r.cancelled_at is not null)::integer,
         coalesce(round(sum(extract(epoch from (least(r.end_at, now()) - r.start_at)) / 3600)
                    filter (where r.cancelled_at is null and r.start_at <= now())::numeric, 1), 0),
         coalesce((select jsonb_object_agg(x.equipment, x.n) from (
                     select r2.equipment, count(*) as n from public.reservations r2
                      where r2.user_id = p.id and r2.cancelled_at is null
                        and r2.start_at >= p_from and r2.start_at < p_to
                      group by r2.equipment) x), '{}'::jsonb),
         max(r.start_at) filter (where r.cancelled_at is null)
    from public.profiles p
    left join public.reservations r on r.user_id = p.id and r.start_at >= p_from and r.start_at < p_to
   group by p.id
   order by 7 desc, p.full_name;
end;
$$;

create or replace function public.admin_equipment_stats(p_from timestamptz, p_to timestamptz)
returns table (slug text, reservations integer, cancelled integer, hours numeric, members integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select e.slug,
         count(r.id) filter (where r.cancelled_at is null)::integer,
         count(r.id) filter (where r.cancelled_at is not null)::integer,
         coalesce(round(sum(extract(epoch from (least(r.end_at, now()) - r.start_at)) / 3600)
                    filter (where r.cancelled_at is null and r.start_at <= now())::numeric, 1), 0),
         count(distinct r.user_id) filter (where r.cancelled_at is null)::integer
    from public.equipment_types e
    left join public.reservations r on r.equipment = e.slug and r.start_at >= p_from and r.start_at < p_to
   group by e.slug, e.sort_order
   order by e.sort_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function public.public_availability() to anon, authenticated;
grant execute on function public.club_activity(integer) to anon, authenticated;
grant execute on function public.club_summary() to anon, authenticated;

grant execute on function
  public.is_approved(), public.is_admin(), public.assert_admin(),
  public.create_reservation(text, timestamptz, integer), public.cancel_reservation(bigint), public.live_board(),
  public.admin_update_member(uuid, public.user_role, public.member_status), public.admin_delete_member(uuid),
  public.admin_add_email(text, public.user_role, text), public.admin_remove_email(text),
  public.admin_member_stats(timestamptz, timestamptz), public.admin_equipment_stats(timestamptz, timestamptz)
to authenticated;

revoke execute on function public.handle_new_user() from authenticated;
