// Plain logic for challenges and the Hall of Gains: links, dates, progress and
// wording. No DOM and no network, so it is easy to test.

import { EXERCISES, exerciseIdForProfile } from "./profiles";

export interface Challenge {
  id: string;
  code: string;
  title: string;
  description: string | null;
  // Profile ids that count. Empty means any exercise.
  exerciseIds: string[];
  goalCleanReps: number | null;
  startsAt: string;
  endsAt: string;
  creatorName: string;
  members: number;
  joined: boolean;
}

export interface MyChallenge {
  id: string;
  code: string;
  title: string;
  exerciseIds: string[];
  goalCleanReps: number | null;
  startsAt: string;
  endsAt: string;
  members: number;
  myWorkouts: number;
  myCleanReps: number;
  isCreator: boolean;
}

export interface Standing {
  rank: number;
  userId: string;
  name: string;
  workouts: number;
  cleanReps: number;
  totalReps: number;
  isMe: boolean;
}

export type SortBy = "workouts" | "clean";

export type ChallengeFailure =
  | "not_found"
  | "ended"
  | "not_a_member"
  | "too_many_today"
  | "too_many_running"
  | "bad_input"
  | "network"
  | "unknown";

const DAY_MS = 86_400_000;

// --- Links ---------------------------------------------------------------

const CODE_PATH = /^\/c\/([a-z0-9]{4,16})\/?$/i;

// "/c/ab12cd34" -> "ab12cd34". Anything else -> null.
export function codeFromPath(pathname: string): string | null {
  const match = CODE_PATH.exec(pathname);
  return match ? match[1].toLowerCase() : null;
}

export function challengeUrl(origin: string, code: string): string {
  return `${origin}/c/${code}`;
}

export function shareText(title: string, url: string): string {
  return `Join my challenge on repchek: ${title}. ${url}`;
}

// --- What counts ---------------------------------------------------------

// The profile ids to store for the exercises someone picked. Push-up counts
// from the side and from the front.
export function profileIdsFor(exerciseIds: string[]): string[] {
  const ids = new Set<string>();
  for (const id of exerciseIds) {
    const found = EXERCISES.find((e) => e.id === id);
    if (!found) continue;
    if (found.positions.beside) ids.add(found.positions.beside);
    if (found.positions.front) ids.add(found.positions.front);
  }
  return [...ids];
}

// The exercises (not profiles) a challenge counts. All of them when it counts
// any exercise. Push-up from the side and the front is one exercise.
export function exercisesFor(profileIds: string[]): { id: string; name: string }[] {
  if (profileIds.length === 0) return EXERCISES.map((e) => ({ id: e.id, name: e.name }));
  const found: { id: string; name: string }[] = [];
  for (const profileId of profileIds) {
    const exercise = EXERCISES.find((e) => e.id === exerciseIdForProfile(profileId));
    if (exercise && !found.some((f) => f.id === exercise.id)) {
      found.push({ id: exercise.id, name: exercise.name });
    }
  }
  return found;
}

