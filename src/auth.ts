// All Supabase auth code lives here. No UI: screens are in ui/auth.ts.
//
// The keys come from the build: VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY. The anon key is meant to be public. Nothing else
// belongs in this app.

import { createClient } from "@supabase/supabase-js";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type { Session };

// Why a call failed, in words the UI can turn into plain copy. Raw error
// text from Supabase never reaches the screen.
export type AuthFailure =
  | "not_configured"
  | "network"
  | "rate_limit"
  | "invalid_email"
  | "bad_code"
  | "unknown";

export type AuthResult = { ok: true } | { ok: false; failure: AuthFailure };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Names of the variables that are empty. Empty means sign in is off.
export const missingConfig: string[] = [];
if (!SUPABASE_URL) missingConfig.push("VITE_SUPABASE_URL");
if (!ANON_KEY) missingConfig.push("VITE_SUPABASE_ANON_KEY");

export const isConfigured = missingConfig.length === 0;

if (!isConfigured) {
  console.warn(`Sign in is off. Missing: ${missingConfig.join(", ")}`);
}

const client: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL!, ANON_KEY!)
  : null;

function toFailure(error: unknown, step: "send" | "verify"): AuthFailure {
  const e = error as { name?: string; status?: number; code?: string } | null;
  const code = e?.code ?? "";
  if (
    e?.name === "AuthRetryableFetchError" ||
    e instanceof TypeError ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return "network";
  }
  if (e?.status === 429 || code.includes("rate_limit")) return "rate_limit";
  if (code === "email_address_invalid" || code === "validation_failed") {
    return step === "send" ? "invalid_email" : "bad_code";
  }
  // Supabase answers a wrong code and an expired code the same way.
  if (step === "verify") return "bad_code";
  return "unknown";
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!client) return { ok: false, failure: "not_configured" };
  const { error } = await client.auth
    .signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    })
    .catch((e: unknown) => ({ error: e }));
  return error ? { ok: false, failure: toFailure(error, "send") } : { ok: true };
}

// Sends a 6 digit code. A new address gets an account, so this one call
// covers sign in and sign up.
export async function sendCode(email: string): Promise<AuthResult> {
  if (!client) return { ok: false, failure: "not_configured" };
  const { error } = await client.auth
    .signInWithOtp({ email, options: { shouldCreateUser: true } })
    .catch((e: unknown) => ({ error: e }));
  return error ? { ok: false, failure: toFailure(error, "send") } : { ok: true };
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<AuthResult> {
  if (!client) return { ok: false, failure: "not_configured" };
  const { error } = await client.auth
    .verifyOtp({ email, token: code, type: "email" })
    .catch((e: unknown) => ({ error: e }));
  return error
    ? { ok: false, failure: toFailure(error, "verify") }
    : { ok: true };
}

export async function getSession(): Promise<Session | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // Offline: still clear this device.
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

// Calls back on every change: sign in, sign out, token refresh. Returns a
// function that stops listening.
export function onAuthChange(
  callback: (session: Session | null) => void,
): () => void {
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
