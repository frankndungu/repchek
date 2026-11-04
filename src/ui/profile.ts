// The Profile tab, the Milestones screen, the streak tile on Start, and the
// saved line and XP on the summary. Data comes from ../account, the
// maths from ../progress.

import {
  clearPending,
  deleteAccount,
  flushPending,
  loadProfile,
  loadSessionSummaries,
  saveSession,
  updateName,
} from "../account";
import type { Profile } from "../account";
import { signOut } from "../auth";
import { checkoutEnabled, openPortal, startCheckout } from "../billing";
import type { SessionRecord } from "../engine/session";
import {
  levelFor,
  milestonesFor,
  personalBests,
  streakFor,
  totalsFor,
  xpFor,
} from "../progress";
import type { Milestone, SessionSummary } from "../progress";
import type { SessionStats } from "./summary";
import { showComparison } from "./history";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const profileScreen = q<HTMLElement>("#profile-screen");
const milestonesScreen = q<HTMLElement>("#milestones-screen");
const profileError = q<HTMLElement>("#profile-error");
const nameInput = q<HTMLInputElement>("#profile-name-input");
const deleteConfirm = q<HTMLElement>("#delete-confirm");
const deleteYes = q<HTMLButtonElement>("#delete-yes");
const savedLine = q<HTMLElement>("#summary-saved");
const retryBtn = q<HTMLButtonElement>("#summary-retry");

let profile: Profile | null = null;
let sessions: SessionSummary[] | null = null;
let lastFinished: { record: SessionRecord; stats: SessionStats } | null = null;

const MILESTONES_ON_PROFILE = 2;

function showError(message: string): void {
  profileError.textContent = message;
  profileError.hidden = message === "";
}

// --- Drawing --------------------------------------------------------------

function fillDots(container: HTMLElement, done: number, goal: number): void {
  container.replaceChildren(
    ...Array.from({ length: goal }, (_, i) => {
      const dot = document.createElement("i");
      dot.className =
        i < done
          ? "h-[22px] w-[22px] rounded-full border-[1.5px] border-forest bg-forest"
          : "h-[22px] w-[22px] rounded-full border-[1.5px] border-line bg-white";
      return dot;
    }),
  );
}

function drawStreak(
  title: HTMLElement,
  week: HTMLElement,
  dots: HTMLElement,
  all: SessionSummary[],
): void {
  const streak = streakFor(all);
  title.textContent =
    streak.weeks > 0
      ? `${streak.weeks} week streak`
      : "No streak yet";
  week.textContent = `${Math.min(streak.thisWeek, streak.goal)} of ${streak.goal} this week`;
  fillDots(dots, Math.min(streak.thisWeek, streak.goal), streak.goal);
}

function badge(m: Milestone): HTMLElement {
  const el = document.createElement("div");
  el.className = m.earned
    ? "min-w-0 rounded-2xl border border-line p-2.5"
    : "min-w-0 rounded-2xl border border-dashed border-line p-2.5 opacity-60";
  const name = document.createElement("b");
  name.className = "block text-[12px] leading-tight";
  name.textContent = m.name;
  const note = document.createElement("span");
  note.className = "text-[11px] text-muted";
  note.textContent = m.earned ? "Earned" : m.todo;
  el.append(name, note);
  return el;
}

