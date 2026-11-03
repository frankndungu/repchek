// The Progress section of History. Premium sees charts, what we noticed,
// what to try next, a comparison and records. Free sees a taste of their own
// data and what Premium adds.

import { loadAnalyticsSessions, loadHistory } from "../account";
import {
  cleanRateSeries,
  cleanTrend,
  compareSessions,
  exercisesByUse,
  forExercise,
  inPeriod,
  insightsFor,
  MIN_SESSIONS_FOR_TREND,
  recommendationFor,
  recordsTimeline,
} from "../analytics";
import type { AnalyticsSession, ChartPoint, Period } from "../analytics";
import { checkoutEnabled, startCheckout } from "../billing";
import { currentPlan } from "./profile";
import { faultMessage } from "./summary";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const sessionsView = q<HTMLElement>("#history-sessions-view");
const progressView = q<HTMLElement>("#progress-view");
const segSessions = q<HTMLButtonElement>("#seg-sessions");
const segProgress = q<HTMLButtonElement>("#seg-progress");
const errorBox = q<HTMLElement>("#progress-error");
const freeBox = q<HTMLElement>("#progress-free");
const premiumBox = q<HTMLElement>("#progress-premium");

const PERIODS: { id: Period; label: string }[] = [
  { id: "4w", label: "4 weeks" },
  { id: "12w", label: "12 weeks" },
  { id: "all", label: "All time" },
];

let showing: "sessions" | "progress" = "sessions";
let sessions: AnalyticsSession[] = [];
let exerciseId: string | null = null;
let period: Period = "12w";

// --- Small helpers ---------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = message === "";
}

