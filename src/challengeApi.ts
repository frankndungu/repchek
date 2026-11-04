// Challenge calls to Supabase. Every one goes through a database function that
// checks who is asking, so the app never reads the tables directly.

import { getClient } from "./auth";
import { failureFrom, toChallenge, toMyChallenge, toStanding } from "./challenges";
import type {
  Challenge,
  ChallengeFailure,
  MyChallenge,
  SortBy,
  Standing,
} from "./challenges";

export type Result<T> = { ok: true; value: T } | { ok: false; failure: ChallengeFailure };

async function call<T>(
  name: string,
  args: Record<string, unknown>,
  map: (data: unknown) => T,
): Promise<Result<T>> {
  const client = getClient();
  if (!client) return { ok: false, failure: "unknown" };
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) return { ok: false, failure: failureFrom(error) };
    return { ok: true, value: map(data) };
  } catch (error) {
    return { ok: false, failure: failureFrom(error) };
  }
}

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export function listMine(): Promise<Result<MyChallenge[]>> {
  return call("my_challenges", {}, (d) => rows(d).map(toMyChallenge));
}

export function getChallenge(code: string): Promise<Result<Challenge | null>> {
  return call("get_challenge", { p_code: code }, (d) => {
    const first = rows(d)[0];
    return first ? toChallenge(first) : null;
  });
}

export function joinChallenge(code: string): Promise<Result<string>> {
  return call("join_challenge", { p_code: code }, (d) => String(d));
}

export async function leaveChallenge(id: string): Promise<Result<true>> {
  return call("leave_challenge", { p_id: id }, () => true as const);
}

export function leaderboard(id: string, sort: SortBy): Promise<Result<Standing[]>> {
  return call("challenge_leaderboard", { p_id: id, p_sort: sort }, (d) =>
    rows(d).map(toStanding),
  );
}

export interface NewChallenge {
  title: string;
  description: string;
  exerciseIds: string[];
  goal: number | null;
  startsAt: string;
  endsAt: string;
}

export function createChallenge(
  input: NewChallenge,
): Promise<Result<{ id: string; code: string }>> {
  return call(
    "create_challenge",
    {
      p_title: input.title,
      p_description: input.description,
      p_exercise_ids: input.exerciseIds,
      p_goal: input.goal,
      p_starts: input.startsAt,
      p_ends: input.endsAt,
    },
    (d) => {
      const first = rows(d)[0];
      return { id: String(first?.id ?? ""), code: String(first?.code ?? "") };
    },
  );
}
