-- Per-hospital attendance deadlines, set from Hospital Management.
--
-- checkin_deadline  : the last time a check-in is accepted, and the time the
--                     check-in reminders ask staff to beat.
-- checkout_deadline : the last time a check-out is accepted, which may be
--                     after work_end_time; the check-out reminders quote it.
--
-- Both are nullable, and null keeps today's behaviour: the reminders quote
-- work_start_time / work_end_time, and check-in and check-out stay open for
-- the working hours. (An August migration once added NOT NULL versions of
-- these columns; they are not on the live project, so this adds them fresh.)
--
-- Safe to run twice.

alter table public.hospitals
  add column if not exists checkin_deadline  time,
  add column if not exists checkout_deadline time;

alter table public.hospitals
  drop constraint if exists hospitals_checkin_deadline_in_hours,
  drop constraint if exists hospitals_checkout_deadline_after_end;

-- A check-in deadline outside the working day could never be met.
alter table public.hospitals
  add constraint hospitals_checkin_deadline_in_hours
    check (checkin_deadline is null
           or checkin_deadline between work_start_time and work_end_time);

-- The check-out reminders go out once the shift has ended, so the deadline
-- they name cannot fall before it.
alter table public.hospitals
  add constraint hospitals_checkout_deadline_after_end
    check (checkout_deadline is null or checkout_deadline >= work_end_time);
