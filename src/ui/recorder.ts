import { SITE, truncate } from "./share";

// What a finished set clip looks like once recording stops.
export interface SetClip {
  setNumber: number;
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

// The HUD numbers burned into each frame of the clip.
export interface FrameInfo {
  exercise: string;
  set: number;
  totalSets: number;
  reps: number;
  feedback: string;
}

// 1280 px on the long side is plenty for a phone screen and keeps the
// encoder from choking on a 4K camera.
const MAX_LONG_SIDE = 1280;
const FRAME_RATE = 30;
const BITS_PER_SECOND = 2_500_000;
// MediaRecorder hands us a chunk of video every second instead of one huge
// blob at the end, so a crash mid-set loses at most a second.
const TIMESLICE_MS = 1000;
// Safety cap: a set that never ends (phone left running) stops here.
const MAX_CLIP_MS = 3 * 60 * 1000;
// The last frame is drawn and the clip stopped in the same moment. In
// testing, that frame never made it into the file unless more frames
// followed it, so the clip keeps repeating it for a short tail before the
// real stop. The clip then ends holding the final rep count.
const STOP_TAIL_MS = 500;

// Best first. MP4 plays and shares everywhere, including iPhone. Browsers
// that cannot make MP4 (older Chrome, Firefox) fall back to WebM.
const MIME_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const FONT = '"IBM Plex Sans", system-ui, sans-serif';
const STRIP_COLOR = "rgba(0, 0, 0, 0.6)";
const TEXT_COLOR = "#fff";
const WATERMARK_COLOR = "rgba(255, 255, 255, 0.7)";

function pickMimeType(): string | undefined {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

// Records one clip per set by painting camera + skeleton + HUD onto its own
// canvas and recording that canvas. The canvas the user sees is left alone.
export class SetRecorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private track: CanvasCaptureMediaStreamTrack | null = null;
  private capTimer = 0;
  // Resolves with the clip once the current recording has fully stopped.
  // Non-null from start() until stop() hands it over.
  private pending: Promise<SetClip | null> | null = null;

  // Some older browsers have no way to record a canvas. The app still
  // works there, it just never offers the Record sets option.
  static isSupported(): boolean {
    return (
      typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function"
    );
  }

  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    // Kept on the page but 1 px and fully transparent, so it is never seen
    // and takes no space. Attached rather than floating free as a
    // precaution: a detached canvas is the less tested path for
    // captureStream on mobile Safari.
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.append(this.canvas);
  }

