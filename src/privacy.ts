// Keeps credentials that arrive in the address out of the address bar and
// out of analytics.

// Polar adds the first to the address when a customer returns from paying.
// It opens their customer portal, so it should not be kept or sent anywhere.
const SENSITIVE_PARAMS = ["customer_session_token"];

// The same address with those parameters removed. Anything else stays.
export function stripSensitiveParams(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return address;
  }
  for (const name of SENSITIVE_PARAMS) url.searchParams.delete(name);
  return url.toString();
}

// Removes them from the address bar now, without adding a history entry.
export function cleanAddressBar(): void {
  const before = window.location.href;
  const after = stripSensitiveParams(before);
  if (after !== before) window.history.replaceState(null, "", after);
}
