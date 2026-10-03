import type { SetClip } from "./recorder";
import { formatClock } from "./summary";

const section = document.querySelector<HTMLElement>("#summary-clips-section")!;
const list = document.querySelector<HTMLElement>("#summary-clips")!;
const repsHint = document.querySelector<HTMLElement>("#summary-reps-hint")!;
const player = document.querySelector<HTMLElement>("#clip-player")!;
const playerTitle = document.querySelector<HTMLElement>("#clip-player-title")!;
const playerVideo =
  document.querySelector<HTMLVideoElement>("#clip-player-video")!;
const playerClose = document.querySelector<HTMLElement>("#clip-player-close")!;

// The clip open in the player, revoked when the player closes.
let playerUrl: string | null = null;

// Download links for clips, kept alive until Done. A video can take a
// moment to save, so revoking the link straight after the click (as the
// share card does) risks cutting the download short.
const downloadUrls: string[] = [];

const ATTEMPT_NOTE = "Nothing was counted. Share this clip so we can see why.";

// "Set 2", or "Attempt" for the clip kept when counting never started.
function clipLabel(clip: SetClip): string {
  return clip.kind === "attempt" ? "Attempt" : `Set ${clip.setNumber}`;
}

function clipFileName(exerciseId: string, clip: SetClip): string {
  const ext = clip.mimeType.includes("mp4") ? "mp4" : "webm";
  const which = clip.kind === "attempt" ? "attempt" : `set${clip.setNumber}`;
  return `repchek-${exerciseId}-${which}.${ext}`;
}

// Same pattern as shareSession: the share sheet when the phone can share
// files, otherwise a plain download.
async function shareClip(exerciseId: string, clip: SetClip): Promise<void> {
  // The share sheet wants a bare type, without the ";codecs=..." part.
  const file = new File([clip.blob], clipFileName(exerciseId, clip), {
    type: clip.mimeType.split(";")[0],
  });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `Repchek ${clipLabel(clip).toLowerCase()}`,
    });
    return;
  }

  const url = URL.createObjectURL(clip.blob);
  downloadUrls.push(url);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
}

export function renderClips(clips: SetClip[], exerciseId: string): void {
  list.replaceChildren();
  section.hidden = clips.length === 0;

  const sorted = [...clips].sort((a, b) => a.setNumber - b.setNumber);
  for (const clip of sorted) {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3";

    const label = document.createElement("span");
    label.className = "min-w-11 text-[13px] font-semibold text-muted";
    label.textContent = clipLabel(clip);

    const length = document.createElement("span");
    length.className = "grow text-[13px] font-semibold";
    length.textContent = `${Math.max(1, Math.round(clip.durationMs / 1000))}s`;

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "min-h-11 rounded-full border-2 border-lime px-4 text-[15px] font-semibold text-lime";
    button.textContent = "Share";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await shareClip(exerciseId, clip);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Clip share failed", err);
        }
      } finally {
        button.disabled = false;
      }
    });

    row.append(label, length, button);

    if (clip.kind === "attempt") {
      const item = document.createElement("div");
      item.className = "flex flex-col gap-1";
      const note = document.createElement("p");
      note.className = "text-[12px] leading-snug text-muted";
      note.textContent = ATTEMPT_NOTE;
      item.append(row, note);
      list.append(item);
    } else {
      list.append(row);
    }
  }

  linkReps(clips);
}

// Show a clip full screen, starting at atMs.
function openClip(clip: SetClip, atMs: number): void {
  closeClip();
  playerUrl = URL.createObjectURL(clip.blob);
  playerTitle.textContent = `${clipLabel(clip)} at ${formatClock(atMs)}`;
  // Jump once the video knows its length; a jump before that is ignored.
  playerVideo.addEventListener(
    "loadedmetadata",
    () => {
      playerVideo.currentTime = atMs / 1000;
    },
    { once: true },
  );
  playerVideo.src = playerUrl;
  player.hidden = false;
  // Start playing inside the tap, which phones need before they allow it.
  // If it is refused anyway, the video's own controls are there.
  playerVideo.play().catch(() => undefined);
}

function closeClip(): void {
  player.hidden = true;
  playerVideo.pause();
  playerVideo.removeAttribute("src");
  playerVideo.load();
  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = null;
}

playerClose.addEventListener("click", closeClip);

// The rep by rep lines (summary.ts) start as plain text. Each one whose set
// has a clip becomes tappable and shows Watch, opening that clip at the rep.
function linkReps(clips: SetClip[]): void {
  let linked = 0;
  const lines =
    document.querySelectorAll<HTMLButtonElement>("#summary-reps [data-set]");
  for (const line of lines) {
    const clip = clips.find(
      (c) => c.kind === "set" && c.setNumber === Number(line.dataset.set),
    );
    const atMs = Number(line.dataset.atMs);
    line.disabled = !clip;
    line.onclick = clip ? () => openClip(clip, atMs) : null;
    const watch = line.querySelector<HTMLElement>("[data-watch]");
    if (watch) watch.hidden = !clip;
    if (clip) linked += 1;
  }
  repsHint.hidden = linked === 0;
}

// Called on Done: drop the rows, the player and the download links so the
// videos can be freed from memory.
export function releaseClips(): void {
  closeClip();
  linkReps([]);
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.length = 0;
  list.replaceChildren();
  section.hidden = true;
}