// "Push-up", "Push-up and Deadlift", "Any exercise".
export function exerciseLabel(profileIds: string[]): string {
  const names: string[] = [];
  for (const id of profileIds) {
    const exerciseId = exerciseIdForProfile(id);
    const name = EXERCISES.find((e) => e.id === exerciseId)?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return "Any exercise";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// --- Dates ---------------------------------------------------------------

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export type Length = "week" | "7" | "30";

// Every challenge starts at midnight today, so a workout done earlier today
// already counts. "week" runs to the end of Sunday.
export function rangeFor(
  length: Length,
  now: Date = new Date(),
): { startsAt: string; endsAt: string } {
  const start = startOfDay(now);
  let end: Date;
  if (length === "week") {
    const sinceMonday = (start.getDay() + 6) % 7;
    end = addDays(start, 7 - sinceMonday);
  } else {
    end = addDays(start, Number(length));
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// "YYYY-MM-DD", the way a date input writes it, in local time.
export function dayString(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

// The first and last day that can be picked as the last day: today, and 91
// days on (the database allows 92 days in all).
export function lastDayLimits(now: Date = new Date()): { min: string; max: string } {
  const today = startOfDay(now);
  return { min: dayString(today), max: dayString(addDays(today, 91)) };
}

// From midnight today to the end of a chosen last day. Null when the day is
// missing, not a real date, before today or too far away.
export function rangeUntil(
  lastDay: string,
  now: Date = new Date(),
): { startsAt: string; endsAt: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastDay);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const last = new Date(y, m, d);
  if (last.getFullYear() !== y || last.getMonth() !== m || last.getDate() !== d) return null;
  const { min, max } = lastDayLimits(now);
  const picked = dayString(last);
  if (picked < min || picked > max) return null;
  return {
    startsAt: startOfDay(now).toISOString(),
    endsAt: addDays(last, 1).toISOString(),
  };
}

export interface Status {
  state: "upcoming" | "running" | "ended";
  text: string;
}

function daysText(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function statusFor(
  startsAt: string,
  endsAt: string,
  now: Date = new Date(),
): Status {
  const t = now.getTime();
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (t < start) {
    return {
      state: "upcoming",
      text: `Starts in ${daysText(Math.ceil((start - t) / DAY_MS))}`,
    };
  }
  if (t >= end) {
    const ago = Math.floor((t - end) / DAY_MS);
    return {
      state: "ended",
      text: ago < 1 ? "Ended today" : `Ended ${daysText(ago)} ago`,
    };
  }
  const left = Math.ceil((end - t) / DAY_MS);
  return {
    state: "running",
    text: left <= 1 ? "Last day" : `${daysText(left)} left`,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "4 Nov to 10 Nov". The end date is the last day, not the midnight after.
export function datesText(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(Date.parse(endsAt) - 1000);
  return `${s.getDate()} ${MONTHS[s.getMonth()]} to ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}

// --- Progress ------------------------------------------------------------

export function progressFor(
  cleanReps: number,
  goal: number | null,
): { pct: number; text: string } | null {
  if (!goal) return null;
  const pct = Math.min(100, Math.round((cleanReps / goal) * 100));
  return {
    pct,
    text:
      cleanReps >= goal
        ? `Goal reached. ${cleanReps} of ${goal} clean reps.`
        : `${cleanReps} of ${goal} clean reps`,
  };
}

// The line under a name in the Hall of Gains.
export function standingLine(row: Standing): string {
  const workouts = `${row.workouts} workout${row.workouts === 1 ? "" : "s"}`;
  return `${workouts}, ${row.cleanReps} clean rep${row.cleanReps === 1 ? "" : "s"}`;
}

// --- Rows and errors -----------------------------------------------------

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown): number => Number(v ?? 0) || 0;
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function toChallenge(row: Row): Challenge {
  return {
    id: str(row.id),
    code: str(row.code),
    title: str(row.title),
    description: typeof row.description === "string" ? row.description : null,
    exerciseIds: ids(row.exercise_ids),
    goalCleanReps: row.goal_clean_reps == null ? null : num(row.goal_clean_reps),
    startsAt: str(row.starts_at),
    endsAt: str(row.ends_at),
    creatorName: str(row.creator_name, "Someone"),
    members: num(row.members),
    joined: row.joined === true,
  };
}

export function toMyChallenge(row: Row): MyChallenge {
  return {
    id: str(row.id),
    code: str(row.code),
    title: str(row.title),
    exerciseIds: ids(row.exercise_ids),
    goalCleanReps: row.goal_clean_reps == null ? null : num(row.goal_clean_reps),
    startsAt: str(row.starts_at),
    endsAt: str(row.ends_at),
    members: num(row.members),
    myWorkouts: num(row.my_workouts),
    myCleanReps: num(row.my_clean_reps),
    isCreator: row.is_creator === true,
  };
}

export function toStanding(row: Row): Standing {
  return {
    rank: num(row.rank),
    userId: str(row.user_id),
    name: str(row.name, "Athlete"),
    workouts: num(row.workouts),
    cleanReps: num(row.clean_reps),
    totalReps: num(row.total_reps),
    isMe: row.is_me === true,
  };
}

export function failureFrom(error: unknown): ChallengeFailure {
  const e = error as { message?: string; code?: string; name?: string } | null;
  const message = e?.message ?? "";
  for (const known of [
    "not_found",
    "ended",
    "not_a_member",
    "too_many_today",
    "too_many_running",
  ] as const) {
    if (message.includes(known)) return known;
  }
  if (
    message.includes("bad_exercise") ||
    message.includes("bad_dates") ||
    message.includes("violates check constraint")
  ) {
    return "bad_input";
  }
  if (
    e instanceof TypeError ||
    /fetch|network/i.test(message) ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return "network";
  }
  return "unknown";
}

export const FAILURE_COPY: Record<ChallengeFailure, string> = {
  not_found: "We could not find that challenge. Check the link.",
  ended: "That challenge has ended.",
  not_a_member: "Join this challenge to see the Hall of Gains.",
  too_many_today: "You made 5 challenges today. Try again tomorrow.",
  too_many_running: "You already have 10 running. Let one finish first.",
  bad_input: "Check the name and the goal, then try again.",
  network: "No connection. Check your network and try again.",
  unknown: "Something went wrong. Try again.",
};

// --- A link opened before signing in --------------------------------------

const PENDING_KEY = "repchek.pendingChallenge";

export function rememberCode(code: string): void {
  try {
    localStorage.setItem(PENDING_KEY, code);
  } catch {
    // Private mode: the link still works if they stay on this page.
  }
}

export function takeRememberedCode(): string | null {
  try {
    const code = localStorage.getItem(PENDING_KEY);
    if (code) localStorage.removeItem(PENDING_KEY);
    return code && CODE_PATH.test(`/c/${code}`) ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}
