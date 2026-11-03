// Starts a Polar checkout, or opens the Polar customer portal, for the
// signed in user. Supabase checks the user's token before this runs.
//
// Secrets (Supabase, Edge Functions, Secrets):
//   POLAR_ACCESS_TOKEN  a Polar organization access token
//   POLAR_PRODUCT_ID    the Premium product
//   POLAR_ENV           "sandbox" or "production" (sandbox if missing)
//   APP_URL             https://app.repchek.fit (optional, this is the default)

import { createClient } from "npm:@supabase/supabase-js@2";
import { isIP } from "node:net";

const POLAR_VERSION = "2026-10";
const DEFAULT_APP_URL = "https://app.repchek.fit";
const DEV_ORIGIN = "http://localhost:5173";

function polarBase(): string {
  return Deno.env.get("POLAR_ENV") === "production"
    ? "https://api.polar.sh"
    : "https://sandbox-api.polar.sh";
}

function cors(origin: string | null): Record<string, string> {
  const app = Deno.env.get("APP_URL") ?? DEFAULT_APP_URL;
  const allowed = [app, DEV_ORIGIN];
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : app,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function reply(origin: string | null, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

async function polar(path: string, token: string, body: unknown) {
  const res = await fetch(`${polarBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Polar-Version": POLAR_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // The detail stays in the logs. The app only gets a plain error.
    console.error("polar request failed", path, res.status, await res.text());
    return null;
  }
  return await res.json();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") return reply(origin, 405, { error: "method" });

  const token = Deno.env.get("POLAR_ACCESS_TOKEN");
  const productId = Deno.env.get("POLAR_PRODUCT_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !productId || !url || !anonKey) {
    console.error("billing is not configured");
    return reply(origin, 500, { error: "not_configured" });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  const user = auth.user;
  if (!user) return reply(origin, 401, { error: "signed_out" });

  let input: { action?: string; returnTo?: string } = {};
  try {
    input = await req.json();
  } catch {
    return reply(origin, 400, { error: "bad_request" });
  }

  // Send the customer back only to an address we know.
  const app = Deno.env.get("APP_URL") ?? DEFAULT_APP_URL;
  const returnTo = [app, DEV_ORIGIN].includes(input.returnTo ?? "")
    ? (input.returnTo as string)
    : app;

  if (input.action === "checkout") {
    const { data: profile } = await asUser
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.plan === "premium") {
      return reply(origin, 409, { error: "already_premium" });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
    const checkout = await polar("/v1/checkouts/", token, {
      products: [productId],
      external_customer_id: user.id,
      customer_email: user.email,
      success_url: `${returnTo}/?checkout=success`,
      return_url: returnTo,
      ...(ip && isIP(ip) ? { customer_ip_address: ip } : {}),
    });
    if (!checkout?.url) return reply(origin, 502, { error: "checkout_failed" });
    return reply(origin, 200, { url: checkout.url });
  }

  if (input.action === "portal") {
    const session = await polar("/v1/customer-sessions/", token, {
      external_customer_id: user.id,
      return_url: returnTo,
    });
    if (!session?.customer_portal_url) {
      return reply(origin, 502, { error: "portal_failed" });
    }
    return reply(origin, 200, { url: session.customer_portal_url });
  }

  return reply(origin, 400, { error: "bad_request" });
});
