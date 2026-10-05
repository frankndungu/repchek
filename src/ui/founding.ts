import { track } from "@vercel/analytics";
import {
  CHECKOUT_URL,
  PERKS,
  PRICE_USD,
  SPOTS_TOTAL,
  TESTIMONIAL,
  memberNumber,
  spotsLeft,
} from "../founding";

// Where the founding sheet was opened from, for analytics.
type FoundingSource = "start" | "summary" | "hash";

// A link to repchek.fit/#founding opens the sheet straight away.
const FOUNDING_HASH = "#founding";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const sheet = q<HTMLElement>("#founding-screen");
const backBtn = q<HTMLButtonElement>("#founding-back");
const offerCard = q<HTMLElement>("#founding-offer");
const soldOut = q<HTMLElement>("#founding-sold-out");
const checkoutLink = q<HTMLAnchorElement>("#founding-checkout");
const startRow = q<HTMLButtonElement>("#founding-row");
const summaryCard = q<HTMLElement>("#summary-founding");
const summaryBtn = q<HTMLButtonElement>("#summary-founding-btn");
const welcome = q<HTMLElement>("#welcome-screen");
const welcomeStartBtn = q<HTMLButtonElement>("#welcome-start");
const startScreen = q<HTMLElement>("#start-screen");

// The numbers in the copy come from founding.ts, so index.html only marks
// where they go: <span data-founding="price">, "total", "left", "member".
function fill(name: string, value: number): void {
  for (const el of document.querySelectorAll<HTMLElement>(
    `[data-founding="${name}"]`,
  )) {
    el.textContent = String(value);
  }
}

// One line per perk with a lime dot, like the notes on the summary.
function renderPerks(list: HTMLElement): void {
  list.replaceChildren(
    ...PERKS.map((perk) => {
      const dot = document.createElement("span");
      dot.className = "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime";
      const item = document.createElement("li");
      item.className = "flex items-start gap-2.5 text-sm leading-snug";
      item.append(dot, perk);
      return item;
    }),
  );
}

// The quote, then who said it. The card starts hidden in index.html and
// stays hidden when there is no quote.
function renderTestimonial(card: HTMLElement): void {
  const { quote, name, context } = TESTIMONIAL;
  if (!quote) return;
  const text = document.createElement("blockquote");
  text.className = "text-[15px] leading-snug";
  text.textContent = `“${quote}”`;
  const who = document.createElement("span");
  who.className = "text-[13px] font-semibold";
  who.textContent = name;
  const about = document.createElement("span");
  about.className = "text-[12px] leading-snug text-muted";
  about.textContent = context;
  const caption = document.createElement("figcaption");
  caption.className = "flex flex-col gap-0.5";
  caption.append(who, about);
  card.replaceChildren(text, caption);
  card.hidden = false;
}

fill("price", PRICE_USD);
fill("total", SPOTS_TOTAL);
fill("left", spotsLeft());
fill("member", memberNumber());
document
  .querySelectorAll<HTMLElement>("[data-founding-perks]")
  .forEach(renderPerks);
document
  .querySelectorAll<HTMLElement>("[data-testimonial]")
  .forEach(renderTestimonial);
checkoutLink.href = CHECKOUT_URL;

// Once the spots are gone, the sheet says so and the start screen row goes.
const spotsOpen = spotsLeft() > 0;
offerCard.hidden = !spotsOpen;
soldOut.hidden = spotsOpen;
startRow.hidden = !spotsOpen;

function openFounding(source: FoundingSource): void {
  if (!sheet.hidden) return;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  track("founding_open", { source });
}

function closeFounding(): void {
  sheet.hidden = true;
  // So a reload, or sharing the address bar, does not open it again.
  if (location.hash === FOUNDING_HASH) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

startRow.addEventListener("click", () => openFounding("start"));
summaryBtn.addEventListener("click", () => openFounding("summary"));
backBtn.addEventListener("click", closeFounding);
// The link itself opens Polar in a new tab.
checkoutLink.addEventListener("click", () => track("founding_checkout"));

window.addEventListener("hashchange", () => {
  if (location.hash === FOUNDING_HASH) openFounding("hash");
});

welcomeStartBtn.addEventListener("click", () => {
  welcome.hidden = true;
  startScreen.hidden = false;
  startScreen.scrollTop = 0;
});

// Call after inject(), or the event is dropped. True if the sheet opened.
export function openFoundingFromHash(): boolean {
  if (location.hash !== FOUNDING_HASH) return false;
  openFounding("hash");
  return true;
}

// Polar sends a paying customer back to repchek.fit/?paid=1. Call after
// inject(), or the event is dropped. True if the welcome screen showed.
export function showWelcomeIfPaid(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.get("paid") !== "1") return false;
  // Without the query, a reload is a normal visit and not a second payment.
  history.replaceState(null, "", location.pathname + location.hash);
  welcome.hidden = false;
  track("founding_paid");
  return true;
}

// The offer on the summary, right after Repchek has coached a set. Not
// after a session where nothing was counted.
export function showSummaryOffer(totalReps: number): void {
  summaryCard.hidden = totalReps < 1 || spotsLeft() === 0;
}
