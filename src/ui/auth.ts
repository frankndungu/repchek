// The sign in screens. All Supabase calls go through ../auth.

import {
  getSession,
  isConfigured,
  onAuthChange,
  sendCode,
  signInWithGoogle,
  signOut,
  verifyCode,
} from "../auth";
import type { AuthFailure } from "../auth";

const RESEND_WAIT_SECONDS = 30;
const CODE_LENGTH = 6;

// Google refuses to sign in from inside these browsers.
const GOOGLE_BLOCKED_BROWSER =
  /FBAN|FBAV|Instagram|Twitter|TwitterAndroid|Snapchat|Line\/|TikTok|musical_ly|Bytedance|BytedanceWebview/i.test(
    navigator.userAgent,
  );

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const screen = q<HTMLElement>("#auth-screen");
const inner = q<HTMLElement>("#auth-inner");
const signinView = q<HTMLElement>("#auth-signin");
const codeView = q<HTMLFormElement>("#auth-code-view");
const setupNote = q<HTMLElement>("#auth-setup");
const browserNote = q<HTMLElement>("#auth-browser-hint");
const googleBtn = q<HTMLButtonElement>("#auth-google");
const emailForm = q<HTMLFormElement>("#auth-email-form");
const emailInput = q<HTMLInputElement>("#auth-email");
const emailError = q<HTMLElement>("#auth-email-error");
const emailBtn = q<HTMLButtonElement>("#auth-email-btn");
const codeEmail = q<HTMLElement>("#auth-code-email");
const tiles = q<HTMLElement>("#auth-tiles");
const codeInput = q<HTMLInputElement>("#auth-code");
const codeError = q<HTMLElement>("#auth-code-error");
const codeBtn = q<HTMLButtonElement>("#auth-code-btn");
const resendBtn = q<HTMLButtonElement>("#auth-resend");
const changeBtn = q<HTMLButtonElement>("#auth-change");
const signOutBtn = q<HTMLButtonElement>("#signout-btn");

const MESSAGES: Record<AuthFailure, string> = {
  not_configured: "Sign in is not set up yet",
  network: "No connection. Check your network and try again.",
  rate_limit: "Too many tries. Wait a few minutes and try again.",
  invalid_email: "That email does not look right. Check it and try again.",
  bad_code:
    "That code is wrong or has expired. Check it, or tap Resend code for a new one.",
  unknown: "Something went wrong. Try again.",
};

let pendingEmail = "";
let resendTimer: number | undefined;
let busy = false;

// --- Sign in view ---------------------------------------------------------

function showSignIn(): void {
  inner.hidden = false;
  signinView.hidden = false;
  codeView.hidden = true;
  emailError.textContent = "";
  codeError.textContent = "";
  codeInput.value = "";
  renderTiles();
  stopResendTimer();
}

function showCodeView(): void {
  signinView.hidden = true;
  codeView.hidden = false;
  codeEmail.textContent = pendingEmail;
  codeError.textContent = "";
  codeInput.value = "";
  renderTiles();
  codeInput.focus();
}

function setBusy(value: boolean): void {
  busy = value;
  const off = value || !isConfigured;
  googleBtn.disabled = off;
  emailBtn.disabled = off;
  codeBtn.disabled = value;
  if (!value) updateResend();
}

emailForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitEmail();
});

async function submitEmail(): Promise<void> {
  if (busy) return;
  const email = emailInput.value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    emailError.textContent = MESSAGES.invalid_email;
    return;
  }
  emailError.textContent = "";
  setBusy(true);
  const result = await sendCode(email);
  setBusy(false);
  if (!result.ok) {
    emailError.textContent = MESSAGES[result.failure];
    return;
  }
  pendingEmail = email;
  showCodeView();
  startResendTimer();
}

googleBtn.addEventListener("click", () => {
  if (busy) return;
  emailError.textContent = "";
  setBusy(true);
  void signInWithGoogle().then((result) => {
    // On success the browser leaves for Google, so stay disabled.
    if (result.ok) return;
    setBusy(false);
    emailError.textContent = MESSAGES[result.failure];
  });
});

