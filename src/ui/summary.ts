import type { SessionRecord } from "../engine/session";
import { PROFILES } from "../profiles";

export interface SetStats {
  set: number;
  reps: number;
  clean: number;
  avgMs: number;
  firstFaultIndex: number;
  faults: Map<string, number>;
}

export interface Note {
  text: string;
  tone: "bad" | "muted" | "good";
}

export interface SessionStats {
  totalReps: number;
  cleanReps: number;
  cleanPct: number;
  avgRepMs: number;
  partials: number;
  sets: SetStats[];
  notes: Note[];
}

export function shortName(exerciseName: string): string {
  return exerciseName.split(" (")[0];
}

function faultMessage(exerciseId: string, ruleId: string): string {
  const profile = PROFILES.find((p) => p.id === exerciseId);
  return profile?.rules.find((r) => r.id === ruleId)?.message ?? ruleId;
}

export function computeStats(record: SessionRecord): SessionStats {
  const sets: SetStats[] = record.sets.map((s) => {
    const faults = new Map<string, number>();
    let firstFaultIndex = -1;
    s.reps.forEach((rep, i) => {
      if (rep.faults.length > 0 && firstFaultIndex === -1) firstFaultIndex = i;
      for (const f of rep.faults) faults.set(f, (faults.get(f) ?? 0) + 1);
    });
    const total = s.reps.reduce((sum, r) => sum + r.durationMs, 0);
    return {
      set: s.set,
      reps: s.reps.length,
      clean: s.reps.filter((r) => r.faults.length === 0).length,
      avgMs: s.reps.length ? total / s.reps.length : 0,
      firstFaultIndex,
      faults,
    };
  });

  const totalReps = sets.reduce((sum, s) => sum + s.reps, 0);
  const cleanReps = sets.reduce((sum, s) => sum + s.clean, 0);
  const partials = record.sets.reduce((sum, s) => sum + s.partials, 0);
  const allDurations = record.sets.flatMap((s) =>
    s.reps.map((r) => r.durationMs),
  );
  const avgRepMs = allDurations.length
    ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
    : 0;
  const cleanPct = totalReps ? Math.round((cleanReps / totalReps) * 100) : 0;

  return {
    totalReps,
    cleanReps,
    cleanPct,
    avgRepMs,
    partials,
    sets,
    notes: buildNotes(record.exerciseId, sets, totalReps, cleanReps, partials),
  };
}

function buildNotes(
  exerciseId: string,
  sets: SetStats[],
  totalReps: number,
  cleanReps: number,
  partials: number,
): Note[] {
  const notes: Note[] = [];
  if (totalReps === 0) {
    return [
      {
        text: "No reps counted. Check the camera angle and try again.",
        tone: "muted",
      },
    ];
  }

  const combined = new Map<string, number>();
  for (const s of sets) {
    for (const [id, n] of s.faults)
      combined.set(id, (combined.get(id) ?? 0) + n);
  }
  const top = [...combined.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const [id, count] = top;
    const inSets = sets.filter((s) => s.faults.has(id)).map((s) => s.set);
    const where = inSets.length === 1 ? `, all in set ${inSets[0]}` : "";
    notes.push({
      text: `${faultMessage(exerciseId, id)}: ${count} rep${count === 1 ? "" : "s"}${where}`,
      tone: "bad",
    });
  }

  const first = sets[0]?.avgMs ?? 0;
  const last = sets[sets.length - 1]?.avgMs ?? 0;
  if (sets.length > 1 && first > 0 && last > first * 1.2) {
    notes.push({
      text: `Reps slowed from ${(first / 1000).toFixed(1)}s to ${(last / 1000).toFixed(1)}s by the last set`,
      tone: "muted",
    });
  }

  if (partials > 0) {
    notes.push({
      text: `${partials} partial rep${partials === 1 ? "" : "s"}, use the full range`,
      tone: "muted",
    });
  }

  const lastSet = sets[sets.length - 1];
  const cleanRatio = cleanReps / totalReps;
  if (cleanRatio === 1) {
    notes.push({
      text: "All clean. Add a little weight next session",
      tone: "good",
    });
  } else if (cleanRatio >= 0.8 && lastSet && lastSet.firstFaultIndex > 0) {
    notes.push({
      text: `Next time: stop set ${lastSet.set} at ${lastSet.firstFaultIndex}, or drop the weight`,
      tone: "good",
    });
  } else if (cleanRatio < 0.8) {
    notes.push({
      text: "Form broke on more than a fifth of reps. Lower the weight and rebuild",
      tone: "good",
    });
  }

  return notes;
}

const TONE_CLASS: Record<Note["tone"], string> = {
  bad: "bg-bad",
  muted: "bg-muted",
  good: "bg-lime",
};

export function renderSummary(
  record: SessionRecord,
  stats: SessionStats,
): void {
  const el = (id: string) => document.getElementById(id)!;
  const started = new Date(record.startedAt);

  el("summary-date").textContent = started.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  el("summary-exercise").textContent = shortName(
    record.exerciseName,
  ).toUpperCase();
  el("summary-meta").textContent =
    `${record.weightKg ? `${record.weightKg} kg, ` : ""}target ${record.target.sets} x ${record.target.reps}`;
  el("stat-reps").textContent = String(stats.totalReps);
  el("stat-clean").textContent = `${stats.cleanPct}%`;
  el("stat-time").textContent = stats.avgRepMs
    ? `${(stats.avgRepMs / 1000).toFixed(1)}s`
    : "0s";

  const setsEl = el("summary-sets");
  setsEl.replaceChildren();
  for (const s of stats.sets) {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3";
    const cleanPct = s.reps ? (s.clean / s.reps) * 100 : 0;
    const badPct = s.reps ? ((s.reps - s.clean) / s.reps) * 100 : 0;
    const countText =
      s.clean === s.reps ? `${s.reps} clean` : `${s.clean} of ${s.reps}`;
    row.innerHTML = `
      <span class="w-11 text-[13px] font-semibold text-muted">Set ${s.set}</span>
      <span class="flex h-3 flex-grow overflow-hidden rounded-md bg-[#1c1c1a]">
        <span class="h-full bg-lime" style="width:${cleanPct}%"></span>
        <span class="h-full bg-bad" style="width:${badPct}%"></span>
      </span>
      <span class="w-16 text-right text-[13px] font-semibold">${countText}</span>`;
    setsEl.append(row);
  }

  const notesEl = el("summary-notes");
  notesEl.replaceChildren();
  for (const note of stats.notes) {
    const row = document.createElement("div");
    row.className = "flex items-start gap-2.5";
    const dot = document.createElement("span");
    dot.className = `mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${TONE_CLASS[note.tone]}`;
    const text = document.createElement("span");
    text.className = "text-sm leading-snug";
    text.textContent = note.text;
    row.append(dot, text);
    notesEl.append(row);
  }
}
