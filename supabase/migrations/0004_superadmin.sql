-- WSA Reservations: super admins.
--   * Super admins have every admin right, and are the only ones who can grant the super admin role.
--   * Nobody can block, delete, demote or otherwise change a super admin through the app, and admins
--     can't touch a super admin's pre-approval or bookings.
--   * melihteke@gmail.com is the first super admin.
-- Requires 0003_superadmin_role.sql to have been run (and committed) first.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and status = 'approved' and role in ('admin', 'superadmin'));
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and status = 'approved' and role = 'superadmin');
$$;

-- ---------------------------------------------------------------------------
-- Pre-approvals are only written through the RPCs below, so the role rules can't be bypassed.
-- ---------------------------------------------------------------------------
drop policy if exists "allowed_emails: admins" on public.allowed_emails;
drop policy if exists "allowed_emails: admins read" on public.allowed_emails;
create policy "allowed_emails: admins read" on public.allowed_emails for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.allowed_emails from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs with super admin protection
-- ---------------------------------------------------------------------------
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
  if v_row.user_id <> auth.uid() and not public.is_superadmin()
     and exists (select 1 from public.profiles where id = v_row.user_id and role = 'superadmin') then
    raise exception 'protected_superadmin' using errcode = 'P0001';
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

create or replace function public.admin_update_member(p_user uuid, p_role public.user_role, p_status public.member_status)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_target public.profiles;
  v_row    public.profiles;
begin
  perform public.assert_admin();
  if p_user = auth.uid() then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles where id = p_user for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.role = 'superadmin' then
    raise exception 'protected_superadmin' using errcode = 'P0001';
  end if;
  if p_role = 'superadmin' and not public.is_superadmin() then
    raise exception 'superadmin_only' using errcode = 'P0001';
  end if;

  update public.profiles
     set role = p_role,
         status = p_status,
         approved_at = case when p_status = 'approved' and status <> 'approved' then now() else approved_at end,
         approved_by = case when p_status = 'approved' and status <> 'approved' then auth.uid() else approved_by end
   where id = p_user
   returning * into v_row;

  if p_status = 'blocked' then
    delete from public.allowed_emails where email = lower(v_row.email);
    update public.reservations set cancelled_at = now()
     where user_id = p_user and cancelled_at is null and start_at > now();
  end if;
  return v_row;
end;
$$;

create or replace function public.admin_delete_member(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target public.profiles;
begin
  perform public.assert_admin();
  if p_user = auth.uid() then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;
  select * into v_target from public.profiles where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.role = 'superadmin' then
    raise exception 'protected_superadmin' using errcode = 'P0001';
  end if;
  delete from public.allowed_emails where email = lower(v_target.email);
  delete from auth.users where id = p_user;
end;
$$;

create or replace function public.admin_add_email(p_email text, p_role public.user_role default 'member', p_full_name text default null)
returns public.allowed_emails
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_role  public.user_role := coalesce(p_role, 'member');
  v_row   public.allowed_emails;
begin
  perform public.assert_admin();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_role = 'superadmin' and not public.is_superadmin() then
    raise exception 'superadmin_only' using errcode = 'P0001';
  end if;
  if not public.is_superadmin() and (
       exists (select 1 from public.allowed_emails where email = v_email and role = 'superadmin')
       or exists (select 1 from public.profiles where lower(email) = v_email and role = 'superadmin')) then
    raise exception 'protected_superadmin' using errcode = 'P0001';
  end if;

  insert into public.allowed_emails (email, role, full_name, added_by)
  values (v_email, v_role, nullif(btrim(p_full_name), ''), auth.uid())
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
declare
  v_email text := lower(btrim(p_email));
begin
  perform public.assert_admin();
  if not public.is_superadmin() and exists (select 1 from public.allowed_emails where email = v_email and role = 'superadmin') then
    raise exception 'protected_superadmin' using errcode = 'P0001';
  end if;
  delete from public.allowed_emails where email = v_email;
end;
$$;

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

-- ---------------------------------------------------------------------------
-- First super admin
-- ---------------------------------------------------------------------------
insert into public.allowed_emails (email, role, full_name)
values ('melihteke@gmail.com', 'superadmin', 'Melih Teke')
on conflict (email) do update set role = 'superadmin';

update public.profiles
   set role = 'superadmin', status = 'approved', approved_at = coalesce(approved_at, now())
 where lower(email) = 'melihteke@gmail.com';
