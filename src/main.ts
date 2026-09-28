import { inject } from "@vercel/analytics";
import { startCamera, explainCameraError, isUserFacing } from "./camera";
import type { CameraOptions } from "./camera";
import { PoseEstimator } from "./engine/pose";
import {
  computeFrameMetrics,
  dominantSide,
  frameConfidence,
  missingParts,
} from "./engine/angles";
import type { BodyPart } from "./engine/angles";
import { Judge } from "./engine/judge";
import { RepCounter } from "./engine/repCounter";
import { ReadinessGate } from "./engine/readiness";
import { SessionTracker } from "./engine/session";
import type {
  SessionEvent,
  SessionRecord,
  SetRecord,
} from "./engine/session";
import type {
  ExerciseProfile,
  FrameMetrics,
  RepPhase,
  RepTrigger,
} from "./engine/types";
import { PROFILES, findProfile } from "./profiles";
import { saveSession } from "./storage/db";
import {
  syncCanvasToVideo,
  drawSkeleton,
  drawSpineGuide,
  drawAngleLabels,
  clearCanvas,
} from "./ui/overlay";
import {
  showFeedback,
  showCounter,
  showNotice,
  showDebug,
  showExercise,
} from "./ui/hud";
import {
  unlockAudio,
  beep,
  whistleGo,
  chimeSetDone,
  bellFinish,
} from "./ui/audio";
import { computeStats, renderSummary, shortName } from "./ui/summary";
import type { SessionStats } from "./ui/summary";
import { shareSession } from "./ui/share";
import { SetRecorder } from "./ui/recorder";
import type { SetClip } from "./ui/recorder";
import { renderClips, releaseClips } from "./ui/clips";

inject();

const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const LOW_CONFIDENCE_COLOR = "#9ca3af";
// White skeleton = "I can see you, but I am not counting yet".
const WAITING_COLOR = "#f5f5f2";
const GUIDE_COLOR = "#22d3ee";
const MIN_FRAME_CONFIDENCE = 0.6;
// Tracking has to stay poor this long before the pill says what is
// missing, so short blips do not flash messages.
const MISSING_HINT_DELAY_MS = 1000;

const MISSING_HINTS: Record<BodyPart, string> = {
  hands: "MOVE BACK, I CAN'T SEE YOUR HANDS",
  arms: "MOVE BACK, I CAN'T SEE YOUR HANDS",
  legs: "MOVE BACK, I CAN'T SEE YOUR LEGS",
  hips: "I CAN'T SEE YOUR BODY, CHECK THE ANGLE",
  shoulders: "I CAN'T SEE YOUR BODY, CHECK THE ANGLE",
  head: "I CAN'T SEE YOUR HEAD",
};

// Metrics that are ratios, not angles, so the debug line needs decimals.
const FRACTIONAL_METRICS = new Set<keyof FrameMetrics>([
  "barOffset",
  "wristRise",
  "shoulderOverWrist",
  "elbowFlare",
  "kneeDrive",
  "shoulderTilt",
  "hipDrop",
]);

const CHIP_BASE = "min-h-11 rounded-full border-2 px-4 py-2.5 text-[15px]";
const CHIP_ON = "border-lime bg-lime text-ink font-semibold";
const CHIP_OFF = "border-line bg-panel text-paper font-medium";

type FacingMode = CameraOptions["facingMode"];

const CAMERA_STORAGE_KEY = "repchek.camera";
const CAMERA_HINTS: Record<FacingMode, string> = {
  environment:
    "Best quality. Use when someone films you or you do not need to see the screen.",
  user: "See the feedback yourself while you train.",
};

const RECORD_STORAGE_KEY = "repchek.record";

