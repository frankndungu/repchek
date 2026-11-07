-- Dumbbell rows can be counted in a challenge.

create or replace function public.create_challenge(
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
        'deadlift', 'barbell-row', 'biceps-curl', 'crunch', 'plank', 'pull-up', 'dumbbell-row']) then
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

revoke execute on function
  public.create_challenge(text, text, text[], int, timestamptz, timestamptz)
from public, anon;

grant execute on function
  public.create_challenge(text, text, text[], int, timestamptz, timestamptz)
to authenticated;
