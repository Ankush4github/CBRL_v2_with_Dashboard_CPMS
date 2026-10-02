-- Refuse script-capable URLs anywhere in website content.
--
-- The dashboard's save route validates every link (src/lib/content-schema.ts:
-- http(s), mailto: or a site path), but RLS on site_content only asks whether
-- the writer is a site editor. An editor's session — or a stolen one — can
-- write straight to PostgREST with the publishable key and skip the route,
-- storing `javascript:` in any href the public pages render.
--
-- React 19 already refuses to render a javascript: href, so this is the
-- second wall, not the only one. It is deliberately narrow: the full schema
-- stays in TypeScript, and this rejects only the schemes that can run script.
-- No string in the content on 2026-10-02 matches.
--
-- Safe to run twice.

create or replace function public.site_content_reject_script_urls()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data is not null and jsonb_path_exists(
    new.data,
    '$.** ? (@.type() == "string" && @ like_regex "^\\s*(javascript|vbscript|data)\\s*:" flag "i")'
  ) then
    raise exception 'Website content may not contain javascript:, vbscript: or data: URLs.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.site_content_reject_script_urls() from public, anon, authenticated;

drop trigger if exists site_content_reject_script_urls on public.site_content;
create trigger site_content_reject_script_urls
  before insert or update on public.site_content
  for each row execute function public.site_content_reject_script_urls();
