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

// One rep that broke form, for the rep by rep list.
export interface FaultRep {
  set: number;
  // 1-based, as the lifter counts.
  rep: number;
  // From the start of the set, which is also the start of its clip.
  atMs: number;
  messages: string[];
}

export interface SessionStats {
  totalReps: number;
  cleanReps: number;
  cleanPct: number;
  avgRepMs: number;
  partials: number;
  sets: SetStats[];
  faultReps: FaultRep[];
  notes: Note[];
}

// Rule messages are short already. This only guards a long one, so a rep
// line stays readable on a phone.
const MAX_MESSAGE_LENGTH = 60;

export function shortName(exerciseName: string): string {
  return exerciseName.split(" (")[0];
}

// 12345 ms -> "0:12".
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// ["4", "9", "11"] -> "4, 9 and 11".
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function shortMessage(message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_MESSAGE_LENGTH - 3).trimEnd()}...`;
}

// "rep 4" or "reps 4, 9 and 11".
function repList(reps: number[]): string {
  return `rep${reps.length === 1 ? "" : "s"} ${joinList(reps.map(String))}`;
}

// Which reps had faults: "reps 4, 9 and 11" for one set, or
// "set 1 reps 4 and 6; set 2 rep 3" across sets.
function whichReps(faultReps: FaultRep[]): string {
  const bySet = new Map<number, number[]>();
  for (const { set, rep } of faultReps) {
    bySet.set(set, [...(bySet.get(set) ?? []), rep]);
  }
  if (bySet.size === 1) return repList([...bySet.values()][0]);
  return [...bySet]
    .map(([set, reps]) => `set ${set} ${repList(reps)}`)
    .join("; ");
}

export function describeLoad(record: SessionRecord): string {
  const bodyweight =
    PROFILES.find((p) => p.id === record.exerciseId)?.bodyweight ?? false;
  if (bodyweight) {
    return record.weightKg
      ? `Bodyweight + ${record.weightKg} kg`
      : "Bodyweight";
  }
  return record.weightKg ? `${record.weightKg} kg` : "";
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

  const faultReps: FaultRep[] = record.sets.flatMap((s) =>
    s.reps.flatMap((rep, i) =>
      rep.faults.length > 0
        ? [
            {
              set: s.set,
              rep: i + 1,
              atMs: rep.atMs,
              messages: rep.faults.map((id) =>
                shortMessage(faultMessage(record.exerciseId, id)),
              ),
            },
          ]
        : [],
    ),
  );

  return {
    totalReps,
    cleanReps,
    cleanPct,
    avgRepMs,
    partials,
    sets,
    faultReps,
    notes: buildNotes(
      record.exerciseId,
      sets,
      totalReps,
      cleanReps,
      partials,
      faultReps,
    ),
  };
}

// Past this many, the note gives the count only; the rep by rep list
// above it already names every one.
const MAX_REPS_IN_NOTE = 6;

function buildNotes(
  exerciseId: string,
  sets: SetStats[],
  totalReps: number,
  cleanReps: number,
  partials: number,
  faultReps: FaultRep[],
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
  } else if (cleanRatio < 0.8 && totalReps >= 6) {
    const count = `${faultReps.length} of ${totalReps} reps had faults`;
    const which =
      faultReps.length <= MAX_REPS_IN_NOTE
        ? `${count}: ${whichReps(faultReps)}`
        : `${count}, listed rep by rep above`;
    notes.push({
      text: `${which}. Lower the weight and rebuild`,
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

function dot(tone: Note["tone"]): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${TONE_CLASS[tone]}`;
  return span;
}

