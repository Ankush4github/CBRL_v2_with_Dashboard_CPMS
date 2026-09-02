-- Storage buckets and their policies.
--
-- RECONSTRUCTED — see the header of 20260830120000_core_identity.sql.
--
-- Two buckets, with deliberately opposite exposure. The contrast is documented
-- in next.config.js: the image optimizer's remotePatterns are pinned to
-- /storage/v1/object/public/site-media/** specifically so the optimizer "will
-- not fetch from any other bucket on the project — `prescriptions` in
-- particular. That bucket is private and would 401 anyway; pinning means it is
-- never even requested."

-- ─── site-media: the website's uploads, public ──────────────────────────────
-- Public because it holds photographs that render on a public website, and
-- next/image fetches them without credentials.
--
-- The MIME allow-list is one entry. src/app/api/admin/upload/route.ts re-encodes
-- every upload through sharp and hard-codes contentType: 'image/webp', and
-- next.config.js relies on that: it sets dangerouslyAllowSVG: true and notes
-- this is safe only because "the bucket accepts image/webp only, and the upload
-- route re-encodes through sharp, so no SVG can reach it". Widening this list
-- re-opens that hole.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 12582912, array['image/webp'])
on conflict (id) do nothing;

-- ─── prescriptions: clinical scans and documents, private ───────────────────
-- Never public. CPMS reads these through supabase.storage.download() and renders
-- them as blob: object URLs — cpms-next/next.config.mjs calls blob: in its CSP
-- "load-bearing" for exactly this reason — so no public URL is ever needed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('prescriptions', 'prescriptions', false, 26214400)
on conflict (id) do nothing;

-- ─── policies ───────────────────────────────────────────────────────────────
-- ALL POLICIES INFERRED, though the site-media pair is pinned by config.ts:
-- "Writes are authorised by the editor's own JWT, checked against
-- is_site_editor() by the policies on site_content and storage.objects."

-- Anyone may read site-media; that is what `public` already means, and stating
-- it keeps the intent visible next to the write policy.
create policy "site-media: world readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');

create policy "site-media: editors upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and public.is_site_editor((select auth.uid()))
  );

-- Update rather than insert is what makes the route's `upsert: true` work.
create policy "site-media: editors replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.is_site_editor((select auth.uid())))
  with check (bucket_id = 'site-media' and public.is_site_editor((select auth.uid())));

create policy "site-media: editors delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.is_site_editor((select auth.uid())));

-- prescriptions: enabled CPMS accounts only. No `anon` policy of any kind, so
-- an anonymous caller holding the publishable key reaches nothing here.
create policy "prescriptions: enabled accounts read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.user_is_enabled((select auth.uid()))
  );

create policy "prescriptions: scanners upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prescriptions'
    and public.user_can_scan((select auth.uid()))
  );

create policy "prescriptions: uploader replaces own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.user_can_scan((select auth.uid()))
    and owner_id = (select auth.uid())::text
  )
  with check (bucket_id = 'prescriptions');

-- Only admins delete clinical documents. Note this is also the gap behind a
-- known bug: PatientDetail.tsx's "Delete Record" removes the database row and
-- leaves the objects here orphaned. Fixing that belongs in the app, not here.
create policy "prescriptions: admins delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.is_admin_or_higher((select auth.uid()))
  );
