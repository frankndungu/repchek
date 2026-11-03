// Receives Polar's webhooks and keeps profiles.plan in step with the
// subscription. Polar signs every delivery, so nothing is trusted until the
// signature checks out. This function runs with the project's server key,
// which Supabase provides to it. That key is never in the app.
//
// Secrets (Supabase, Edge Functions, Secrets):
//   POLAR_WEBHOOK_SECRET  the secret shown on the Polar webhook endpoint
//   POLAR_PRODUCT_ID      the Premium product, so no other product grants it

import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import {
  isUuid,
  shouldApply,
  toProfileUpdate,
} from "../_shared/plan.ts";
import type { PolarSubscription } from "../_shared/plan.ts";

interface PolarEvent {
  type: string;
  data: PolarSubscription;
}

// Secrets made from 8 September 2026 are Standard Webhooks and are passed
// as they are. Older ones sign with the UTF-8 bytes of the secret, so they
// are base64 encoded first. Try both.
function verify(body: string, headers: Record<string, string>, secret: string) {
  try {
    return new Webhook(secret).verify(body, headers) as PolarEvent;
  } catch {
    return new Webhook(btoa(secret)).verify(body, headers) as PolarEvent;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("", { status: 405 });

  const secret = Deno.env.get("POLAR_WEBHOOK_SECRET");
  const productId = Deno.env.get("POLAR_PRODUCT_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !productId || !url || !serviceKey) {
    console.error("polar-webhook is not configured");
    return new Response("", { status: 500 });
  }

  const body = await req.text();
  const headers = {
    "webhook-id": req.headers.get("webhook-id") ?? "",
    "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": req.headers.get("webhook-signature") ?? "",
  };

  let event: PolarEvent;
  try {
    event = verify(body, headers, secret);
  } catch {
    return new Response("", { status: 403 });
  }

  // Only subscription events matter. Acknowledge the rest so Polar does not
  // retry them.
  if (!event.type?.startsWith("subscription.")) {
    return new Response("", { status: 202 });
  }

  const sub = event.data;
  const userId = sub?.customer?.external_id;
  if (sub?.product_id !== productId || !isUuid(userId)) {
    return new Response("", { status: 202 });
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: stored, error: readError } = await db
    .from("profiles")
    .select("plan, polar_subscription_id, subscription_modified_at")
    .eq("id", userId)
    .maybeSingle();
  if (readError) {
    console.error("polar-webhook read failed", readError.message);
    return new Response("", { status: 500 });
  }
  if (!stored) return new Response("", { status: 202 });

  const update = toProfileUpdate(sub);
  if (!shouldApply(update, stored)) return new Response("", { status: 202 });

  const { error } = await db.from("profiles").update(update).eq("id", userId);
  if (error) {
    console.error("polar-webhook update failed", error.message);
    // A non 2xx makes Polar retry, which is what we want here.
    return new Response("", { status: 500 });
  }
  return new Response("", { status: 202 });
});