// --- Code view ------------------------------------------------------------

for (let i = 0; i < CODE_LENGTH; i++) {
  const tile = document.createElement("span");
  tile.className =
    "flex h-14 min-w-0 flex-1 items-center justify-center rounded-2xl border border-line bg-white text-[22px] font-bold";
  tiles.append(tile);
}

function renderTiles(): void {
  const digits = codeInput.value;
  const focused = document.activeElement === codeInput;
  Array.from(tiles.children).forEach((tile, i) => {
    tile.textContent = digits[i] ?? "";
    const active = focused && i === Math.min(digits.length, CODE_LENGTH - 1);
    tile.classList.toggle("border-forest", active);
    tile.classList.toggle("border-line", !active);
  });
}

// Keeps digits only, so a paste like "482 913" works.
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
  codeError.textContent = "";
  renderTiles();
  if (codeInput.value.length === CODE_LENGTH) void submitCode();
});
codeInput.addEventListener("focus", renderTiles);
codeInput.addEventListener("blur", renderTiles);

codeView.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitCode();
});

async function submitCode(): Promise<void> {
  if (busy) return;
  const code = codeInput.value;
  if (code.length !== CODE_LENGTH) {
    codeError.textContent = "Enter all 6 digits.";
    return;
  }
  setBusy(true);
  const result = await verifyCode(pendingEmail, code);
  setBusy(false);
  // On success onAuthChange switches screens.
  if (!result.ok) {
    codeError.textContent = MESSAGES[result.failure];
    codeInput.value = "";
    renderTiles();
    codeInput.focus();
  }
}

changeBtn.addEventListener("click", () => {
  showSignIn();
  emailInput.focus();
});

resendBtn.addEventListener("click", () => {
  if (busy || resendBtn.disabled) return;
  codeError.textContent = "";
  setBusy(true);
  void sendCode(pendingEmail).then((result) => {
    setBusy(false);
    if (!result.ok) {
      codeError.textContent = MESSAGES[result.failure];
      return;
    }
    codeInput.value = "";
    renderTiles();
    codeInput.focus();
    startResendTimer();
  });
});

let resendLeft = 0;

function startResendTimer(): void {
  stopResendTimer();
  resendLeft = RESEND_WAIT_SECONDS;
  updateResend();
  resendTimer = window.setInterval(() => {
    resendLeft -= 1;
    if (resendLeft <= 0) stopResendTimer();
    updateResend();
  }, 1000);
}

function stopResendTimer(): void {
  if (resendTimer !== undefined) window.clearInterval(resendTimer);
  resendTimer = undefined;
  resendLeft = 0;
  updateResend();
}

function updateResend(): void {
  resendBtn.disabled = busy || resendLeft > 0;
  resendBtn.textContent =
    resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code";
}

// --- Route guard ----------------------------------------------------------

signOutBtn.addEventListener("click", () => {
  void signOut();
});

// Calls back with true when there is a session, false when there is not,
// first after the stored session is read, then on every change. The
// callback fires again for token refreshes; callers should treat repeated
// true values as no change.
export function initAuth(onSignedIn: (signedIn: boolean) => void): void {
  setupNote.hidden = isConfigured;
  browserNote.hidden = !GOOGLE_BLOCKED_BROWSER;
  googleBtn.disabled = !isConfigured;
  emailBtn.disabled = !isConfigured;
  emailInput.disabled = !isConfigured;

  let current: boolean | null = null;
  const apply = (signedIn: boolean): void => {
    if (signedIn === current) return;
    current = signedIn;
    if (signedIn) {
      screen.hidden = true;
      inner.hidden = true;
      stopResendTimer();
    } else {
      screen.hidden = false;
      showSignIn();
    }
    onSignedIn(signedIn);
  };

  // Listen first so nothing is missed while the stored session loads.
  onAuthChange((session) => apply(session !== null));
  void getSession().then((session) => apply(session !== null));
}
