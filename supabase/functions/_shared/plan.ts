// How a Polar subscription becomes a plan. Plain TypeScript with no Deno
// APIs, so the app's tests can run it.

export type Plan = "free" | "premium";

// The parts of a Polar subscription we read.
export interface PolarSubscription {
  id: string;
  status: string;
  product_id?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  modified_at?: string | null;
  customer?: { external_id?: string | null } | null;
}

// Paid and in good standing. A failed payment (past_due) keeps access while
// Polar retries the card. A subscription cancelled at the end of its period
// stays "active" until that period ends, then becomes "canceled".
const PREMIUM_STATUSES = ["active", "trialing", "past_due"];

export function planFromStatus(status: string): Plan {
  return PREMIUM_STATUSES.includes(status) ? "premium" : "free";
}

export interface ProfileUpdate {
  plan: Plan;
  premium_until: string | null;
  cancel_at_period_end: boolean;
  polar_subscription_id: string;
  subscription_modified_at: string | null;
}

export function toProfileUpdate(sub: PolarSubscription): ProfileUpdate {
  const plan = planFromStatus(sub.status);
  return {
    plan,
    premium_until: plan === "premium" ? (sub.current_period_end ?? null) : null,
    cancel_at_period_end: plan === "premium" && sub.cancel_at_period_end === true,
    polar_subscription_id: sub.id,
    subscription_modified_at: sub.modified_at ?? null,
  };
}

export interface StoredSubscription {
  plan: Plan;
  polar_subscription_id: string | null;
  subscription_modified_at: string | null;
}

// Polar does not promise events arrive in order. Ignore one that is older
// than what is stored, and ignore a different, ended subscription so it
// cannot take away access that a live one gave.
export function shouldApply(
  incoming: ProfileUpdate,
  stored: StoredSubscription | null,
): boolean {
  if (!stored || !stored.polar_subscription_id) return true;
  if (stored.polar_subscription_id !== incoming.polar_subscription_id) {
    return !(incoming.plan === "free" && stored.plan === "premium");
  }
  if (!incoming.subscription_modified_at || !stored.subscription_modified_at) {
    return true;
  }
  return (
    Date.parse(incoming.subscription_modified_at) >=
    Date.parse(stored.subscription_modified_at)
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
