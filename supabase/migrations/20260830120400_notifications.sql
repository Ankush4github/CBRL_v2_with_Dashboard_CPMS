-- Shift notifications and their Web Push delivery.
--
-- RECONSTRUCTED — see the header of 20260830120000_core_identity.sql.
-- Also absent from the surviving CPMS project.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  message text not null,
  notification_type public.notification_type not null,
  -- The shift day this notification is about, which is not the same as the
  -- moment it was created — the reminders are generated per work day.
  event_date date not null,
  read_status boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The three halves of a Web Push subscription: where to send, and the two
  -- keys the payload is encrypted to.
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- INFERRED. A browser re-registering must replace its row rather than add a
  -- second one, or every notification is delivered twice.
  unique (endpoint)
);

-- ─── row-level security ─────────────────────────────────────────────────────
-- ALL POLICIES INFERRED.

alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- Marking one read is the only change a recipient makes.
create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No insert policy for `authenticated` on purpose: notifications are generated
-- server-side by a scheduled job holding the service-role key, which bypasses
-- RLS. A client that could insert its own could forge a shift reminder.

create policy "push_subscriptions: manage own"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id) where read_status = false;
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
