-- Applied to the repchek Supabase project on 3 November 2026.
-- Setting a user to premium is done by hand, never by the app:
--   update public.profiles set plan = 'premium' where id = '<user id>';

-- Profiles: one row per user. The plan is set by repchek, never by the user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Users may read their row and change only their name. No insert (a trigger
-- makes the row) and no delete (deleting the account does that).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(split_part(coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ), ' ', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rows for the accounts that already existed.
insert into public.profiles (id, display_name)
select
  u.id,
  nullif(split_part(coalesce(
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'full_name',
    split_part(u.email, '@', 1)
  ), ' ', 1), '')
from auth.users u
on conflict (id) do nothing;

-- Sessions: one row per finished workout. XP is clean reps, so it is not
-- stored: it cannot be set to anything else.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id text not null,
  exercise_id text not null,
  exercise_name text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  total_reps int not null check (total_reps >= 0),
  clean_reps int not null check (clean_reps >= 0 and clean_reps <= total_reps),
  record jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index sessions_user_started_idx on public.sessions (user_id, started_at desc);

alter table public.sessions enable row level security;

create policy "sessions: read own" on public.sessions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "sessions: insert own" on public.sessions
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "sessions: delete own" on public.sessions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.sessions from anon, authenticated;
grant select, insert, delete on public.sessions to authenticated;

-- Lets a signed in user delete their own account and everything on it.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
