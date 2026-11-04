alter table public.profiles
  add column weekly_goal smallint not null default 3
  check (weekly_goal between 1 and 7);

-- A person may change their own goal, like their name. Nothing else.
grant update (weekly_goal) on public.profiles to authenticated;
