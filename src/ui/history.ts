// The History tab: the last 7 days for a free account, every session for
// premium. Older sessions on a free account are kept and shown as locked.

import { loadHistory } from "../account";
import { dayLabel, freeCutoff, rowText, viewFor } from "../history";
import type { HistoryItem } from "../history";
import { currentPlan } from "./profile";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const planTag = q<HTMLElement>("#history-plan");
const windowLabel = q<HTMLElement>("#history-window");
const errorBox = q<HTMLElement>("#history-error");
const emptyNote = q<HTMLElement>("#history-empty");
const list = q<HTMLElement>("#history-list");
const locked = q<HTMLElement>("#history-locked");
const lockedTitle = q<HTMLElement>("#history-locked-title");
const sheet = q<HTMLElement>("#upgrade-sheet");

function row(item: HistoryItem, first: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = `flex items-start justify-between gap-3 py-3 text-[13px]${first ? "" : " border-t border-line"}`;
  const day = document.createElement("b");
  day.className = "shrink-0";
  day.textContent = dayLabel(item.startedAt);
  const text = document.createElement("span");
  text.className = "text-right text-muted";
  text.textContent = rowText(item);
  el.append(day, text);
  return el;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = message === "";
}

// Reads the saved sessions and redraws the list.
export async function refreshHistory(): Promise<void> {
  const plan = currentPlan();
  planTag.textContent = plan === "premium" ? "Premium" : "Free";
  windowLabel.textContent = plan === "premium" ? "All sessions" : "Last 7 days";

  const result = await loadHistory(plan === "free" ? freeCutoff() : undefined);
  if (result === null) {
    showError("Could not load your history. Check your connection.");
    return;
  }
  showError("");

  const view = viewFor(plan, result.items);
  const lockedCount = view.locked + result.older;

  list.replaceChildren(...view.visible.map((item, i) => row(item, i === 0)));
  list.hidden = view.visible.length === 0;
  emptyNote.hidden = view.visible.length > 0;
  emptyNote.textContent =
    lockedCount > 0
      ? "No sessions in the last 7 days."
      : "No sessions yet. Start one from Train and it will show here.";

  locked.hidden = lockedCount === 0;
  lockedTitle.textContent =
    lockedCount === 1
      ? "Your older session is saved"
      : `Your ${lockedCount} older sessions are saved`;
}

export function resetHistory(): void {
  list.replaceChildren();
  list.hidden = true;
  locked.hidden = true;
  emptyNote.hidden = true;
  showError("");
  sheet.hidden = true;
}

export function initHistory(): void {
  q<HTMLButtonElement>("#history-upgrade").addEventListener("click", () => {
    sheet.hidden = false;
  });
  q<HTMLButtonElement>("#upgrade-close").addEventListener("click", () => {
    sheet.hidden = true;
  });
}
