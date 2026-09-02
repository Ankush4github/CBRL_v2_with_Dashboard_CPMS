-- pg_cron drives the attendance reminders; pg_net is how a cron job reaches an
-- Edge Function, which lives outside the database.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
