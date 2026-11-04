// The Challenges tab: your challenges, one challenge with its Hall of Gains,
// and the form that makes a new one. Links look like /c/<code>.

import {
  createChallenge,
  getChallenge,
  joinChallenge,
  leaderboard,
  leaveChallenge,
  listMine,
} from "../challengeApi";
import {
  FAILURE_COPY,
  challengeUrl,
  codeFromPath,
  datesText,
  exerciseLabel,
  profileIdsFor,
  lastDayLimits,
  progressFor,
  rangeFor,
  rangeUntil,
  rememberCode,
  shareText,
  standingLine,
  statusFor,
  takeRememberedCode,
} from "../challenges";
import type { Challenge, ChallengeFailure, Length, MyChallenge, SortBy } from "../challenges";
import { EXERCISES } from "../profiles";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const list = q<HTMLElement>("#challenge-list");
const empty = q<HTMLElement>("#challenge-empty");
const listError = q<HTMLElement>("#challenge-list-error");

const detail = q<HTMLElement>("#challenge-screen");
const titleEl = q<HTMLElement>("#challenge-title");
const stateEl = q<HTMLElement>("#challenge-state");
const body = q<HTMLElement>("#challenge-body");
const metaEl = q<HTMLElement>("#challenge-meta");
const descEl = q<HTMLElement>("#challenge-desc");
const byEl = q<HTMLElement>("#challenge-by");
const progressBox = q<HTMLElement>("#challenge-progress");
const progressText = q<HTMLElement>("#challenge-progress-text");
const progressBar = q<HTMLElement>("#challenge-progress-bar");
const joinBtn = q<HTMLButtonElement>("#challenge-join");
const joinError = q<HTMLElement>("#challenge-join-error");
const boardWrap = q<HTMLElement>("#challenge-board-wrap");
const board = q<HTMLElement>("#challenge-board");
const boardError = q<HTMLElement>("#challenge-board-error");
const sortButtons = [...document.querySelectorAll<HTMLButtonElement>("#challenge-sort [data-sort]")];
const actions = q<HTMLElement>("#challenge-actions");
const shareBtn = q<HTMLButtonElement>("#challenge-share");
const leaveBtn = q<HTMLButtonElement>("#challenge-leave");

const form = q<HTMLElement>("#challenge-new-screen");
const formEl = q<HTMLFormElement>("#challenge-form");
const titleInput = q<HTMLInputElement>("#cn-title");
const descInput = q<HTMLTextAreaElement>("#cn-desc");
const goalInput = q<HTMLInputElement>("#cn-goal");
const exerciseBox = q<HTMLElement>("#cn-exercises");
const lengthButtons = [...document.querySelectorAll<HTMLButtonElement>("#cn-length [data-length]")];
const lastWrap = q<HTMLElement>("#cn-last-wrap");
const lastInput = q<HTMLInputElement>("#cn-last");
const datesEl = q<HTMLElement>("#cn-dates");
const formError = q<HTMLElement>("#cn-error");
const submitBtn = q<HTMLButtonElement>("#cn-submit");

let current: Challenge | null = null;
let sort: SortBy = "workouts";
let length: Length | "custom" = "week";
// Bumped on every open, so a slow answer for an old one is ignored.
let openToken = 0;

function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}

function say(el: HTMLElement, failure: ChallengeFailure | null): void {
  el.textContent = failure ? FAILURE_COPY[failure] : "";
  show(el, failure !== null);
}

// --- The list ------------------------------------------------------------

function card(c: MyChallenge): HTMLElement {
  const status = statusFor(c.startsAt, c.endsAt);
  const progress = progressFor(c.myCleanReps, c.goalCleanReps);
  const el = document.createElement("button");
  el.type = "button";
  el.className =
    "flex flex-col gap-1.5 rounded-[22px] border border-line bg-white p-4 text-left";
  const name = document.createElement("b");
  name.className = "text-[16px] leading-tight";
  name.textContent = c.title;
  const meta = document.createElement("span");
  meta.className = "text-[13px] text-muted";
  meta.textContent = `${exerciseLabel(c.exerciseIds)}. ${status.text}.`;
  const mine = document.createElement("span");
  mine.className = "text-[13px] font-semibold";
  const people = `${c.members} ${c.members === 1 ? "person" : "people"}`;
  mine.textContent = `${progress ? progress.text : `${c.myCleanReps} clean reps`}. ${people}.`;
  el.append(name, meta, mine);
  el.addEventListener("click", () => void openChallenge(c.code));
  return el;
}