function textSpan(className: string, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

const PLAY_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"></path></svg>`;

// One numbered square per rep: green when clean, red when it broke form.
// Eight to a row, wrapping.
function repSquares(reps: number, faultyReps: Set<number>): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-8 gap-1.5";
  for (let rep = 1; rep <= reps; rep++) {
    const faulty = faultyReps.has(rep);
    const square = textSpan(
      `flex aspect-square items-center justify-center rounded-md text-[13px] font-semibold ${faulty ? "bg-bad text-paper" : "bg-good text-ink"}`,
      String(rep),
    );
    square.setAttribute("role", "img");
    square.setAttribute(
      "aria-label",
      `Rep ${rep}, ${faulty ? "form broke" : "clean"}`,
    );
    grid.append(square);
  }
  return grid;
}

// "Rep 4 at 0:12: Hips sagging". The line is a button that starts disabled;
// clips.ts enables it and shows Watch when the set has a clip, so a tap
// opens the clip at that rep.
function faultLine(fault: FaultRep): HTMLButtonElement {
  const line = document.createElement("button");
  line.type = "button";
  line.disabled = true;
  line.dataset.set = String(fault.set);
  line.dataset.atMs = String(fault.atMs);
  line.className = "flex min-h-11 w-full items-center gap-3 py-2 text-left";

  const text = document.createElement("span");
  text.className = "grow text-sm leading-snug";
  text.append(
    textSpan("font-semibold", `Rep ${fault.rep} at ${formatClock(fault.atMs)}:`),
    ` ${fault.messages.join("; ")}`,
  );

  const watch = document.createElement("span");
  watch.dataset.watch = "";
  watch.hidden = true;
  watch.className =
    "flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-lime";
  watch.innerHTML = `${PLAY_ICON}Watch`;

  line.append(text, watch);
  return line;
}

// A card per set: "Set 2", how many reps were clean, a square per rep, then
// a line for each rep that broke form.
function renderRepByRep(stats: SessionStats): void {
  const section = document.getElementById("summary-reps-section")!;
  const list = document.getElementById("summary-reps")!;
  list.replaceChildren();
  section.hidden = stats.totalReps === 0;

  for (const s of stats.sets) {
    const faults = stats.faultReps.filter((f) => f.set === s.set);

    const header = document.createElement("div");
    header.className = "flex items-baseline justify-between gap-3";
    header.append(
      textSpan("text-[15px] font-semibold", `Set ${s.set}`),
      textSpan("text-[13px] text-muted", `${s.clean} of ${s.reps} clean`),
    );

    const card = document.createElement("div");
    card.className =
      "flex flex-col gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5";
    card.append(header, repSquares(s.reps, new Set(faults.map((f) => f.rep))));

    if (faults.length > 0) {
      const lines = document.createElement("div");
      lines.className = "flex flex-col divide-y divide-line border-t border-line";
      lines.append(...faults.map(faultLine));
      card.append(lines);
    } else {
      const row = document.createElement("div");
      row.className = "flex items-start gap-2.5";
      row.append(dot("good"), textSpan("text-sm leading-snug", "Every rep clean."));
      card.append(row);
    }

    list.append(card);
  }
}

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

  const load = describeLoad(record);
  el("summary-meta").textContent = [
    load,
    `target ${record.target.sets} x ${record.target.reps}`,
  ]
    .filter(Boolean)
    .join(", ");

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
      <span class="flex h-3 grow overflow-hidden rounded-md bg-[#1c1c1a]">
        <span class="h-full bg-lime" style="width:${cleanPct}%"></span>
        <span class="h-full bg-bad" style="width:${badPct}%"></span>
      </span>
      <span class="w-16 text-right text-[13px] font-semibold">${countText}</span>`;
    setsEl.append(row);
  }

  renderRepByRep(stats);

  const notesEl = el("summary-notes");
  notesEl.replaceChildren();
  for (const note of stats.notes) {
    const row = document.createElement("div");
    row.className = "flex items-start gap-2.5";
    const text = document.createElement("span");
    text.className = "text-sm leading-snug";
    text.textContent = note.text;
    row.append(dot(note.tone), text);
    notesEl.append(row);
  }
}
