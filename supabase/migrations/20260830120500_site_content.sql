-- The website's editable content, its version history, and the editor grant.
--
-- RECONSTRUCTED — see the header of 20260830120000_core_identity.sql — but this
-- file is the best-evidenced of the set. The website code documents this half
-- of the schema in unusual detail, and the policies below are transcribed from
-- those comments rather than guessed:
--
--   src/lib/supabase/public.ts   "site_content has a `using (true)` SELECT
--                                 policy because the website it renders is
--                                 public"
--   src/lib/supabase/config.ts   "Writes are authorised by the editor's own
--                                 JWT, checked against is_site_editor() by the
--                                 policies on site_content and storage.objects"
--   src/lib/site-editor.ts       "the function's EXECUTE grant was narrowed to
--                                 `authenticated`"; "The table's own SELECT
--                                 policy already lets an account see its own row"
--   src/lib/content.ts           "The previous version of the row is snapshotted
--                                 into site_content_versions by a BEFORE UPDATE
--                                 trigger, which also stamps updated_at /
--                                 updated_by"

create table public.site_content (
  -- The primary key, and the conflict target of the upsert in content.ts:
  --   .upsert(row, { onConflict: 'collection' })
  collection text primary key,
  -- Exactly one of these is populated per row. Every collection except
  -- `publications` is JSON; `publications` is a raw .bib file, which is text
  -- and must survive byte-for-byte, so it is not forced through jsonb.
  data jsonb,
  raw text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  -- INFERRED, from readContent() reading `data` and readPublicationsFile()
  -- reading `raw`: a row with neither is a row that renders as nothing.
  constraint site_content_has_payload check (data is not null or raw is not null)
);

create table public.site_content_versions (
  -- `id?: never` in both Insert and Update means the column is always database-
  -- generated, i.e. an identity column.
  id bigint primary key generated always as identity,
  collection text not null,
  data jsonb,
  raw text,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users (id) on delete set null
);

create table public.site_editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Defaults true: the row's existence is the grant, and is_enabled is how a
  -- grant is suspended without losing the note explaining who it was for.
  is_enabled boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  note text
);

-- ─── the editor grant ───────────────────────────────────────────────────────
-- Signature exact. SECURITY DEFINER so that the policies on site_content can
-- consult site_editors without the caller needing to read that table directly.

create or replace function public.is_site_editor(_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.site_editors
    where user_id = _user_id and is_enabled
  );
$$;

-- Narrowed to `authenticated`, as site-editor.ts records. That comment also
-- explains why the application reads the table directly instead of calling
-- this: it did not want a future tightening of this grant to lock every editor
-- out of the dashboard.
revoke execute on function public.is_site_editor(uuid) from public, anon;
grant execute on function public.is_site_editor(uuid) to authenticated;

-- ─── version snapshots ──────────────────────────────────────────────────────
-- BEFORE UPDATE, per content.ts. It writes the row as it was *before* this
-- update, which is why it reads OLD, and it stamps the new row's updated_at /
-- updated_by so no caller has to remember to.

create or replace function public.snapshot_site_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.site_content_versions (collection, data, raw, saved_at, saved_by)
  values (old.collection, old.data, old.raw, old.updated_at, old.updated_by);

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger site_content_snapshot
  before update on public.site_content
  for each row execute function public.snapshot_site_content();

-- ─── row-level security ─────────────────────────────────────────────────────

alter table public.site_content          enable row level security;
alter table public.site_content_versions enable row level security;
alter table public.site_editors          enable row level security;

-- `using (true)`, including for `anon`. This is deliberate and load-bearing:
-- src/lib/supabase/public.ts reads this table with a session-less client so the
-- public pages stay statically generated, and the content it returns is the
-- public website. It is also the reason the publishable key is safe to ship —
-- an anonymous reader reaches exactly this and nothing else.
create policy "site_content: world readable"
  on public.site_content for select to anon, authenticated
  using (true);

-- Writes are the editor's own JWT against is_site_editor(). The proxy in
-- src/proxy.ts gates the dashboard, but config.ts is explicit that the proxy is
-- not what authorises the write — this is.
create policy "site_content: editors write"
  on public.site_content for insert to authenticated
  with check (public.is_site_editor((select auth.uid())));

create policy "site_content: editors update"
  on public.site_content for update to authenticated
  using (public.is_site_editor((select auth.uid())))
  with check (public.is_site_editor((select auth.uid())));

-- No delete policy: a collection is emptied by saving an empty document, never
-- by removing the row, and a missing row silently falls back to disk.

-- History is editors-only — it is the one place an unpublished draft of a
-- previous edit can be read back.
create policy "site_content_versions: editors read"
  on public.site_content_versions for select to authenticated
  using (public.is_site_editor((select auth.uid())));

-- Nothing may write here but the trigger, which is SECURITY DEFINER and so
-- bypasses these policies. No insert/update/delete policy is intentional.

-- An account may see its own grant. site-editor.ts depends on exactly this:
-- isSiteEditor() selects the caller's own row, and it must not be able to
-- enumerate anyone else's.
create policy "site_editors: read own"
  on public.site_editors for select to authenticated
  using (user_id = (select auth.uid()));

-- Granting and revoking editor access is a master-only operation, done from
-- the Supabase dashboard rather than from the website.
create policy "site_editors: masters manage"
  on public.site_editors for all to authenticated
  using (public.is_master((select auth.uid())))
  with check (public.is_master((select auth.uid())));

create index site_content_versions_collection_idx
  on public.site_content_versions (collection, saved_at desc);