// A line of clean rate over the sessions, drawn like the Premium mockup.
function chartSvg(points: ChartPoint[], summary: string): string {
  const W = 240;
  const H = 120;
  const left = 26;
  const right = 12;
  const top = 10;
  const bottom = 22;
  const x = (i: number) =>
    points.length === 1
      ? (left + W - right) / 2
      : left + ((W - left - right) * i) / (points.length - 1);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / 100);

  const grid = [0, 50, 100]
    .map(
      (v) =>
        `<path d="M${left} ${y(v)}H${W - right}" stroke="#e6e2da"/><text x="${left - 4}" y="${y(v) + 3}" font-size="8" fill="#5f5f5a" text-anchor="end">${v}</text>`,
    )
    .join("");
  const line =
    points.length > 1
      ? `<polyline points="${points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}" fill="none" stroke="#17352B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${i === points.length - 1 ? 4.5 : 3.5}" fill="#17352B"/>`,
    )
    .join("");
  const labels =
    points.length > 0
      ? `<text x="${x(0)}" y="${H - 6}" font-size="8" fill="#5f5f5a" text-anchor="${points.length === 1 ? "middle" : "start"}">${shortDate(points[0].startedAt)}</text>` +
        (points.length > 1
          ? `<text x="${x(points.length - 1)}" y="${H - 6}" font-size="8" fill="#5f5f5a" text-anchor="end">${shortDate(points[points.length - 1].startedAt)}</text>`
          : "")
      : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="block h-auto w-full" role="img" aria-label="${summary}">${grid}${line}${dots}${labels}</svg>`;
}

function chip(
  label: string,
  on: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const b = el(
    "button",
    on
      ? "min-h-11 shrink-0 rounded-full border-[1.5px] border-ink bg-ink px-4 text-[14px] font-semibold text-white"
      : "min-h-11 shrink-0 rounded-full border-[1.5px] border-[#c9c4b9] bg-white px-4 text-[14px] font-medium text-ink",
    label,
  );
  b.type = "button";
  b.setAttribute("aria-pressed", String(on));
  b.addEventListener("click", onClick);
  return b;
}

// --- Free: a taste of the user's own data ----------------------------------

function trendSentence(name: string, points: number, sessionsCount: number): string {
  const lower = name.toLowerCase();
  if (Math.abs(points) <= 1) return `Your ${lower} clean rate is steady.`;
  return `Your ${lower} clean rate is ${points > 0 ? "up" : "down"} ${Math.abs(points)} points over ${sessionsCount} sessions.`;
}

async function drawFree(): Promise<void> {
  const items = await loadHistory();
  if (items === null) {
    showError("Could not load your progress. Check your connection.");
    return;
  }
  showError("");

  const counts = new Map<string, { name: string; list: typeof items }>();
  for (const item of items) {
    if (item.totalReps === 0) continue;
    const entry = counts.get(item.exerciseId) ?? {
      name: item.exerciseName.split(" (")[0],
      list: [],
    };
    entry.list.push(item);
    counts.set(item.exerciseId, entry);
  }
  const top = [...counts.values()].sort((a, b) => b.list.length - a.list.length)[0];

  const chart = q<HTMLElement>("#progress-teaser-chart");
  const title = q<HTMLElement>("#progress-teaser-title");
  const sub = q<HTMLElement>("#progress-teaser-sub");

  if (!top) {
    chart.innerHTML = chartSvg([], "Sample chart");
    title.textContent = "Finish a few sessions";
    sub.textContent = "Your trend shows up here after 3 sessions of one exercise.";
    return;
  }

  const ordered = [...top.list].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  chart.innerHTML = chartSvg(
    ordered.map((i) => ({
      startedAt: i.startedAt,
      value: i.totalReps ? Math.round((i.cleanReps / i.totalReps) * 100) : 0,
    })),
    "Your clean rate over time",
  );
  const trend = cleanTrend(ordered);
  if (trend) {
    title.textContent = trendSentence(top.name, trend.points, trend.sessions);
    sub.textContent = "Premium shows what changed.";
  } else {
    const left = MIN_SESSIONS_FOR_TREND - ordered.length;
    title.textContent = `${left} more ${top.name.toLowerCase()} session${left === 1 ? "" : "s"} unlock your first trend`;
    sub.textContent = "Keep training. Your progress is being saved.";
  }
}

// --- Premium ---------------------------------------------------------------

function drawChips(): void {
  const list = exercisesByUse(sessions);
  if (!list.some((e) => e.id === exerciseId)) exerciseId = list[0]?.id ?? null;
  q<HTMLElement>("#progress-chips").replaceChildren(
    ...list.map((e) =>
      chip(e.name, e.id === exerciseId, () => {
        exerciseId = e.id;
        drawPremium();
      }),
    ),
  );
  q<HTMLElement>("#progress-periods").replaceChildren(
    ...PERIODS.map((p) => {
      const on = p.id === period;
      const b = el(
        "button",
        `min-h-11 rounded-full text-[13px] ${on ? "bg-white font-bold text-ink shadow-sm" : "font-medium text-muted"}`,
        p.label,
      );
      b.type = "button";
      b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", () => {
        period = p.id;
        drawPremium();
      });
      return b;
    }),
  );
}

function drawPremium(): void {
  drawChips();
  const all = exerciseId ? forExercise(sessions, exerciseId) : [];
  const name = all[0]?.exerciseName ?? "";
  const windowed = inPeriod(all, period);

  // Chart
  const chartBox = q<HTMLElement>("#progress-chart");
  const chartNote = q<HTMLElement>("#progress-chart-note");
  if (windowed.length === 0) {
    chartBox.replaceChildren();
    chartNote.textContent = all.length
      ? "No sessions in this period. Try a longer one."
      : "No sessions yet. Finish one and it shows here.";
  } else {
    chartBox.innerHTML = chartSvg(
      cleanRateSeries(windowed),
      `${name} clean rate over ${windowed.length} sessions`,
    );
    chartNote.textContent = "";
  }

  // What we noticed
  const insights = insightsFor(windowed, name, faultMessage);
  q<HTMLElement>("#progress-insights").replaceChildren(
    ...insights.map((i) => {
      const li = el("li", "flex gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-[14px] leading-snug");
      const dot = el(
        "span",
        `mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.tone === "good" ? "bg-forest" : i.tone === "watch" ? "bg-bad" : "bg-[#c9c4b9]"}`,
      );
      dot.setAttribute("aria-hidden", "true");
      li.append(dot, el("span", "", i.text));
      return li;
    }),
  );
  const missing = MIN_SESSIONS_FOR_TREND - windowed.length;
  q<HTMLElement>("#progress-insights-note").textContent =
    windowed.length > 0 && missing > 0
      ? `${missing} more ${name.toLowerCase()} session${missing === 1 ? "" : "s"} in this period unlock what we notice.`
      : windowed.length === 0
        ? ""
        : insights.length === 0
          ? "Nothing stands out yet."
          : "";

  // What to try next (always from the latest sessions, not the period)
  const reco = q<HTMLElement>("#progress-reco");
  const result = all.length ? recommendationFor(all) : null;
  if (result && "recommendation" in result) {
    const tile = el("div", "flex flex-col gap-1 rounded-3xl bg-forest px-4 py-4 text-white");
    tile.append(
      el("b", "text-[15px] leading-snug", result.recommendation.title),
      el("span", "text-[13px] leading-snug text-[#c5d3cc]", result.recommendation.detail),
    );
    reco.replaceChildren(tile);
  } else if (result) {
    const tile = el("div", "rounded-3xl border border-line bg-sand px-4 py-4 text-[14px] leading-snug");
    tile.textContent = `${result.missing} more ${name.toLowerCase()} session${result.missing === 1 ? "" : "s"} unlock what to try next.`;
    reco.replaceChildren(tile);
  } else {
    reco.replaceChildren();
  }

  drawCompare(all);

  // Records, across every exercise
  const events = recordsTimeline(sessions);
  const box = q<HTMLElement>("#progress-records");
  if (events.length === 0) {
    box.replaceChildren(el("p", "py-4 text-[13px] text-muted", "Beat a personal best and it shows here with the date."));
  } else {
    box.replaceChildren(
      ...events.map((e, i) => {
        const row = el("div", `flex flex-col gap-0.5 py-3${i === 0 ? "" : " border-t border-line"}`);
        row.append(
          el("b", "text-[14px]", `${e.label}: ${e.value}`),
          el("span", "text-[12px] text-muted", `${e.exerciseName}, ${shortDate(e.startedAt)}, was ${e.previous}`),
        );
        return row;
      }),
    );
  }
}

function drawCompare(list: AnalyticsSession[]): void {
  const box = q<HTMLElement>("#progress-compare");
  if (list.length < 2) {
    box.replaceChildren(el("p", "text-[13px] text-muted", "Do two sessions of this exercise to compare them."));
    return;
  }
  const newest = [...list].reverse();
  const label = (s: AnalyticsSession) =>
    `${shortDate(s.startedAt)}, ${s.totalReps} reps`;
  const select = (name: string, chosen: number) => {
    const s = el("select", "min-h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-[14px]");
    s.setAttribute("aria-label", name);
    newest.forEach((session, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = label(session);
      s.append(o);
    });
    s.value = String(chosen);
    return s;
  };
  // Earlier on the left, latest on the right.
  const left = select("First session", 1);
  const right = select("Second session", 0);
  const table = el("div", "flex flex-col");

  const draw = () => {
    const a = newest[Number(left.value)];
    const b = newest[Number(right.value)];
    table.replaceChildren(
      ...compareSessions(a, b).map((row, i) => {
        const r = el("div", `grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5 text-[14px]${i === 0 ? "" : " border-t border-line"}`);
        const better =
          row.better === null || row.better === 0
            ? "font-semibold"
            : row.better > 0
              ? "font-bold text-forest"
              : "font-bold text-bad";
        r.append(
          el("span", "text-muted", row.label),
          el("span", "text-right", row.a),
          el("span", `text-right ${better}`, row.b),
        );
        return r;
      }),
    );
  };
  left.addEventListener("change", draw);
  right.addEventListener("change", draw);
  draw();

  const pickers = el("div", "grid grid-cols-2 gap-2");
  pickers.append(left, right);
  box.replaceChildren(pickers, table);
}

// --- Switching and loading ---------------------------------------------------

function setMode(mode: "sessions" | "progress"): void {
  showing = mode;
  sessionsView.hidden = mode !== "sessions";
  progressView.hidden = mode !== "progress";
  segSessions.setAttribute("aria-pressed", String(mode === "sessions"));
  segProgress.setAttribute("aria-pressed", String(mode === "progress"));
  if (mode === "progress") void refreshProgress();
}

// Loads and draws the Progress section. Does nothing unless it is showing.
export async function refreshProgress(): Promise<void> {
  if (showing !== "progress") return;
  if (currentPlan() === "premium") {
    freeBox.hidden = true;
    const loaded = await loadAnalyticsSessions();
    if (loaded === null) {
      showError("Could not load your progress. Check your connection.");
      return;
    }
    showError("");
    sessions = loaded;
    premiumBox.hidden = false;
    drawPremium();
  } else {
    premiumBox.hidden = true;
    freeBox.hidden = false;
    const upgrade = q<HTMLButtonElement>("#progress-upgrade");
    upgrade.disabled = !checkoutEnabled;
    upgrade.textContent = checkoutEnabled ? "Upgrade to Premium" : "Premium is coming soon";
    await drawFree();
  }
}

export function resetProgress(): void {
  sessions = [];
  exerciseId = null;
  period = "12w";
  premiumBox.hidden = true;
  freeBox.hidden = true;
  showError("");
  setMode("sessions");
}

export function initProgress(): void {
  segSessions.addEventListener("click", () => setMode("sessions"));
  segProgress.addEventListener("click", () => setMode("progress"));

  const upgrade = q<HTMLButtonElement>("#progress-upgrade");
  const message = q<HTMLElement>("#progress-upgrade-error");
  upgrade.addEventListener("click", () => {
    upgrade.disabled = true;
    message.textContent = "";
    void startCheckout().then((result) => {
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      upgrade.disabled = !checkoutEnabled;
      message.textContent =
        result.reason === "already_premium"
          ? "Premium is already on. Reopen this tab."
          : "Could not start checkout. Try again.";
    });
  });
}
