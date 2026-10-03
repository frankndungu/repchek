// The founding member offer. Every setting is here, so a new price or a
// spot taken is one edit.

// Billed per year.
export const PRICE_USD = 50;
export const SPOTS_TOTAL = 5;
// Updated by hand after each payment.
export const SPOTS_TAKEN = 0;
export const CHECKOUT_URL =
  "https://buy.polar.sh/polar_cl_XEfjRLKblAwoICZOSY7teVubA27mNJAnvvabX2xRBdH";

export const PERKS = [
  "Price locked forever",
  "Your name on the founding members list",
  "Direct line to Francis",
  "Your requests get built first",
  "Early access to new features",
];

// Never below 0, so taking one spot too many still reads as sold out.
export function spotsLeft(): number {
  return Math.max(0, SPOTS_TOTAL - SPOTS_TAKEN);
}

// The number someone gets when they pay now. SPOTS_TAKEN is only updated
// after the payment, so the next spot is theirs.
export function memberNumber(): number {
  return SPOTS_TAKEN + 1;
}