export async function refreshChallenges(): Promise<void> {
  const result = await listMine();
  if (!result.ok) {
    say(listError, result.failure);
    return;
  }
  say(listError, null);
  const running = result.value.filter((c) => statusFor(c.startsAt, c.endsAt).state !== "ended");
  const ended = result.value.filter((c) => statusFor(c.startsAt, c.endsAt).state === "ended");
  list.replaceChildren(...[...running, ...ended].map(card));
  show(empty, result.value.length === 0);
}

// --- One challenge ---------------------------------------------------------

function setSort(next: SortBy): void {
  sort = next;
  for (const button of sortButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.sort === next));
  }
}

function row(rank: number, name: string, line: string, isMe: boolean): HTMLElement {
  const li = document.createElement("li");
  li.className = `flex items-center gap-3 rounded-2xl px-3 py-3 ${isMe ? "border-[1.5px] border-forest bg-white" : "bg-sand"}`;
  const n = document.createElement("span");
  n.className = "w-7 shrink-0 text-center text-[16px] font-extrabold";
  n.textContent = String(rank);
  const text = document.createElement("span");
  text.className = "flex min-w-0 flex-col";
  const who = document.createElement("b");
  who.className = "truncate text-[15px]";
  who.textContent = isMe ? `${name} (you)` : name;
  const sub = document.createElement("span");
  sub.className = "text-[13px] text-muted";
  sub.textContent = line;
  text.append(who, sub);
  li.append(n, text);
  return li;
}

async function drawBoard(c: Challenge, token: number): Promise<void> {
  const result = await leaderboard(c.id, sort);
  if (token !== openToken) return;
  if (!result.ok) {
    say(boardError, result.failure);
    return;
  }
  say(boardError, null);
  board.replaceChildren(
    ...result.value.map((s) => row(s.rank, s.name, standingLine(s), s.isMe)),
  );
  const me = result.value.find((s) => s.isMe);
  const progress = progressFor(me?.cleanReps ?? 0, c.goalCleanReps);
  show(progressBox, progress !== null);
  if (progress) {
    progressText.textContent = progress.text;
    progressBar.style.width = `${progress.pct}%`;
  }
}

function drawChallenge(c: Challenge, token: number): void {
  current = c;
  const status = statusFor(c.startsAt, c.endsAt);
  titleEl.textContent = c.title;
  metaEl.textContent = `${exerciseLabel(c.exerciseIds)}. ${datesText(c.startsAt, c.endsAt)}. ${status.text}.`;
  descEl.textContent = c.description ?? "";
  show(descEl, Boolean(c.description));
  byEl.textContent = `Made by ${c.creatorName}. ${c.members} ${c.members === 1 ? "person" : "people"} in.`;
  show(stateEl, false);
  show(body, true);
  say(joinError, null);
  const canJoin = !c.joined && status.state !== "ended";
  show(joinBtn, canJoin);
  joinBtn.disabled = false;
  joinBtn.textContent = "Join challenge";
  if (!c.joined && status.state === "ended") {
    stateEl.textContent = "This challenge has ended.";
    show(stateEl, true);
  }
  show(boardWrap, c.joined);
  show(actions, true);
  show(leaveBtn, c.joined);
  show(progressBox, false);
  if (c.joined) void drawBoard(c, token);
}

export async function openChallenge(code: string): Promise<void> {
  const token = ++openToken;
  current = null;
  detail.hidden = false;
  detail.scrollTop = 0;
  titleEl.textContent = "Challenge";
  show(body, false);
  stateEl.textContent = "Loading...";
  show(stateEl, true);
  setSort("workouts");
  const result = await getChallenge(code);
  if (token !== openToken) return;
  if (!result.ok) {
    stateEl.textContent = FAILURE_COPY[result.failure];
    return;
  }
  if (!result.value) {
    stateEl.textContent = FAILURE_COPY.not_found;
    return;
  }
  drawChallenge(result.value, token);
}

joinBtn.addEventListener("click", async () => {
  if (!current) return;
  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";
  const result = await joinChallenge(current.code);
  if (!result.ok) {
    joinBtn.disabled = false;
    joinBtn.textContent = "Join challenge";
    say(joinError, result.failure);
    return;
  }
  void refreshChallenges();
  await openChallenge(current.code);
});

for (const button of sortButtons) {
  button.addEventListener("click", () => {
    setSort(button.dataset.sort as SortBy);
    if (current?.joined) void drawBoard(current, openToken);
  });
}

