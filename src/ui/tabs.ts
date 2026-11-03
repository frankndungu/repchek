// The four tabs: Train, History, Challenges, Profile. Train is the start
// screen. The other three are screens that sit on top of it.

import { refreshAccount, resetAccountUi } from "./profile";
import { initHistory, refreshHistory, resetHistory } from "./history";

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
  for (const [name, el] of Object.entries(screens)) {
    el.hidden = name !== tab;
    if (name === tab) el.scrollTop = 0;
  }
  if (tab === "profile") void refreshAccount();
  if (tab === "history") void refreshAccount().then(refreshHistory);
}

// Back to a clean state, for when the user signs out.
export function resetTabs(): void {
  resetAccountUi();
  resetHistory();
  showTab("train");
}

export function initTabs(): void {
  initHistory();
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-tab]");
    if (button) showTab(button.dataset.tab as Tab);
  });
}
