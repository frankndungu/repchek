// The signed in user's data: profile and saved sessions. No UI here.
// Every call runs as the user, so the database rules decide what is seen.

import { getClient, getSession } from "./auth";
import type { SessionRecord } from "./engine/session";
import { fromRecord } from "./analytics";
import type { AnalyticsSession } from "./analytics";
import type { HistoryItem } from "./history";
import type { SessionSummary } from "./progress";
import type { SessionStats } from "./ui/summary";

export type Plan = "free" | "premium";

export interface Profile {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  avatarUrl: string | null;
  // Set when the plan comes from a paid Polar subscription. Empty for a plan
  // that was given by hand.
  hasSubscription: boolean;
  premiumUntil: string | null;
  cancelAtPeriodEnd: boolean;
  // Two letters for the avatar, from the full name.
  initials: string;
  // Days a week to train to keep the streak. 3 until set.
  weeklyGoal: number;
}

const PENDING_KEY = "repchek.pendingSessions";
// Postgres code for "row already exists".
const DUPLICATE = "23505";
const MAX_ROWS = 5000;

interface SessionRow {
  client_id: string;
  exercise_id: string;
  exercise_name: string;
  started_at: string;
  ended_at: string;
  total_reps: number;
  clean_reps: number;
  record: SessionRecord;
}

function toRow(record: SessionRecord, stats: SessionStats): SessionRow {
  return {
    client_id: record.id,
    exercise_id: record.exerciseId,
    exercise_name: record.exerciseName,
    started_at: record.startedAt,
    ended_at: record.endedAt,
    total_reps: stats.totalReps,
    clean_reps: stats.cleanReps,
    record,
  };
}

function readPending(): SessionRow[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as SessionRow[]) : [];
  } catch {
    return [];
  }
}

function writePending(rows: SessionRow[]): void {
  try {
    if (rows.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // Storage full or blocked: nothing more to do.
  }
}

async function insertRow(row: SessionRow): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { error } = await client.from("sessions").insert(row);
    return !error || error.code === DUPLICATE;
  } catch {
    return false;
  }
}

// Saves a finished session. If it cannot reach the server, it is kept on
// the device and sent next time. Returns true when it is saved now.
export async function saveSession(
  record: SessionRecord,
  stats: SessionStats,
): Promise<boolean> {
  if (stats.totalReps === 0) return true;
  const row = toRow(record, stats);
  if (await insertRow(row)) {
    // It may have been waiting on the device from an earlier try.
    writePending(readPending().filter((p) => p.client_id !== row.client_id));
    return true;
  }
  const pending = readPending();
  if (!pending.some((p) => p.client_id === row.client_id)) {
    writePending([...pending, row]);
  }
  return false;
}

// Sends anything that was kept on the device.
export async function flushPending(): Promise<void> {
  const pending = readPending();
  if (pending.length === 0) return;
  const left: SessionRow[] = [];
  for (const row of pending) {
    if (!(await insertRow(row))) left.push(row);
  }
  writePending(left);
}

export function clearPending(): void {
  writePending([]);
}

// "Frank Ndung'u" -> "FN", "frank@email.com" -> "FR".
export function initialsOf(text: string): string {
  const words = text
    .split(/[\s@._-]+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length >= 2 && !text.includes("@")) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? "R").slice(0, 2).toUpperCase();
}

