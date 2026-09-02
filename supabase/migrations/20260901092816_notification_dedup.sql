-- One notification per user, per shift moment, per day.
--
-- attendance-notifications is invoked by pg_cron and has to be safe to re-run:
-- a retry after a partial failure, or two schedules that overlap, must not mail
-- and push the same reminder twice. The worker distinguishes a duplicate from a
-- real insert failure by the 23505 this index raises, so without it the dedup
-- branch is unreachable and every re-run re-delivers.
--
-- notification_type and event_date already carry the right meaning for this:
-- event_date is the shift day the reminder is about, not the moment it was
-- created, so a job that runs late still collides with its earlier attempt.

create unique index if not exists notifications_user_type_date_key
  on public.notifications (user_id, notification_type, event_date);