const IN_APP_BROWSER =
  /FBAN|FBAV|Instagram|Twitter|TwitterAndroid|Snapchat|Line\//i.test(
    navigator.userAgent,
  );

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const video = q<HTMLVideoElement>("#camera");
const canvas = q<HTMLCanvasElement>("#overlay");
const startScreen = q<HTMLElement>("#start-screen");
const summaryScreen = q<HTMLElement>("#summary-screen");
const startBtn = q<HTMLButtonElement>("#start-btn");
const endBtn = q<HTMLButtonElement>("#end-btn");
const shareBtn = q<HTMLButtonElement>("#share-btn");
const doneBtn = q<HTMLButtonElement>("#done-btn");
const status = q<HTMLElement>("#status");
const chipsEl = q<HTMLElement>("#exercise-chips");
const cameraToggle = q<HTMLElement>("#camera-toggle");
const cameraHintEl = q<HTMLElement>("#camera-hint");
const recordSetting = q<HTMLElement>("#record-setting");
const recordToggle = q<HTMLElement>("#record-toggle");
const exerciseNameEl = q<HTMLElement>("#exercise-name");
const exerciseHintEl = q<HTMLElement>("#exercise-hint");
const browserHint = q<HTMLElement>("#browser-hint");
const setsInput = q<HTMLInputElement>("#sets-input");
const repsInput = q<HTMLInputElement>("#reps-input");
const weightInput = q<HTMLInputElement>("#weight-input");
const weightLabel = q<HTMLElement>("#weight-label");
const hudEl = q<HTMLElement>("#hud");
const counterEl = q<HTMLElement>("#counter");
const exerciseEl = q<HTMLElement>("#exercise");
const debugEl = q<HTMLElement>("#debug");

const ctx = canvas.getContext("2d")!;

let estimator: PoseEstimator | null = null;
let stream: MediaStream | null = null;
let wakeLock: WakeLockSentinel | null = null;
let judge: Judge | null = null;
let repCounter: RepCounter | null = null;
let gate: ReadinessGate | null = null;
// The rep range learned when the gate last armed, for auto-calibrated
// profiles only.
let learnedTrigger: RepTrigger | null = null;
let session: SessionTracker | null = null;
let activeProfile: ExerciseProfile | null = null;
let selectedProfileId = PROFILES[0].id;
let facingMode: FacingMode = loadFacingMode();
let recordSets = readSetting(RECORD_STORAGE_KEY) === "on";
let recorder: SetRecorder | null = null;
let clips: SetClip[] = [];
let sessionStartedAt: Date | null = null;
let finishing = false;
let running = false;
let lastVideoTime = -1;
let lowConfidenceSince: number | null = null;
let trackingHint = "";
let mirrored = false;
let currentRecord: SessionRecord | null = null;
let currentStats: SessionStats | null = null;
const currentRepFaults = new Set<string>();

browserHint.hidden = !IN_APP_BROWSER;

// Short name, plus "(front)" for front view lifts, so it is clear which
// version is running.
function displayName(profile: ExerciseProfile): string {
  const front = profile.cameraView === "front" ? " (front)" : "";
  return profile.name.split(" (")[0] + front;
}

function renderChips(): void {
  chipsEl.replaceChildren();
  for (const profile of PROFILES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = displayName(profile);
    chip.className = `${CHIP_BASE} ${profile.id === selectedProfileId ? CHIP_ON : CHIP_OFF}`;
    chip.addEventListener("click", () => {
      selectedProfileId = profile.id;
      renderChips();
    });
    chipsEl.append(chip);
  }
  const selected = findProfile(selectedProfileId);
  exerciseNameEl.textContent = selected.name;
  exerciseHintEl.textContent =
    selected.setupHint ?? `Prop the phone for a ${selected.cameraView} view`;

  if (selected.bodyweight) {
    weightLabel.textContent = "Extra kg";
    weightInput.placeholder = "BW";
  } else {
    weightLabel.textContent = "Kg";
    weightInput.placeholder = "0";
  }
}

renderChips();

