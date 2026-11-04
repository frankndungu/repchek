-- Challenges and the Hall of Gains. Nothing is read or written on these tables
-- directly: everything goes through the functions below, which check who is
-- asking. So nobody can list every challenge or read another person's sessions.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text check (description is null or char_length(description) <= 280),
  -- Profile ids that count. Empty means any exercise.
  exercise_ids text[] not null default '{}',
  goal_clean_reps int check (goal_clean_reps is null or goal_clean_reps between 1 and 100000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '92 days')
);

create index challenges_creator_idx on public.challenges (creator_id, created_at desc);

create table public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index challenge_members_user_idx on public.challenge_members (user_id);

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
revoke all on public.challenges, public.challenge_members from anon, authenticated;

-- Create a challenge and join it. Limits: 5 new challenges a day and 10
-- running at once per person, so one account cannot flood the app.
create function public.create_challenge(
  p_title text,
  p_description text,
  p_exercise_ids text[],
  p_goal int,
  p_starts timestamptz,
  p_ends timestamptz
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
  new_code text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if (select count(*) from public.challenges c
        where c.creator_id = uid and c.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'too_many_today';
  end if;
  if (select count(*) from public.challenges c
        where c.creator_id = uid and c.ends_at > now()) >= 10 then
    raise exception 'too_many_running';
  end if;
  if not (coalesce(p_exercise_ids, '{}') <@ array[
        'push-up', 'push-up-front', 'mountain-climbers', 'mountain-climbers-front',
        'deadlift', 'barbell-row', 'biceps-curl']) then
    raise exception 'bad_exercise';
  end if;
  if p_starts < now() - interval '1 day' or p_starts > now() + interval '60 days' then
    raise exception 'bad_dates';
  end if;

  for i in 1..5 loop
    new_code := substr(md5(gen_random_uuid()::text), 1, 8);
    begin
      insert into public.challenges
        (code, creator_id, title, description, exercise_ids, goal_clean_reps, starts_at, ends_at)
      values
        (new_code, uid, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
         coalesce(p_exercise_ids, '{}'), p_goal, p_starts, p_ends)
      returning challenges.id into new_id;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  insert into public.challenge_members (challenge_id, user_id) values (new_id, uid);
  return query select new_id, new_code;
end;
$$;

-- What someone sees when they open a challenge link.
create function public.get_challenge(p_code text)
returns table (
  id uuid, code text, title text, description text, exercise_ids text[],
  goal_clean_reps int, starts_at timestamptz, ends_at timestamptz,
  creator_name text, members bigint, joined boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in'; end if;
  return query
    select c.id, c.code, c.title, c.description, c.exercise_ids, c.goal_clean_reps,
           c.starts_at, c.ends_at,
           coalesce(nullif(p.display_name, ''), 'Someone'),
           (select count(*) from public.challenge_members m where m.challenge_id = c.id),
           exists (select 1 from public.challenge_members m
                    where m.challenge_id = c.id and m.user_id = (select auth.uid()))
      from public.challenges c
      left join public.profiles p on p.id = c.creator_id
     where c.code = lower(btrim(p_code));
end;
$$;

create function public.join_challenge(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  c public.challenges;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into c from public.challenges where code = lower(btrim(p_code));
  if not found then raise exception 'not_found'; end if;
  if c.ends_at < now() then raise exception 'ended'; end if;
  insert into public.challenge_members (challenge_id, user_id)
  values (c.id, uid)
  on conflict do nothing;
  return c.id;
end;
$$;

create function public.leave_challenge(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.challenge_members
   where challenge_id = p_id and user_id = (select auth.uid());
$$;

-- The Hall of Gains: everyone in the challenge, with workouts and clean reps
-- inside its dates. Sorted by workouts by default, or by clean reps. Only
-- members can look, and only first names are shown.
create function public.challenge_leaderboard(p_id uuid, p_sort text default 'workouts')
returns table (
  rank bigint, user_id uuid, name text,
  workouts bigint, clean_reps bigint, total_reps bigint, is_me boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.challenge_members m
                  where m.challenge_id = p_id and m.user_id = me) then
    raise exception 'not_a_member';
  end if;
  return query
    with totals as (
      select m.user_id as member_id, m.joined_at,
             coalesce(nullif(p.display_name, ''), 'Athlete') as member_name,
             count(s.id) as n_workouts,
             coalesce(sum(s.clean_reps), 0)::bigint as n_clean,
             coalesce(sum(s.total_reps), 0)::bigint as n_total
        from public.challenge_members m
        join public.challenges c on c.id = m.challenge_id
        left join public.profiles p on p.id = m.user_id
        left join public.sessions s
               on s.user_id = m.user_id
              and s.total_reps > 0
              and s.started_at >= c.starts_at
              and s.started_at < c.ends_at
              and (cardinality(c.exercise_ids) = 0 or s.exercise_id = any (c.exercise_ids))
       where m.challenge_id = p_id
       group by m.user_id, m.joined_at, p.display_name
    )
    select row_number() over (
             order by
               case when p_sort = 'clean' then t.n_clean else t.n_workouts end desc,
               case when p_sort = 'clean' then t.n_workouts else t.n_clean end desc,
               t.joined_at, t.member_id)::bigint,
           t.member_id, t.member_name, t.n_workouts, t.n_clean, t.n_total, t.member_id = me
      from totals t
     order by 1
     limit 200;
end;
$$;

-- The challenges a person is in, with their own numbers.
create function public.my_challenges()
returns table (
  id uuid, code text, title text, exercise_ids text[], goal_clean_reps int,
  starts_at timestamptz, ends_at timestamptz,
  members bigint, my_workouts bigint, my_clean_reps bigint, is_creator boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  return query
    select c.id, c.code, c.title, c.exercise_ids, c.goal_clean_reps, c.starts_at, c.ends_at,
           (select count(*) from public.challenge_members x where x.challenge_id = c.id),
           (select count(s.id) from public.sessions s
             where s.user_id = uid and s.total_reps > 0
               and s.started_at >= c.starts_at and s.started_at < c.ends_at
               and (cardinality(c.exercise_ids) = 0 or s.exercise_id = any (c.exercise_ids))),
           (select coalesce(sum(s.clean_reps), 0)::bigint from public.sessions s
             where s.user_id = uid and s.total_reps > 0
               and s.started_at >= c.starts_at and s.started_at < c.ends_at
               and (cardinality(c.exercise_ids) = 0 or s.exercise_id = any (c.exercise_ids))),
           c.creator_id = uid
      from public.challenges c
      join public.challenge_members m on m.challenge_id = c.id and m.user_id = uid
     order by c.ends_at desc
     limit 50;
end;
$$;

revoke execute on function
  public.create_challenge(text, text, text[], int, timestamptz, timestamptz),
  public.get_challenge(text),
  public.join_challenge(text),
  public.leave_challenge(uuid),
  public.challenge_leaderboard(uuid, text),
  public.my_challenges()
from public, anon;

grant execute on function
  public.create_challenge(text, text, text[], int, timestamptz, timestamptz),
  public.get_challenge(text),
  public.join_challenge(text),
  public.leave_challenge(uuid),
  public.challenge_leaderboard(uuid, text),
  public.my_challenges()
to authenticated;
