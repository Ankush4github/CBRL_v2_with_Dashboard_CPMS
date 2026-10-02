-- Attendance rules enforced by the database, not just the Attendance screen.
--
-- The July migrations (20260719081613 and its neighbours) put a geofence and a
-- working-hours check in triggers on attendance_records. Neither the functions
-- nor the triggers exist on the live project any more — lost when the
-- migrations were rebuilt — so every rule was left to the browser. Anyone with
-- an account could call the REST API directly and:
--
--   - set check_in_at / check_out_at to any time (backdate a shift);
--   - send any coordinates and a check_in_distance_meters of 0;
--   - rewrite a past record of their own, or re-open a checked-out one;
--   - move a record to a hospital they are not assigned to (the UPDATE
--     policy's WITH CHECK only tests user_id).
--
-- This restores the rules in one trigger, written against today's columns:
--
--   check-in   time is now(); allowed on a working day between work_start_time
--              and checkin_deadline (or work_end_time when no deadline is
--              set); distance is computed here and must be within
--              radius_meters.
--   check-out  time is now(); allowed once, on a working day between
--              work_start_time and checkout_deadline (or work_end_time); the
--              distance is computed here when the hospital has coordinates.
--              Nothing about the check-in can change afterwards.
--
-- The windows are the ones the Attendance screen already applies, in IST and
-- to the minute, so a check-in the screen allows is never refused here.
--
-- Only requests made with a user's JWT are checked. Without one — service
-- role, cron, the SQL editor — auth.uid() is null and the row passes
-- untouched, so a master can still correct a record by hand.
--
-- Column grants are narrowed to match: a client may supply the check-in
-- position, notes and the check-out position, and nothing else. Safe to run
-- twice.

create or replace function public.attendance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  local_now timestamp := (now() at time zone 'Asia/Kolkata');
  now_minute time := date_trunc('minute', local_now)::time;
  today_dow int := extract(isodow from local_now)::int;
  window_end time;
  distance numeric;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.check_out_at is not null then
      raise exception 'This attendance record is already checked out.'
        using errcode = 'check_violation';
    end if;

    -- The check-in half of the row is fixed once written.
    new.user_id := old.user_id;
    new.hospital := old.hospital;
    new.check_in_at := old.check_in_at;
    new.check_in_latitude := old.check_in_latitude;
    new.check_in_longitude := old.check_in_longitude;
    new.check_in_distance_meters := old.check_in_distance_meters;
    new.created_at := old.created_at;
    new.notes := old.notes;
    new.updated_at := now();

    if new.check_out_latitude is null or new.check_out_longitude is null then
      raise exception 'A check-out needs a location.'
        using errcode = 'check_violation';
    end if;
  else
    new.check_in_at := now();
    new.created_at := now();
    new.updated_at := now();
    new.check_out_at := null;
    new.check_out_latitude := null;
    new.check_out_longitude := null;
    new.check_out_distance_meters := null;
  end if;

  select latitude, longitude, radius_meters, work_days,
         work_start_time, work_end_time, checkin_deadline, checkout_deadline
    into h
  from public.hospitals
  where name = new.hospital;

  if not found then
    raise exception 'Hospital % does not exist.', new.hospital
      using errcode = 'check_violation';
  end if;

  if not (today_dow = any (coalesce(nullif(h.work_days, '{}'), array[1, 2, 3, 4, 5]))) then
    raise exception 'Attendance is closed today at %.', new.hospital
      using errcode = 'check_violation';
  end if;

  window_end := case when tg_op = 'INSERT'
                     then coalesce(h.checkin_deadline, h.work_end_time)
                     else coalesce(h.checkout_deadline, h.work_end_time) end;

  if now_minute < h.work_start_time or now_minute > window_end then
    raise exception 'Attendance at % is open % to % IST.',
      new.hospital, left(h.work_start_time::text, 5), left(window_end::text, 5)
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if h.latitude is null or h.longitude is null then
      raise exception 'Hospital location is not configured for %.', new.hospital
        using errcode = 'check_violation';
    end if;

    distance := 2 * 6371000 * asin(sqrt(
      power(sin(radians((new.check_in_latitude - h.latitude) / 2)), 2) +
      cos(radians(h.latitude)) * cos(radians(new.check_in_latitude)) *
      power(sin(radians((new.check_in_longitude - h.longitude) / 2)), 2)
    ));

    if distance > h.radius_meters then
      raise exception 'Check-in location is outside the allowed radius for %.', new.hospital
        using errcode = 'check_violation';
    end if;

    new.check_in_distance_meters := distance;
  else
    new.check_out_at := now();

    if h.latitude is not null and h.longitude is not null then
      distance := 2 * 6371000 * asin(sqrt(
        power(sin(radians((new.check_out_latitude - h.latitude) / 2)), 2) +
        cos(radians(h.latitude)) * cos(radians(new.check_out_latitude)) *
        power(sin(radians((new.check_out_longitude - h.longitude) / 2)), 2)
      ));

      if distance > h.radius_meters then
        raise exception 'Check-out location is outside the allowed radius for %.', new.hospital
          using errcode = 'check_violation';
      end if;

      new.check_out_distance_meters := distance;
    else
      new.check_out_distance_meters := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.attendance_guard() from public, anon, authenticated;

drop trigger if exists attendance_guard on public.attendance_records;
create trigger attendance_guard
  before insert or update on public.attendance_records
  for each row execute function public.attendance_guard();

-- Grants. The trigger overrides anything it does not accept, so these are the
-- second line, not the first — but they keep the API surface to what the
-- Attendance screen actually sends.
revoke insert, update, delete, truncate, references, trigger
  on public.attendance_records from anon, authenticated;

grant insert (user_id, hospital, check_in_latitude, check_in_longitude,
              check_in_distance_meters, notes)
  on public.attendance_records to authenticated;

grant update (check_out_at, check_out_latitude, check_out_longitude,
              check_out_distance_meters)
  on public.attendance_records to authenticated;
