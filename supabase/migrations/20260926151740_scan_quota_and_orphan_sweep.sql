-- Two guards around prescription scanning.
--
-- 1. A per-user hourly cap on AI extractions. extract-prescription checks
--    can_scan but nothing bounded how often: every call is a paid Gemini
--    request, so a stuck retry loop or a misused account had no ceiling.
--
-- 2. The sweeper the scan page's discardUploads() comment asks for. A failed
--    save removes its own uploads, but a closed tab or a lost connection
--    mid-save leaves files no record points at, and the uploader-delete policy
--    only helps while that same browser is still there to call it.

-- ─── 1. extraction quota ────────────────────────────────────────────────────
create table if not exists public.scan_extraction_events (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null,
  created_at timestamptz not null default now()
);

create index if not exists scan_extraction_events_user_time
  on public.scan_extraction_events (user_id, created_at);

-- No policies: only consume_scan_extraction() below touches the table.
alter table public.scan_extraction_events enable row level security;

-- Records one extraction for the caller and says whether it is allowed.
-- The Edge Function passes the limit; a caller invoking this directly with a
-- bigger one only changes the answer to their own question -- the function's
-- own call still applies its limit.
create or replace function public.consume_scan_extraction(_hourly_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid  uuid := auth.uid();
  _used integer;
begin
  if _uid is null then
    return false;
  end if;

  -- Two tabs extracting at once must not both squeeze past the last slot.
  perform pg_advisory_xact_lock(hashtext('scan_extraction:' || _uid::text));

  -- Nothing reads past the last hour, so older rows are only clutter.
  delete from public.scan_extraction_events
  where user_id = _uid and created_at < now() - interval '1 day';

  select count(*) into _used
  from public.scan_extraction_events
  where user_id = _uid and created_at > now() - interval '1 hour';

  if _used >= greatest(_hourly_limit, 1) then
    return false;
  end if;

  insert into public.scan_extraction_events (user_id) values (_uid);
  return true;
end;
$$;

revoke execute on function public.consume_scan_extraction(integer) from public, anon;
grant  execute on function public.consume_scan_extraction(integer) to authenticated;

-- ─── 2. orphaned uploads ────────────────────────────────────────────────────
-- Objects in the prescriptions bucket that no record references, oldest first.
-- The age floor is what keeps a save in flight safe: its files exist for a few
-- seconds before create_patient_record() commits the row pointing at them.
--
-- A record deleted from the app leaves its files behind too (the delete only
-- removes the row), so those also appear here once they pass the age floor.
create or replace function public.list_orphan_prescription_objects(
  _min_age interval,
  _limit integer
)
returns table (name text, size_bytes bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, (o.metadata->>'size')::bigint, o.created_at
  from storage.objects o
  where o.bucket_id = 'prescriptions'
    and o.created_at < now() - greatest(_min_age, interval '1 day')
    and not public.prescription_object_is_referenced(o.name)
  order by o.created_at
  limit least(greatest(_limit, 1), 1000);
$$;

revoke execute on function public.list_orphan_prescription_objects(interval, integer)
  from public, anon, authenticated;
grant execute on function public.list_orphan_prescription_objects(interval, integer)
  to service_role;

-- Same shape as private.invoke_attendance_event(): the shared cron secret is
-- read from Vault at call time and never appears in the job definition.
create or replace function private.invoke_orphan_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _secret text;
begin
  select decrypted_secret into _secret
  from vault.decrypted_secrets
  where name = 'attendance_cron_secret';

  if _secret is null or _secret = '' then
    raise warning '[orphan-sweep] vault secret "attendance_cron_secret" is not set; sweep not dispatched';
    return;
  end if;

  perform net.http_post(
    url := 'https://rcqluqbrqiyyfrpfryvl.supabase.co/functions/v1/sweep-orphan-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.invoke_orphan_sweep() from public, anon, authenticated;

-- Daily at 21:30 UTC (03:00 IST), outside working hours. The function only
-- reports until its SWEEP_APPLY secret is set to "true".
select cron.schedule(
  'sweep-orphan-uploads',
  '30 21 * * *',
  $job$select private.invoke_orphan_sweep()$job$
);
