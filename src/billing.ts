// Calls the billing function, which talks to Polar. No Polar keys are in
// the app: the function holds them.

import { getClient } from "./auth";

// The Upgrade button is shown only when this is "on" at build time, so
// Premium can be tested before it is offered to everyone.
export const checkoutEnabled =
  (import.meta.env.VITE_PREMIUM_CHECKOUT as string | undefined) === "on";

export type BillingResult =
  | { ok: true; url: string }
  | { ok: false; reason: "already_premium" | "failed" };

async function call(action: "checkout" | "portal"): Promise<BillingResult> {
  const client = getClient();
  if (!client) return { ok: false, reason: "failed" };
  try {
    const { data, error } = await client.functions.invoke("billing", {
      body: { action, returnTo: window.location.origin },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      return { ok: false, reason: status === 409 ? "already_premium" : "failed" };
    }
    const url = (data as { url?: unknown } | null)?.url;
    return typeof url === "string"
      ? { ok: true, url }
      : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export const startCheckout = () => call("checkout");
export const openPortal = () => call("portal");