function drawLevel(
  levelEl: HTMLElement,
  xpEl: HTMLElement | null,
  bar: HTMLElement,
  xp: number,
): void {
  const info = levelFor(xp);
  levelEl.textContent = `Level ${info.level}`;
  if (xpEl) xpEl.textContent = `${info.into} / ${info.needed} XP`;
  bar.style.width = `${Math.round((info.into / info.needed) * 100)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function drawPlan(p: Profile): void {
  const premium = p.plan === "premium";
  q<HTMLElement>("#plan-free").hidden = premium;
  q<HTMLElement>("#plan-premium").hidden = !premium;

  const upgrade = q<HTMLButtonElement>("#plan-upgrade");
  upgrade.disabled = !checkoutEnabled;
  upgrade.textContent = checkoutEnabled
    ? "Upgrade to Premium"
    : "Premium is coming soon";

  if (!premium) return;
  q<HTMLElement>("#plan-premium-label").textContent = p.hasSubscription
    ? "$3.99 a month"
    : "Early access";
  q<HTMLElement>("#plan-manage").hidden = !p.hasSubscription;
  q<HTMLElement>("#plan-premium-note").textContent =
    p.hasSubscription && p.premiumUntil
      ? p.cancelAtPeriodEnd
        ? `Ends on ${formatDate(p.premiumUntil)}. You keep Premium until then.`
        : `Renews on ${formatDate(p.premiumUntil)}.`
      : "Premium is on for this account.";
}

function planMessage(text: string): void {
  q<HTMLElement>("#plan-message").textContent = text;
}

function drawProfile(): void {
  if (profile) {
    q<HTMLElement>("#profile-name").textContent = profile.name;
    q<HTMLElement>("#profile-plan").textContent =
      profile.plan === "premium" ? "Premium" : "Free";
    q<HTMLElement>("#profile-email").textContent = profile.email;
    if (document.activeElement !== nameInput) nameInput.value = profile.name;
    drawPlan(profile);

    const avatar = q<HTMLElement>("#profile-avatar");
    if (profile.avatarUrl) {
      const img = document.createElement("img");
      img.src = profile.avatarUrl;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.className = "h-full w-full object-cover";
      img.addEventListener("error", () => {
        avatar.textContent = profile?.initials ?? "R";
      });
      avatar.replaceChildren(img);
    } else {
      avatar.textContent = profile.initials;
    }
  }

  if (sessions === null) return;

  drawStreak(
    q("#profile-streak-title"),
    q("#profile-streak-week"),
    q("#profile-streak-dots"),
    sessions,
  );
  drawLevel(
    q("#profile-level"),
    q("#profile-xp"),
    q("#profile-xp-bar"),
    xpFor(sessions),
  );
  const totals = totalsFor(sessions);
  q<HTMLElement>("#profile-sessions").textContent =
    totals.sessions.toLocaleString("en-US");
  q<HTMLElement>("#profile-clean").textContent =
    totals.cleanReps.toLocaleString("en-US");

  const all = milestonesFor(sessions);
  const earned = all.filter((m) => m.earned);
  const shown = earned.slice(0, MILESTONES_ON_PROFILE);
  if (shown.length === 0) {
    const note = document.createElement("p");
    note.className = "col-span-2 text-[13px] text-muted";
    note.textContent = "Your first milestone is one clean session away.";
    q<HTMLElement>("#profile-milestones").replaceChildren(note);
  } else {
    q<HTMLElement>("#profile-milestones").replaceChildren(...shown.map(badge));
  }
  q<HTMLElement>("#milestones-count").textContent =
    `${earned.length} of ${all.length}`;
  q<HTMLElement>("#milestones-list").replaceChildren(...all.map(badge));
  drawBests(sessions);
}

function drawBests(all: SessionSummary[]): void {
  const box = q<HTMLElement>("#profile-bests");
  const bests = personalBests(all);
  if (bests.length === 0) {
    const note = document.createElement("p");
    note.className = "py-4 text-[13px] text-muted";
    note.textContent = "Finish a session and your bests will show here.";
    box.replaceChildren(note);
    return;
  }
  box.replaceChildren(
    ...bests.map((best, i) => {
      const el = document.createElement("div");
      el.className = `flex items-center justify-between gap-3 py-3${i === 0 ? "" : " border-t border-line"}`;
      const name = document.createElement("b");
      name.className = "min-w-0 truncate text-[14px]";
      name.textContent = best.exerciseName;
      const detail = document.createElement("span");
      detail.className = "shrink-0 text-right text-[12px] leading-snug text-muted";
      detail.textContent =
        best.bestCleanPct === null
          ? `${best.mostCleanReps} clean reps`
          : `${best.mostCleanReps} clean reps, best rate ${best.bestCleanPct}%`;
      el.append(name, detail);
      return el;
    }),
  );
}

// Clears what a finished session showed, for a report opened from History.
export function clearSummarySave(): void {
  q<HTMLElement>("#summary-xp").hidden = true;
  retryBtn.hidden = true;
  savedLine.textContent = "";
}

// --- Loading --------------------------------------------------------------

// Reads the profile and every saved session, then redraws. Anything kept on
// the device from an offline session is sent first.
export async function refreshAccount(): Promise<void> {
  await flushPending();
  const [p, s] = await Promise.all([loadProfile(), loadSessionSummaries()]);
  if (p) profile = p;
  if (s) sessions = s;
  if (sessions === null) {
    showError("Could not load your progress. Check your connection.");
  } else {
    showError("");
  }
  drawProfile();
}

export function currentProfile(): Profile | null {
  return profile;
}

// The plan of the signed in user. Free until the profile has loaded.
export function currentPlan(): "free" | "premium" {
  return profile?.plan ?? "free";
}

export function resetAccountUi(): void {
  profile = null;
  sessions = null;
  lastFinished = null;
  profileScreen.hidden = true;
  milestonesScreen.hidden = true;
  deleteConfirm.hidden = true;
  showError("");
}

// --- Summary: saved line and XP -------------------------------------------

function drawSummaryXp(gain: number, total: number): void {
  const tile = q<HTMLElement>("#summary-xp");
  tile.hidden = false;
  q<HTMLElement>("#summary-xp-gain").textContent = `+${gain} XP`;
  const info = levelFor(total);
  q<HTMLElement>("#summary-xp-level").textContent = `Level ${info.level}`;
  q<HTMLElement>("#summary-xp-bar").style.width =
    `${Math.round((info.into / info.needed) * 100)}%`;
}

// Called when the summary opens. Saves the session, then shows the XP.
export async function onSessionFinished(
  record: SessionRecord,
  stats: SessionStats,
): Promise<void> {
  lastFinished = { record, stats };
  q<HTMLElement>("#summary-xp").hidden = true;
  retryBtn.hidden = true;
  if (stats.totalReps === 0) {
    savedLine.textContent = "";
    return;
  }
  savedLine.textContent = "Saving to your account...";
  const saved = await saveSession(record, stats);
  if (lastFinished?.record !== record) return;
  if (saved) {
    savedLine.textContent = "Saved to your account.";
    await refreshAccount();
  } else {
    savedLine.textContent =
      "Not saved yet. It will send when you are back online.";
    retryBtn.hidden = false;
  }
  void showComparison({
    exerciseId: record.exerciseId,
    exerciseName: record.exerciseName,
    startedAt: record.startedAt,
    totalReps: stats.totalReps,
    cleanReps: stats.cleanReps,
  });
  const before = sessions ? xpFor(sessions) : 0;
  drawSummaryXp(stats.cleanReps, before + (saved ? 0 : stats.cleanReps));
}

retryBtn.addEventListener("click", () => {
  if (lastFinished) void onSessionFinished(lastFinished.record, lastFinished.stats);
});

// --- Tabs and buttons -----------------------------------------------------

export function initProfile(): void {
  q<HTMLButtonElement>("#milestones-open").addEventListener("click", () => {
    milestonesScreen.hidden = false;
    milestonesScreen.scrollTop = 0;
  });
  q<HTMLButtonElement>("#milestones-back").addEventListener("click", () => {
    milestonesScreen.hidden = true;
  });

  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nameInput.blur();
  });
  nameInput.addEventListener("change", () => {
    if (!profile) return;
    const next = nameInput.value.trim();
    if (next === "" || next === profile.name) {
      nameInput.value = profile.name;
      return;
    }
    const previous = profile.name;
    profile = { ...profile, name: next };
    drawProfile();
    void updateName(profile.id, next).then((ok) => {
      if (ok || !profile) return;
      profile = { ...profile, name: previous };
      nameInput.value = previous;
      drawProfile();
      showError("Could not save your name. Try again.");
    });
  });

  const upgrade = q<HTMLButtonElement>("#plan-upgrade");
  upgrade.addEventListener("click", () => {
    upgrade.disabled = true;
    planMessage("");
    void startCheckout().then(async (result) => {
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      upgrade.disabled = !checkoutEnabled;
      if (result.reason === "already_premium") {
        await refreshAccount();
        return;
      }
      planMessage("Could not start checkout. Try again.");
    });
  });

  const manage = q<HTMLButtonElement>("#plan-manage");
  manage.addEventListener("click", () => {
    manage.disabled = true;
    planMessage("");
    void openPortal().then((result) => {
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      manage.disabled = false;
      planMessage("Could not open your subscription. Try again.");
    });
  });

  q<HTMLButtonElement>("#delete-open").addEventListener("click", () => {
    deleteConfirm.hidden = false;
  });
  q<HTMLButtonElement>("#delete-no").addEventListener("click", () => {
    deleteConfirm.hidden = true;
  });
  deleteYes.addEventListener("click", () => {
    deleteYes.disabled = true;
    void deleteAccount().then(async (ok) => {
      deleteYes.disabled = false;
      if (!ok) {
        showError("Could not delete your account. Try again.");
        return;
      }
      clearPending();
      await signOut();
    });
  });
}

const PREMIUM_POLL_MS = 2000;
const PREMIUM_POLL_TRIES = 30;

// Polar tells us about a payment a moment after the customer returns, so
// wait for the plan to change before saying it worked.
export async function waitForPremium(): Promise<void> {
  planMessage("Payment received. Turning on Premium...");
  for (let i = 0; i < PREMIUM_POLL_TRIES; i++) {
    const latest = await loadProfile();
    if (latest?.plan === "premium") {
      await refreshAccount();
      planMessage("Premium is on. Thank you.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, PREMIUM_POLL_MS));
  }
  planMessage(
    "Your payment went through. Premium can take a minute to turn on. Come back in a moment.",
  );
}
