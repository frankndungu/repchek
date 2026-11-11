// The four tabs: Train, History, Challenges, Profile. Train is the start
// screen. The other three are screens that sit on top of it.

import { refreshAccount, resetAccountUi, waitForPremium } from "./profile";
import { initHistory, refreshHistory, resetHistory } from "./history";
import { initProgress, refreshProgress, resetProgress } from "./progress";
import { hideExercises, refreshTrain, resetTrain } from "./train";
import { hideStreak, initStreak, resetStreak } from "./streak";
import { hideStretch } from "./stretch";
import {
  hideChallengeScreens,
  initChallenges,
  openChallenge,
  pendingChallengeCode,
  refreshChallenges,
  resetChallenges,
  takeReturnCode,
} from "./challenges";

type Tab = "train" | "history" | "challenges" | "profile";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const screens: Record<Exclude<Tab, "train">, HTMLElement> = {
  history: q("#history-screen"),
  challenges: q("#challenges-screen"),
  profile: q("#profile-screen"),
};
const milestones = q<HTMLElement>("#milestones-screen");

export function showTab(tab: Tab): void {
  milestones.hidden = true;
  hideExercises();
  hideStreak();
  hideStretch();
  hideChallengeScreens();
  for (const [name, el] of Object.entries(screens)) {
    el.hidden = name !== tab;
    if (name === tab) el.scrollTop = 0;
  }
  if (tab === "train") void refreshTrain();
  if (tab === "profile") void refreshAccount();
  if (tab === "challenges") void refreshChallenges();
  if (tab === "history") {
    void refreshAccount().then(async () => {
      await refreshHistory();
      await refreshProgress();
    });
  }
}

// Back to a clean state, for when the user signs out.
export function resetTabs(): void {
  resetAccountUi();
  resetHistory();
  resetProgress();
  resetTrain();
  resetStreak();
  resetChallenges();
  showTab("train");
}

export function initTabs(
  openReport: (id: string) => Promise<boolean>,
  startExercise: (id: string) => void,
): void {
  initHistory(openReport);
  initProgress();
  initStreak();
  initChallenges({
    startExercise: (id) => {
      showTab("train");
      startExercise(id);
    },
  });
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-tab]");
    if (button) showTab(button.dataset.tab as Tab);
  });
}

// Back from Polar after paying: the address ends in ?checkout=success. Open
// Profile and wait for Premium to turn on.
export function handleCheckoutReturn(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") !== "success") return;
  params.delete("checkout");
  const rest = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
  );
  showTab("profile");
  void waitForPremium();
}

// Someone opened a /c/<code> link. Once they are signed in, show it.
export function openPendingChallenge(): boolean {
  const code = pendingChallengeCode();
  if (!code) return false;
  showTab("challenges");
  void openChallenge(code);
  return true;
}

// After a workout that was started from a challenge: once it is saved, open
// that challenge again so the new numbers show. Does nothing otherwise.
export async function returnToChallenge(saved: Promise<unknown> | null): Promise<void> {
  const code = takeReturnCode();
  if (!code) return;
  await (saved ?? Promise.resolve()).catch(() => undefined);
  showTab("challenges");
  void openChallenge(code);
}
