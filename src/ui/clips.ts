import type { SetClip } from "./recorder";

const section = document.querySelector<HTMLElement>("#summary-clips-section")!;
const list = document.querySelector<HTMLElement>("#summary-clips")!;

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
}

// Called on Done: drop the rows and the download links so the videos can
// be freed from memory.
export function releaseClips(): void {
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.length = 0;
  list.replaceChildren();
  section.hidden = true;
}
