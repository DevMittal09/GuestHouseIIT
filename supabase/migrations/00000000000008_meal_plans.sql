-- Migration 8: meals chosen per day, and which guest houses serve them.
--
-- Two requests from the guest house office (15 Sep 2026):
--
-- 1. Meals are chosen per day of the stay, not once for the whole stay. A
--    requester booked for two nights who wanted breakfast on one morning only
--    had no way to say so. `bookings.meals` changes shape from
--      {"breakfast": bool, "lunch": bool, "dinner": bool}
--    to an array with one entry per institute calendar day that has a meal:
--      [{"date": "2026-09-15", "breakfast": false, "lunch": true, "dinner": true}]
--
-- 2. Meals are served only at Hamsanandi. That is a property of the guest
--    house, so it is a column the developer console can change — not a name
--    check in code (guest house names are free-form).
--
-- Existing answers are converted, not dropped. The old object meant "these
-- meals for the whole stay", so it is expanded over the days of the stay,
-- keeping each meal only on days its serving window falls inside the stay (a
-- noon arrival is not given that morning's breakfast). That is the rule in
-- `stayMealDays` / `normalizeMeals` (lib/meals.ts), and the windows below must
-- match MEAL_SERVING_WINDOWS there.
--
-- Apply after migration 7. Until this runs, a booking with meals cannot be
-- created against Supabase: migration 6's check constraint refuses the array.

-- ---------------------------------------------------------------- guest houses

alter table public.guest_houses
  add column if not exists serves_meals boolean not null default false;

-- The spec default, for an existing database. A fresh one is seeded after the
-- migrations run, so supabase/seed.sql sets the flag itself.
update public.guest_houses set serves_meals = true where name = 'Hamsanandi';

comment on column public.guest_houses.serves_meals is
  'Whether requesters booking this guest house may choose meals. Editable in the developer console (Guest Houses & Rooms).';

-- ---------------------------------------------------------------- bookings.meals

alter table public.bookings drop constraint if exists bookings_meals_shape;

update public.bookings b
set meals = coalesce(
  (
    select jsonb_agg(stay_day.meals order by stay_day.day)
    from (
      select
        d::date as day,
        jsonb_build_object(
          'date', to_char(d, 'YYYY-MM-DD'),
          'breakfast',
            coalesce((b.meals ->> 'breakfast')::boolean, false)
            and b.check_in < ((d::date + time '09:30') at time zone 'Asia/Kolkata')
            and b.check_out > ((d::date + time '07:30') at time zone 'Asia/Kolkata'),
          'lunch',
            coalesce((b.meals ->> 'lunch')::boolean, false)
            and b.check_in < ((d::date + time '14:00') at time zone 'Asia/Kolkata')
            and b.check_out > ((d::date + time '12:30') at time zone 'Asia/Kolkata'),
          'dinner',
            coalesce((b.meals ->> 'dinner')::boolean, false)
            and b.check_in < ((d::date + time '21:00') at time zone 'Asia/Kolkata')
            and b.check_out > ((d::date + time '19:30') at time zone 'Asia/Kolkata')
        ) as meals
      -- Institute dates from check-in to the day of the stay's last instant,
      -- so a check-out at midnight adds no day.
      from generate_series(
        (b.check_in at time zone 'Asia/Kolkata')::date::timestamp,
        ((b.check_out - interval '1 millisecond') at time zone 'Asia/Kolkata')::date::timestamp,
        interval '1 day'
      ) as d
    ) as stay_day
    where (stay_day.meals ->> 'breakfast')::boolean
       or (stay_day.meals ->> 'lunch')::boolean
       or (stay_day.meals ->> 'dinner')::boolean
  ),
  '[]'::jsonb
)
where jsonb_typeof(b.meals) = 'object';

alter table public.bookings alter column meals set default '[]'::jsonb;

-- An array of day objects, each with a yyyy-mm-dd date and all three meal
-- keys as booleans, so a half-written entry cannot come back out of the
-- database. (The app still normalises on read; this protects Postgres.)
alter table public.bookings
  add constraint bookings_meals_shape check (
    jsonb_typeof(meals) = 'array'
    and not jsonb_path_exists(
      meals,
      '$[*] ? (@.type() != "object"
               || !exists(@.date) || !exists(@.breakfast) || !exists(@.lunch) || !exists(@.dinner)
               || @.date.type() != "string"
               || !(@.date like_regex "^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
               || @.breakfast.type() != "boolean"
               || @.lunch.type() != "boolean"
               || @.dinner.type() != "boolean")'
    )
  );

comment on column public.bookings.meals is
  'Meals per day of the stay: [{"date":"YYYY-MM-DD","breakfast":bool,"lunch":bool,"dinner":bool}], only days with at least one meal, in date order. See lib/meals.ts.';
