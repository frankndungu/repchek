// The History tab: every saved session, grouped by week, with a card that
// answers "am I improving?". Tap a session to reopen its report.

import { loadHistory } from "../account";
import {
  cleanPct,
  compareToPrevious,
  comparisonText,
  dayLabel,
  exerciseChips,
  groupByWeek,
  repsText,
  shortName,
  sparkline,
  weekTrend,
} from "../history";
import type { HistoryItem, Trend } from "../history";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const errorBox = q<HTMLElement>("#history-error");
const trendCard = q<HTMLElement>("#history-trend");
const spark = q<SVGSVGElement>("#history-spark");
const chipsBox = q<HTMLElement>("#history-chips");
const groupsBox = q<HTMLElement>("#history-groups");
const emptyNote = q<HTMLElement>("#history-empty");

let items: HistoryItem[] = [];
let filter: string | null = null;
let openReport: (id: string) => Promise<boolean> = async () => false;

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = message === "";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function trendWords(trend: Trend): { title: string; sub: string } {
  const { thisWeek, lastWeek, points } = trend;
  switch (trend.direction) {
    case "up":
      return {
        title: "You are improving",
        sub: `Clean rate up ${plural(points, "point")} on last week, ${lastWeek}% to ${thisWeek}%.`,
      };
    case "steady":
      return {
        title: "Holding steady",
        sub: `Clean rate ${thisWeek}%, the same as last week.`,
      };
    case "down":
      return {
        title: "A little down",
        sub: `Clean rate down ${plural(-points, "point")} on last week, ${lastWeek}% to ${thisWeek}%.`,
      };
    default:
      return {
        title: "Keep going",
        sub: "Train again this week to see how you compare with last week.",
      };
  }
}

function drawSpark(rates: number[]): void {
  spark.toggleAttribute("hidden", rates.length < 2);
  if (rates.length < 2) return;
  const step = 100 / (rates.length - 1);
  const points = rates
    .map((r, i) => `${(i * step).toFixed(1)},${(30 - (r / 100) * 28).toFixed(1)}`)
    .join(" ");
  spark.innerHTML = `<polyline points="${points}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>`;
}

function chip(label: string, id: string | null): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  const on = filter === id;
  el.setAttribute("aria-pressed", String(on));
  el.className = on
    ? "min-h-11 shrink-0 rounded-full border-[1.5px] border-ink bg-ink px-4 text-[14px] font-semibold text-white"
    : "min-h-11 shrink-0 rounded-full border-[1.5px] border-[#c9c4b9] bg-white px-4 text-[14px] font-medium text-ink";
  el.textContent = label;
  el.addEventListener("click", () => {
    filter = id;
    render();
  });
  return el;
}

function row(item: HistoryItem): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className =
    "flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left";

  const left = document.createElement("span");
  left.className = "flex min-w-0 grow flex-col";
  const name = document.createElement("b");
  name.className = "truncate text-[15px]";
  name.textContent = shortName(item.exerciseName);
  const sub = document.createElement("span");
  sub.className = "text-[13px] text-muted";
  sub.textContent = `${dayLabel(item.startedAt)}, ${repsText(item.totalReps)}`;
  left.append(name, sub);

  const right = document.createElement("span");
  right.className = "flex shrink-0 flex-col items-end";
  const pct = document.createElement("span");
  pct.className = "text-[20px] leading-none font-extrabold text-forest";
  pct.textContent = `${cleanPct(item)}%`;
  const label = document.createElement("span");
  label.className =
    "text-[10px] font-semibold tracking-[0.12em] text-muted uppercase";
  label.textContent = "clean";
  right.append(pct, label);

  el.append(left, right);
  el.addEventListener("click", () => {
    el.disabled = true;
    void openReport(item.id).then((ok) => {
      el.disabled = false;
      if (!ok) showError("Could not open that session. Check your connection.");
    });
  });
  return el;
}

function render(): void {
  const chips = exerciseChips(items);
  chipsBox.hidden = chips.length < 2;
  chipsBox.replaceChildren(
    chip("All", null),
    ...chips.map((c) => chip(c.name, c.id)),
  );

  const shown = filter ? items.filter((i) => i.exerciseId === filter) : items;
  emptyNote.hidden = shown.length > 0;
  emptyNote.textContent =
    "No sessions yet. Finish one from Train and it will show here.";
  trendCard.hidden = shown.length === 0;

  if (shown.length > 0) {
    const words = trendWords(weekTrend(shown));
    q<HTMLElement>("#history-trend-label").textContent =
      "This week vs last week";
    q<HTMLElement>("#history-trend-title").textContent = words.title;
    q<HTMLElement>("#history-trend-sub").textContent = words.sub;
    drawSpark(sparkline(shown));
  }

  groupsBox.replaceChildren(
    ...groupByWeek(shown).map((group) => {
      const section = document.createElement("section");
      section.className = "flex flex-col gap-2";
      const head = document.createElement("div");
      head.className = "flex items-baseline justify-between gap-3";
      const title = document.createElement("h2");
      title.className = "text-[15px] font-bold";
      title.textContent = group.title;
      const total = document.createElement("span");
      total.className = "text-[12px] text-muted";
      total.textContent = `${plural(group.sessions, "session")}, ${group.cleanReps} clean reps`;
      head.append(title, total);
      section.append(head, ...group.items.map(row));
      return section;
    }),
  );
}

// Reads the saved sessions and redraws the list.
export async function refreshHistory(): Promise<void> {
  const loaded = await loadHistory();
  if (loaded === null) {
    showError("Could not load your history. Check your connection.");
    return;
  }
  showError("");
  items = loaded;
  if (filter && !items.some((i) => i.exerciseId === filter)) filter = null;
  render();
}

// The "vs last time" line on a report. Looks at the saved sessions, so it
// works for a session that was just finished and for one reopened later.
export async function showComparison(session: {
  exerciseId: string;
  exerciseName: string;
  startedAt: string;
  totalReps: number;
  cleanReps: number;
}): Promise<void> {
  const line = q<HTMLElement>("#summary-compare");
  line.hidden = true;
  if (session.totalReps === 0) return;
  const saved = await loadHistory();
  if (saved === null) return;
  line.textContent = comparisonText(
    compareToPrevious(saved, session),
    session.exerciseName,
  );
  line.hidden = false;
}

export function resetHistory(): void {
  items = [];
  filter = null;
  groupsBox.replaceChildren();
  chipsBox.replaceChildren();
  trendCard.hidden = true;
  emptyNote.hidden = true;
  showError("");
}

export function initHistory(open: (id: string) => Promise<boolean>): void {
  openReport = open;
}