export async function loadProfile(): Promise<Profile | null> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return null;
  const user = session.user;
  let name = "";
  let plan: Plan = "free";
  let hasSubscription = false;
  let premiumUntil: string | null = null;
  let cancelAtPeriodEnd = false;
  let weeklyGoal = 3;
  try {
    const { data } = await client
      .from("profiles")
      .select(
        "display_name, plan, premium_until, cancel_at_period_end, polar_subscription_id, weekly_goal",
      )
      .eq("id", user.id)
      .maybeSingle();
    name = data?.display_name ?? "";
    plan = data?.plan === "premium" ? "premium" : "free";
    hasSubscription = Boolean(data?.polar_subscription_id);
    premiumUntil = (data?.premium_until as string | null) ?? null;
    cancelAtPeriodEnd = data?.cancel_at_period_end === true;
    weeklyGoal = Number(data?.weekly_goal) || 3;
  } catch {
    // Offline: fall through with the defaults.
  }
  const meta = user.user_metadata as Record<string, unknown>;
  const email = user.email ?? "";
  return {
    id: user.id,
    email,
    name: name || email.split("@")[0] || "You",
    plan,
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    hasSubscription,
    premiumUntil,
    cancelAtPeriodEnd,
    weeklyGoal,
    initials: initialsOf(
      (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        name ||
        email,
    ),
  };
}

export async function updateWeeklyGoal(
  id: string,
  goal: number,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { error } = await client
      .from("profiles")
      .update({ weekly_goal: goal })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function updateName(id: string, name: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { error } = await client
      .from("profiles")
      .update({ display_name: name })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// Every saved session, newest first, with only what the maths needs.
export async function loadSessionSummaries(): Promise<SessionSummary[] | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("sessions")
      .select("exercise_id, exercise_name, started_at, total_reps, clean_reps")
      .order("started_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error || !data) return null;
    return data.map((r) => ({
      exerciseId: r.exercise_id as string,
      exerciseName: r.exercise_name as string,
      startedAt: r.started_at as string,
      totalReps: r.total_reps as number,
      cleanReps: r.clean_reps as number,
    }));
  } catch {
    return null;
  }
}

// Every saved session for the History tab, newest first. The planned sets and
// reps and the weight are read out of the saved record for the Train screen.
// If that part of the query is ever refused, the plain list still loads, so
// History never depends on it.
const HISTORY_COLUMNS =
  "client_id, exercise_id, exercise_name, started_at, total_reps, clean_reps";

export async function loadHistory(): Promise<HistoryItem[] | null> {
  const client = getClient();
  if (!client) return null;
  const ask = (columns: string) =>
    client
      .from("sessions")
      .select(columns)
      .order("started_at", { ascending: false })
      .limit(MAX_ROWS);
  try {
    let { data, error } = await ask(
      `${HISTORY_COLUMNS}, target:record->target, weight:record->weightKg`,
    );
    if (error || !data) {
      ({ data, error } = await ask(HISTORY_COLUMNS));
    }
    if (error || !data) return null;
    return (data as unknown as Record<string, unknown>[]).map((r) => {
      const target = r.target as { sets?: number; reps?: number } | null;
      return {
        id: r.client_id as string,
        exerciseId: r.exercise_id as string,
        exerciseName: r.exercise_name as string,
        startedAt: r.started_at as string,
        totalReps: r.total_reps as number,
        cleanReps: r.clean_reps as number,
        targetSets: target?.sets,
        targetReps: target?.reps,
        weightKg: (r.weight as number | null | undefined) ?? null,
      };
    });
  } catch {
    return null;
  }
}

// The newest saved sessions with everything the analytics need. Heavier than
// the history list, so it is only used for Premium.
const ANALYTICS_ROWS = 500;

export async function loadAnalyticsSessions(): Promise<AnalyticsSession[] | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("sessions")
      .select("record")
      .order("started_at", { ascending: false })
      .limit(ANALYTICS_ROWS);
    if (error || !data) return null;
    return data.map((r) => fromRecord(r.record as SessionRecord));
  } catch {
    return null;
  }
}

// The full record of one saved session, to reopen its report.
export async function loadSessionRecord(
  clientId: string,
): Promise<SessionRecord | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("sessions")
      .select("record")
      .eq("client_id", clientId)
      .maybeSingle();
    if (error || !data) return null;
    return data.record as SessionRecord;
  } catch {
    return null;
  }
}

// Deletes the account and everything on it. The database function checks
// who is asking, so it can only ever delete the caller.
export async function deleteAccount(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { error } = await client.rpc("delete_my_account");
    return !error;
  } catch {
    return false;
  }
}
