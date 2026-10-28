-- WSA Reservations: add 6 Optimists (children's dinghy) to the fleet.
-- Safe to run more than once.
insert into public.equipment_types (slug, name_nl, name_en, icon, quantity, sort_order)
values ('optimist', 'Optimist', 'Optimist', 'optimist', 6, 15)
on conflict (slug) do update
  set name_nl = excluded.name_nl, name_en = excluded.name_en, icon = excluded.icon,
      quantity = excluded.quantity, sort_order = excluded.sort_order, active = true;
