-- Scheduling for the attendance reminders.
--
-- The shared secret lives in Vault, not in the job command: cron.job.command is
-- plain text, and a secret pasted there is readable by anything that can read
-- the table. The helper looks it up at call time, so the value is written once
-- and never appears in a migration or a job definition.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.invoke_attendance_event(_event text)
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

  -- A missing secret must not silently look like a quiet day. The Edge
  -- Function would refuse the call anyway; this stops the pointless request
  -- and leaves a reason in the Postgres log.
  if _secret is null or _secret = '' then
    raise warning '[attendance-cron] vault secret "attendance_cron_secret" is not set; % not dispatched', _event;
    return;
  end if;

  perform net.http_post(
    url := 'https://rcqluqbrqiyyfrpfryvl.supabase.co/functions/v1/attendance-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := jsonb_build_object('event', _event),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_attendance_event(text) from public, anon, authenticated;

-- cron.timezone is GMT on this project, so the schedules below are UTC and the
-- trailing comment gives the IST time they correspond to. Derived from the
-- working day the hospitals table currently holds, 09:00-17:00 IST.
--
-- Every job runs daily rather than Mon-Fri: which days count is
-- hospitals.work_days, and the worker already filters on it. Encoding the week
-- here too would be a second place to change, and the two would drift. On a
-- non-working day the worker returns "nobody scheduled" and sends nothing.
select cron.schedule('attendance-shift-start',            '30 3 * * *',  $job$select private.invoke_attendance_event('shift_start')$job$);            -- 09:00 IST
select cron.schedule('attendance-checkin-reminder',       '30 4 * * *',  $job$select private.invoke_attendance_event('checkin_reminder')$job$);       -- 10:00 IST
select cron.schedule('attendance-checkin-final-reminder', '30 5 * * *',  $job$select private.invoke_attendance_event('checkin_final_reminder')$job$); -- 11:00 IST
select cron.schedule('attendance-shift-end',              '30 11 * * *', $job$select private.invoke_attendance_event('shift_end')$job$);              -- 17:00 IST
select cron.schedule('attendance-checkout-reminder',      '30 12 * * *', $job$select private.invoke_attendance_event('checkout_reminder')$job$);      -- 18:00 IST
select cron.schedule('attendance-checkout-final-reminder','30 13 * * *', $job$select private.invoke_attendance_event('checkout_final_reminder')$job$);-- 19:00 IST
