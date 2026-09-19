-- A role may only be granted to someone below your own rank.
--
-- 20260908074018_peer_role_management.sql stopped an account from *managing* a
-- peer. This stops it *creating* one: the role being written must rank strictly
-- below the writer's own role, so a master can grant 'admin' or 'staff' but
-- never 'master'.
--
-- The two clauses do different jobs, which is why only one of them changes:
--
--   USING      — which existing rows may be touched. That is about the target
--                account, and can_manage_user() already covers it.
--   WITH CHECK — the row being written. That is about the role being handed
--                over, and is what this migration adds.
--
-- ## The consequence, stated plainly
--
-- No master can be created through the application any more. A master cannot
-- grant 'master' (equal rank), and nothing outranks a master, so there is no
-- actor left who could. Appointing one is now a deliberate act outside the app,
-- in the SQL editor:
--
--   insert into public.user_roles (user_id, role)
--   values ('<uuid>', 'master')
--   on conflict (user_id, role) do nothing;
--
-- That is not a workaround for the policy — it is the policy. Promotion to the
-- top of the hierarchy leaves the application's own audit surface and becomes
-- something a project owner does knowingly.
--
-- Existing masters are unaffected: this constrains writes, and their rows are
-- already in place.

drop policy if exists "user_roles: masters manage lower ranks" on public.user_roles;

create policy "user_roles: masters manage lower ranks"
  on public.user_roles for all to authenticated
  using (
    public.is_master((select auth.uid()))
    and public.can_manage_user((select auth.uid()), user_id)
  )
  with check (
    public.is_master((select auth.uid()))
    and public.can_manage_user((select auth.uid()), user_id)
    -- `role` is app_role; role_rank() takes the text get_user_role() returns.
    and public.role_rank(role::text)
      < public.role_rank(public.get_user_role((select auth.uid())))
  );
