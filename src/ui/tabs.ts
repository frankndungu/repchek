// The four tabs: Train, History, Challenges, Profile. Train is the start
// screen. The other three are screens that sit on top of it.

import { refreshAccount, resetAccountUi, waitForPremium } from "./profile";
import { initHistory, refreshHistory, resetHistory } from "./history";
import { initProgress, refreshProgress, resetProgress } from "./progress";
import { hideExercises, refreshTrain, resetTrain } from "./train";
import { hideStreak, initStreak, resetStreak } from "./streak";

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
  for (const [name, el] of Object.entries(screens)) {
    el.hidden = name !== tab;
    if (name === tab) el.scrollTop = 0;
  }
  if (tab === "train") void refreshTrain();
  if (tab === "profile") void refreshAccount();
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
  showTab("train");
}

export function initTabs(openReport: (id: string) => Promise<boolean>): void {
  initHistory(openReport);
  initProgress();
  initStreak();
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
