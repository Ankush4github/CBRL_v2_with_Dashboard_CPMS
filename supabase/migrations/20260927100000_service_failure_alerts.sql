-- Email masters when AI extraction or the nightly upload sweep is failing.
--
-- The 2026-09-26 outage ("Service configuration error": the Gemini key was
-- missing, then the model was retired) was found by staff at the scan screen.
-- Nothing told anyone. extract-prescription and sweep-orphan-uploads now note
-- each failure here (best-effort, from their service role), the sweep records
-- each successful run, and ops-alerts reads both every 30 minutes and emails
-- the masters -- at most once per problem every 6 hours.
--
-- The functions write with the service role, so none of these tables has a
-- policy: nothing reaches them through the API.

create table if not exists public.service_failures (
  id         bigint generated always as identity primary key,
  service    text        not null,
  -- extract-prescription: config | model | rejected | busy | parse | error
  -- sweep-orphan-uploads: list | remove
  kind       text        not null,
  -- A status code and the provider's own message, truncated. Never patient data.
  detail     text,
  created_at timestamptz not null default now()
);

create index if not exists service_failures_service_time
  on public.service_failures (service, created_at);

alter table public.service_failures enable row level security;

create table if not exists public.service_heartbeats (
  service    text primary key,
  last_ok_at timestamptz not null default now()
);

alter table public.service_heartbeats enable row level security;

-- One row per alert email sent, per problem: the 6-hour throttle reads it.
create table if not exists public.ops_alert_log (
  id      bigint generated always as identity primary key,
  kind    text        not null,
  sent_at timestamptz not null default now()
);

create index if not exists ops_alert_log_kind_time on public.ops_alert_log (kind, sent_at);

alter table public.ops_alert_log enable row level security;

-- Same shape as private.invoke_orphan_sweep(): the shared cron secret is read
-- from Vault at call time and never appears in the job definition.
create or replace function private.invoke_ops_alerts()
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
    raise warning '[ops-alerts] vault secret "attendance_cron_secret" is not set; check not dispatched';
    return;
  end if;

  perform net.http_post(
    url := 'https://rcqluqbrqiyyfrpfryvl.supabase.co/functions/v1/ops-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_ops_alerts() from public, anon, authenticated;

select cron.schedule(
  'ops-alerts',
  '*/30 * * * *',
  $job$select private.invoke_ops_alerts()$job$
);