  // True while frames are going into a clip. False between sets and after
  // the safety cap has kicked in.
  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  // Paint one frame of the clip. Call it once per processed camera frame,
  // after the overlay canvas has been drawn for that frame.
  drawFrame(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    info: FrameInfo,
    mirrored: boolean,
  ): void {
    if (!this.fitTo(video)) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // 1 and 2: camera, then skeleton on top. On screen both are flipped
    // with CSS for the front camera, so flip them the same way here or the
    // clip would look like a mirror image of what the user saw.
    ctx.save();
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    // A 0 x 0 canvas makes drawImage throw, so skip the overlay until it
    // has been sized to the video.
    if (overlay.width > 0 && overlay.height > 0) {
      ctx.drawImage(overlay, 0, 0, width, height);
    }
    ctx.restore();

    // 3 and 4: text goes on after restore(), so it is never mirrored.
    const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.042));
    const pad = Math.round(fontSize * 0.6);
    this.drawInfoStrip(info, fontSize, pad);
    this.drawWatermark(fontSize, pad);
  }

  // Begin a new clip. Does nothing if a clip is already running, so when
  // the person steps out of frame and the gate re-arms mid-set, the same
  // clip simply carries on.
  start(setNumber: number): void {
    if (this.pending) return;

    try {
      // captureStream turns the canvas into a live video track: every time
      // we paint it, a new frame goes into the stream (at most 30 a second).
      const stream = this.canvas.captureStream(FRAME_RATE);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: BITS_PER_SECOND,
      });
      const chunks: Blob[] = [];
      const startedAt = performance.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });

      // The "stop" event fires after the last chunk has arrived, so this is
      // where the chunks are glued into one video file.
      this.pending = new Promise((resolve) => {
        recorder.addEventListener("stop", () => {
          stream.getTracks().forEach((track) => track.stop());
          if (chunks.length === 0) {
            resolve(null);
            return;
          }
          // recorder.mimeType is what the browser actually used, which can
          // differ from what we asked for.
          const type = recorder.mimeType || mimeType || "video/webm";
          resolve({
            setNumber,
            blob: new Blob(chunks, { type }),
            mimeType: type,
            durationMs: performance.now() - startedAt,
          });
        });
      });

      recorder.start(TIMESLICE_MS);
      this.recorder = recorder;
      this.track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      this.capTimer = window.setTimeout(() => this.halt(), MAX_CLIP_MS);
    } catch (err) {
      // Recording is a bonus. If the browser refuses, the workout carries
      // on without a clip.
      console.warn("Could not start recording", err);
      this.pending = null;
      this.recorder = null;
      this.track = null;
    }
  }

  // Finish the current clip. Resolves with the clip, or null if nothing was
  // recorded. If the safety cap already stopped it, this hands over that
  // capped clip.
  stop(): Promise<SetClip | null> {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return Promise.resolve(null);
    this.halt(STOP_TAIL_MS);
    return pending;
  }

  // Stop anything still running and take the canvas off the page.
  dispose(): void {
    this.halt();
    this.pending = null;
    this.canvas.remove();
  }

  // Stop the MediaRecorder, either now or after a tail that repeats the
  // last frame. The clip itself is delivered through `pending`.
  private halt(tailMs = 0): void {
    clearTimeout(this.capTimer);
    const recorder = this.recorder;
    const track = this.track;
    this.recorder = null;
    this.track = null;
    if (!recorder || recorder.state === "inactive") return;
    if (tailMs <= 0) {
      recorder.stop();
      return;
    }
    // requestFrame() pushes the canvas as it is right now into the video,
    // even though nothing new was drawn.
    const repeat = window.setInterval(
      () => track?.requestFrame?.(),
      1000 / FRAME_RATE,
    );
    window.setTimeout(() => {
      clearInterval(repeat);
      recorder.stop();
    }, tailMs);
  }

  // Match the camera's shape, capped at MAX_LONG_SIDE. Sizes are rounded to
  // even numbers because H.264 encoders reject odd widths and heights.
  private fitTo(video: HTMLVideoElement): boolean {
    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return false;
    const longSide = Math.max(videoWidth, videoHeight);
    const scale = Math.min(1, MAX_LONG_SIDE / longSide);
    const width = Math.round((videoWidth * scale) / 2) * 2;
    const height = Math.round((videoHeight * scale) / 2) * 2;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return true;
  }

  // Dark band across the top: exercise, set and reps, then the current
  // feedback on a second line when there is any.
  private drawInfoStrip(info: FrameInfo, fontSize: number, pad: number): void {
    const ctx = this.ctx;
    const { width } = this.canvas;
    const lineHeight = Math.round(fontSize * 1.35);
    const progress = `Set ${info.set}/${info.totalSets}   Reps ${info.reps}`;
    const lines = [`${info.exercise}   ${progress}`];
    if (info.feedback) lines.push(info.feedback);

    ctx.fillStyle = STRIP_COLOR;
    ctx.fillRect(0, 0, width, pad * 2 + lineHeight * lines.length);

    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      const y = pad + lineHeight * (i + 0.5);
      ctx.fillText(truncate(ctx, line, width - pad * 2), pad, y);
    });
  }

  // Small site name in the bottom right corner.
  private drawWatermark(fontSize: number, pad: number): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.font = `500 ${Math.round(fontSize * 0.7)}px ${FONT}`;
    ctx.fillStyle = WATERMARK_COLOR;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(SITE, width - pad, height - pad);
  }
}