shareBtn.addEventListener("click", async () => {
  if (!current) return;
  const url = challengeUrl(window.location.origin, current.code);
  const text = shareText(current.title, url);
  try {
    if (navigator.share) {
      await navigator.share({ title: current.title, text, url });
      return;
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(text);
    shareBtn.textContent = "Link copied";
  } catch {
    shareBtn.textContent = url;
  }
  window.setTimeout(() => (shareBtn.textContent = "Share the link"), 2500);
});

leaveBtn.addEventListener("click", async () => {
  if (!current) return;
  if (!window.confirm("Leave this challenge? Your workouts stay saved.")) return;
  const result = await leaveChallenge(current.id);
  if (!result.ok) {
    say(boardError, result.failure);
    return;
  }
  void refreshChallenges();
  detail.hidden = true;
});

q<HTMLButtonElement>("#challenge-back").addEventListener("click", () => {
  detail.hidden = true;
  openToken++;
});

// --- Making one ------------------------------------------------------------

// The dates the form is set to, or null when "Pick a date" has no good day.
function chosenRange(): { startsAt: string; endsAt: string } | null {
  return length === "custom" ? rangeUntil(lastInput.value) : rangeFor(length);
}

function drawDates(): void {
  show(lastWrap, length === "custom");
  const range = chosenRange();
  datesEl.textContent = range
    ? datesText(range.startsAt, range.endsAt)
    : length === "custom"
      ? "Pick the last day."
      : "";
}

function selected(): string[] {
  return [...exerciseBox.querySelectorAll<HTMLButtonElement>("[aria-pressed=true]")].map(
    (b) => b.dataset.exercise!,
  );
}

for (const exercise of EXERCISES) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.dataset.exercise = exercise.id;
  chip.setAttribute("aria-pressed", "false");
  chip.className =
    "min-h-11 rounded-full border-[1.5px] border-[#c9c4b9] px-4 text-[14px] font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white";
  chip.textContent = exercise.name;
  chip.addEventListener("click", () =>
    chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true")),
  );
  exerciseBox.append(chip);
}

for (const button of lengthButtons) {
  button.addEventListener("click", () => {
    length = button.dataset.length as Length | "custom";
    for (const b of lengthButtons) b.setAttribute("aria-checked", String(b === button));
    drawDates();
  });
}

lastInput.addEventListener("input", drawDates);

function openForm(): void {
  formEl.reset();
  for (const b of exerciseBox.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
  length = "week";
  const limits = lastDayLimits();
  lastInput.min = limits.min;
  lastInput.max = limits.max;
  lastInput.value = "";
  for (const b of lengthButtons) b.setAttribute("aria-checked", String(b.dataset.length === "week"));
  drawDates();
  show(formError, false);
  submitBtn.disabled = false;
  form.hidden = false;
  form.scrollTop = 0;
}

q<HTMLButtonElement>("#challenge-new").addEventListener("click", openForm);
q<HTMLButtonElement>("#challenge-new-back").addEventListener("click", () => {
  form.hidden = true;
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  show(formError, false);
  const title = titleInput.value.trim();
  const goalText = goalInput.value.trim();
  const goal = goalText ? Number(goalText) : null;
  if (title.length < 3 || (goal !== null && (!Number.isInteger(goal) || goal < 1 || goal > 100000))) {
    say(formError, "bad_input");
    return;
  }
  const range = chosenRange();
  if (!range) {
    formError.textContent = "Pick a last day from today to 91 days away.";
    show(formError, true);
    return;
  }
  const { startsAt, endsAt } = range;
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";
  const result = await createChallenge({
    title,
    description: descInput.value.trim(),
    exerciseIds: profileIdsFor(selected()),
    goal,
    startsAt,
    endsAt,
  });
  submitBtn.disabled = false;
  submitBtn.textContent = "Create challenge";
  if (!result.ok) {
    say(formError, result.failure);
    return;
  }
  form.hidden = true;
  void refreshChallenges();
  await openChallenge(result.value.code);
});

// --- Links -----------------------------------------------------------------

// Call once on load. A link like /c/ab12cd34 is remembered, because the
// person may have to sign in first (Google sends them back to the home page).
export function captureChallengeLink(): void {
  const code = codeFromPath(window.location.pathname);
  if (!code) return;
  rememberCode(code);
  window.history.replaceState(null, "", `/${window.location.search}${window.location.hash}`);
}

// The code of a link opened before signing in, once, or null.
export function pendingChallengeCode(): string | null {
  return takeRememberedCode();
}

export function hideChallengeScreens(): void {
  openToken++;
  detail.hidden = true;
  form.hidden = true;
}

export function resetChallenges(): void {
  hideChallengeScreens();
  list.replaceChildren();
  show(empty, false);
  current = null;
}