// Storage can throw (private mode, blocked site data), so saved choices are
// a convenience and every setting has a default to fall back on.
function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`Could not read ${key}`, err);
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Could not save ${key}`, err);
  }
}

function loadFacingMode(): FacingMode {
  return readSetting(CAMERA_STORAGE_KEY) === "user" ? "user" : "environment";
}

// Two-option toggles on the start screen, styled like the lift chips.
function renderToggle(group: HTMLElement, selected: string): void {
  for (const option of group.querySelectorAll<HTMLElement>("[data-value]")) {
    const on = option.dataset.value === selected;
    option.className = `${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`;
    option.setAttribute("aria-pressed", String(on));
  }
}

function tappedValue(event: Event): string | undefined {
  return (event.target as Element).closest<HTMLElement>("[data-value]")
    ?.dataset.value;
}

function renderCameraToggle(): void {
  renderToggle(cameraToggle, facingMode);
  cameraHintEl.textContent = CAMERA_HINTS[facingMode];
}

cameraToggle.addEventListener("click", (event) => {
  const value = tappedValue(event);
  if (!value) return;
  facingMode = value === "user" ? "user" : "environment";
  writeSetting(CAMERA_STORAGE_KEY, facingMode);
  renderCameraToggle();
});

renderCameraToggle();

// Browsers that cannot record a canvas never see the option.
recordSetting.hidden = !SetRecorder.isSupported();

recordToggle.addEventListener("click", (event) => {
  const value = tappedValue(event);
  if (!value) return;
  recordSets = value === "on";
  writeSetting(RECORD_STORAGE_KEY, recordSets ? "on" : "off");
  renderToggle(recordToggle, recordSets ? "on" : "off");
});

renderToggle(recordToggle, recordSets ? "on" : "off");

let counterTaps: number[] = [];
counterEl.addEventListener("click", () => {
  const now = Date.now();
  counterTaps = counterTaps.filter((t) => now - t < 800);
  counterTaps.push(now);
  if (counterTaps.length >= 3) {
    debugEl.hidden = !debugEl.hidden;
    counterTaps = [];
  }
});

function phaseLabel(profile: ExerciseProfile, phase: RepPhase): string {
  return profile.phaseLabels?.[phase] ?? phase.toUpperCase();
}

function formatValue(metric: keyof FrameMetrics, value: number): string {
  return value.toFixed(FRACTIONAL_METRICS.has(metric) ? 2 : 0);
}

function formatDebug(
  profile: ExerciseProfile,
  side: string,
  phase: RepPhase,
  metrics: FrameMetrics,
): string {
  const parts = profile.rules.map(
    (rule) => `${rule.metric} ${formatValue(rule.metric, metrics[rule.metric])}`,
  );
  const trigger = `${profile.rep.metric} ${formatValue(profile.rep.metric, metrics[profile.rep.metric])}`;
  const gateInfo = gateDebug(metrics);
  return [side, phase, trigger, ...parts, gateInfo].join(" | ");
}

// Extra debug text about the readiness gate, so we can see from a
// screen recording why it is or is not counting yet.
function gateDebug(metrics: FrameMetrics): string {
  if (!gate) return "";
  if (gate.isArmed) {
    if (!learnedTrigger) return "armed";
    const { metric, start, turn } = learnedTrigger;
    const from = formatValue(metric, start);
    const to = formatValue(metric, turn);
    return `armed | learned ${from} to ${to}`;
  }
  const checks = gate.readyChecks.map(
    (check) => `${check.metric} ${formatValue(check.metric, metrics[check.metric])}`,
  );
  const posture = checks.length > 0 ? checks.join(" ") : "posture: none";
  return `${gate.status} ${Math.round(gate.holdProgress * 100)}% | ${posture}`;
}

// The label in the counter pill ("Set 1/4 | Reps 0 | ...").
function counterLabel(profile: ExerciseProfile, phase: RepPhase): string {
  if (!session || !gate) return "";
  if (trackingHint) return trackingHint;
  if (!gate.isArmed) {
    if (gate.status === "holding") return "HOLD STILL";
    if (session.isResting) return "REST";
    return gate.reason.toUpperCase() || "GET IN POSITION";
  }
  const resting = session.isResting && (phase === "idle" || phase === "ready");
  return resting ? "REST" : phaseLabel(profile, phase);
}

function updateCounterDisplay(profile: ExerciseProfile, phase: RepPhase): void {
  if (!session) return;
  if (session.isFinished) {
    const last = session.records[session.records.length - 1];
    showCounter(
      session.totalSets,
      session.totalSets,
      last?.reps.length ?? 0,
      "DONE",
    );
    return;
  }
  showCounter(
    session.set,
    session.totalSets,
    session.reps,
    counterLabel(profile, phase),
  );
}

async function keepScreenAwake(): Promise<void> {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("Wake lock unavailable", err);
  }
}

function releaseScreen(): void {
  void wakeLock?.release();
  wakeLock = null;
}

function stopCamera(): void {
  running = false;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  releaseScreen();
  clearCanvas(ctx);
  showFeedback([]);
  hudEl.hidden = true;
  counterEl.hidden = true;
  exerciseEl.hidden = true;
  endBtn.hidden = true;
  debugEl.hidden = true;
  status.textContent = "";
}

function buildRecord(): SessionRecord | null {
  if (!session || !activeProfile || !sessionStartedAt) return null;
  const weight = Number(weightInput.value);
  return session.toRecord({
    exerciseId: activeProfile.id,
    exerciseName: activeProfile.name,
    startedAt: sessionStartedAt,
    weightKg: weight > 0 ? weight : null,
  });
}

function showSummary(record: SessionRecord): void {
  currentRecord = record;
  currentStats = computeStats(record);
  renderSummary(record, currentStats);
  renderClips(clips, record.exerciseId);
  summaryScreen.hidden = false;
}

// Add a stopped clip to the list. The video file is ready a moment later,
// and only joins the list if this session's clips have not been freed by
// then.
function collectClip(pending: Promise<SetClip | null>): void {
  if (!activeProfile) return;
  const sessionClips = clips;
  const exerciseId = activeProfile.id;
  void pending.then((clip) => {
    if (!clip || sessionClips !== clips) return;
    clips.push(clip);
    renderClips(clips, exerciseId);
  });
}

// Let go of this session's videos so the memory is freed.
function freeClips(): void {
  releaseClips();
  clips = [];
  recorder?.dispose();
  recorder = null;
}

// Paint this frame into the recording, standby or set, if one is running.
// Call it before handleSessionEvent, which stops the clip when a set closes.
function recordFrame(
  feedback: string,
  sessionEvent: SessionEvent | null = null,
): void {
  if (!recorder?.isRecording || !session || !activeProfile) return;
  const closed = closedSet(sessionEvent);
  // Until the gate arms, show what the pill says (HOLD STILL, MOVE BACK,
  // ...) instead, so a clip shows why counting has not started.
  const message = gate?.isArmed
    ? feedback
    : counterLabel(activeProfile, repCounter?.currentPhase ?? "idle");
  recorder.drawFrame(
    video,
    canvas,
    {
      exercise: shortName(activeProfile.name),
      set: closed?.set ?? session.set,
      totalSets: session.totalSets,
      reps: closed?.reps.length ?? session.reps,
      feedback: message,
    },
    mirrored,
  );
}

// When the last rep closes a set, the session has already reset its
// counters for the next set by the time we draw. Use the closed set's
// numbers instead, or every clip would end one rep short.
function closedSet(sessionEvent: SessionEvent | null): SetRecord | undefined {
  if (sessionEvent?.type === "set-complete") return sessionEvent.record;
  if (sessionEvent?.type === "session-complete") {
    return sessionEvent.sets.at(-1);
  }
  return undefined;
}

// Show the summary straight away, save to the phone in the background.
function finishSession(): void {
  if (finishing) return;
  finishing = true;
  const record = buildRecord();
  // Keeps a running set clip, or the standby recording as an attempt when
  // nothing was ever counted.
  if (recorder) collectClip(recorder.finish());
  stopCamera();
  if (record) {
    showSummary(record);
    saveSession(record).catch((err) =>
      console.error("Could not save session", err),
    );
  } else {
    startScreen.hidden = false;
  }
  finishing = false;
}

// Auto-calibration: with turnRatio set, the rep range comes from the
// person. start is the value they held while the gate armed, and turn is a
// fraction of it. Null for profiles with a fixed range.
function learnTrigger(rep: RepTrigger): RepTrigger | null {
  const held = gate?.heldValue;
  if (rep.turnRatio === undefined || held == null) return null;
  return { metric: rep.metric, start: held, turn: held * rep.turnRatio };
}

// Fresh counter and judge, so nothing from the setup leaks into rep 1.
function armCounting(): void {
  if (!activeProfile) return;
  learnedTrigger = learnTrigger(activeProfile.rep);
  repCounter = new RepCounter(learnedTrigger ?? activeProfile.rep);
  judge = new Judge(activeProfile);
  currentRepFaults.clear();
  showNotice("Ready, go", 1200);
  whistleGo();
  // Swaps the standby recording for this set's clip. A no-op if the clip
  // is already running, which is what happens when the gate re-arms after
  // losing the person mid-set.
  if (session) recorder?.start(session.set);
}

startBtn.addEventListener("click", async () => {
  try {
    unlockAudio();

    activeProfile = findProfile(selectedProfileId);
    judge = new Judge(activeProfile);
    repCounter = new RepCounter(activeProfile.rep);
    gate = new ReadinessGate(activeProfile);
    learnedTrigger = null;
    session = new SessionTracker({
      sets: Number(setsInput.value) || 4,
      reps: Number(repsInput.value) || 12,
    });
    sessionStartedAt = new Date();
    currentRepFaults.clear();
    showExercise(displayName(activeProfile));
    lowConfidenceSince = null;
    trackingHint = "";

    status.textContent = "Requesting camera...";
    // facingMode is only "ideal" inside startCamera, so if the chosen camera
    // is missing (some laptops only have a front one) the browser falls back
    // to whichever camera exists instead of failing.
    stream = await startCamera(video, { facingMode });

    mirrored = isUserFacing(stream);
    video.classList.toggle("mirrored", mirrored);
    canvas.classList.toggle("mirrored", mirrored);

    status.textContent = "Loading pose model, first time takes a moment...";
    estimator = estimator ?? (await PoseEstimator.create());

    await keepScreenAwake();
    startScreen.hidden = true;
    summaryScreen.hidden = true;
    endBtn.hidden = false;
    debugEl.hidden = false;
    recorder =
      recordSets && SetRecorder.isSupported() ? new SetRecorder() : null;
    // Record from the first frame, in case the gate never arms.
    recorder?.startStandby();
    running = true;
    lastVideoTime = -1;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    stopCamera();
    status.textContent =
      err instanceof DOMException
        ? explainCameraError(err)
        : "Failed to load the pose model. Check the console.";
  }
});

endBtn.addEventListener("click", () => {
  finishSession();
});

doneBtn.addEventListener("click", () => {
  freeClips();
  summaryScreen.hidden = true;
  startScreen.hidden = false;
});

shareBtn.addEventListener("click", async () => {
  if (!currentRecord || !currentStats) return;
  shareBtn.disabled = true;
  try {
    await shareSession(currentRecord, currentStats);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      console.error("Share failed", err);
    }
  } finally {
    shareBtn.disabled = false;
  }
});

// Pass the missing parts on a low confidence frame, or null on any other
// frame. The hint only appears once tracking has been poor for
// MISSING_HINT_DELAY_MS in a row, and clears on the first frame that is not.
function updateTrackingHint(missing: BodyPart[] | null, now: number): void {
  if (!missing) {
    lowConfidenceSince = null;
    trackingHint = "";
    return;
  }
  lowConfidenceSince ??= now;
  const waited = now - lowConfidenceSince >= MISSING_HINT_DELAY_MS;
  trackingHint = waited && missing.length > 0 ? MISSING_HINTS[missing[0]] : "";
}

// Every debug line starts with the camera actually in use and its real
// resolution, so front and back camera tracking can be compared. The
// camera comes from the stream, not the toggle, because the browser can
// fall back to a different one. mirrored is set from isUserFacing().
function showFrameDebug(text: string): void {
  const camera = mirrored ? "front cam" : "back cam";
  const resolution = `${video.videoWidth}x${video.videoHeight}`;
  showDebug(`${camera} ${resolution} | ${text}`);
}

// Debug line for a skipped frame: the view (and side for side views),
// the confidence and what could not be seen.
function lowConfidenceDebug(
  profile: ExerciseProfile,
  side: string,
  confidence: number,
  missing: BodyPart[],
): string {
  const view = profile.cameraView === "front" ? ["front"] : ["side", side];
  return [
    ...view,
    `low confidence ${confidence.toFixed(2)}`,
    `missing: ${missing.join(", ") || "none"}`,
    "frame skipped",
  ].join(" | ");
}

// The person cannot be seen properly this frame.
function handleLostFrame(now: number): void {
  if (!gate || !session || !activeProfile || !repCounter) return;
  if (gate.lost(now)) {
    // They were gone long enough, so any half-done rep is thrown away.
    currentRepFaults.clear();
    showNotice("Lost you, get back in position", 2000);
  }
  handleSessionEvent(session.tick(now));
  updateCounterDisplay(activeProfile, repCounter.currentPhase);
}

type SessionEventLike =
  | { type: string; record?: { set: number } }
  | null
  | undefined;

function handleSessionEvent(sessionEvent: SessionEventLike): void {
  if (sessionEvent?.type === "set-complete") {
    showNotice(`Set ${sessionEvent.record?.set ?? ""} done, rest`, 3000);
    chimeSetDone();
    if (recorder) {
      collectClip(recorder.stop());
      // Back to standby until the gate arms for the next set.
      recorder.startStandby();
    }
    // Walking away, resting and setting up again must not count.
    gate?.reset();
    currentRepFaults.clear();
  }
  if (sessionEvent?.type === "session-complete") {
    showNotice("Session complete", 1500);
    bellFinish();
    if (recorder) collectClip(recorder.stop());
    setTimeout(() => finishSession(), 1500);
  }
}

function loop(): void {
  if (
    !running ||
    !estimator ||
    !judge ||
    !repCounter ||
    !gate ||
    !session ||
    !activeProfile
  )
    return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    syncCanvasToVideo(canvas, video);

    const now = performance.now();
    const landmarks = estimator.estimate(video, now);

    if (!landmarks) {
      updateTrackingHint(null, now);
      clearCanvas(ctx);
      showFeedback([]);
      recordFrame("");
      handleLostFrame(now);
      showFrameDebug("no person detected");
    } else {
      const aspect = video.videoWidth / video.videoHeight;
      const side = dominantSide(landmarks);
      const confidence = frameConfidence(
        landmarks,
        side,
        activeProfile.cameraView,
      );

      if (confidence < MIN_FRAME_CONFIDENCE) {
        const missing = missingParts(
          landmarks,
          side,
          activeProfile.cameraView,
        );
        updateTrackingHint(missing, now);
        drawSkeleton(ctx, landmarks, LOW_CONFIDENCE_COLOR);
        showFeedback([]);
        recordFrame("");
        handleLostFrame(now);
        showFrameDebug(
          lowConfidenceDebug(activeProfile, side, confidence, missing),
        );
      } else {
        updateTrackingHint(null, now);
        const metrics = computeFrameMetrics(landmarks, aspect);

        // Step 1: are they in position yet?
        if (!gate.isArmed) {
          const justArmed = gate.update(metrics, now);
          if (justArmed) armCounting();
        }

        if (!gate.isArmed) {
          // Not ready yet: no counting, no judging, no beeps.
          handleSessionEvent(session.tick(now));
          drawSkeleton(ctx, landmarks, WAITING_COLOR);
          if (activeProfile.cameraView === "side") {
            drawSpineGuide(ctx, landmarks, side, GUIDE_COLOR);
          }
          drawAngleLabels(ctx, landmarks, metrics, mirrored);
          showFeedback([]);
          recordFrame("");
          updateCounterDisplay(activeProfile, repCounter.currentPhase);
          showFrameDebug(
            formatDebug(activeProfile, side, repCounter.currentPhase, metrics),
          );
        } else {
          // Step 2: ready, so count and judge as normal.
          gate.update(metrics, now);
          const repEvent = repCounter.update(metrics, now);
          const phase = repCounter.currentPhase;
          const verdict = judge.evaluate(metrics, phase);

          for (const rule of verdict.failures) {
            currentRepFaults.add(rule.id);
          }

          let sessionEvent = null;
          if (repEvent) {
            sessionEvent = session.onRepEvent(
              repEvent,
              Array.from(currentRepFaults),
              now,
            );
            currentRepFaults.clear();
          } else {
            sessionEvent = session.tick(now);
          }

          drawSkeleton(ctx, landmarks, verdict.ok ? GOOD_COLOR : BAD_COLOR);
          if (activeProfile.cameraView === "side") {
            drawSpineGuide(ctx, landmarks, side, GUIDE_COLOR);
          }
          drawAngleLabels(ctx, landmarks, metrics, mirrored);
          const feedback = verdict.failures.map((rule) => rule.message);
          showFeedback(feedback);
          recordFrame(feedback.join("  |  "), sessionEvent);

          if (repEvent?.type === "partial") {
            showNotice("Partial rep, use the full range");
          }
          handleSessionEvent(sessionEvent);

          updateCounterDisplay(activeProfile, phase);
          showFrameDebug(formatDebug(activeProfile, side, phase, metrics));
          if (!verdict.ok) beep();
        }
      }
    }
  }

  requestAnimationFrame(loop);
}
