import type { SessionRecord } from "../engine/session";
import type { SessionStats, Note } from "./summary";
import { shortName } from "./summary";

const W = 1080;
const H = 1350;
const BG = "#ffffff";
const INK = "#0f0f0f";
const SAND = "#f2efe9";
const LINE = "#e6e2da";
const MUTED = "#5f5f5a";
const FOREST = "#17352b";
const BAD = "#e5484d";
export const SITE = "repchek.fit";
const BRAND = "repchek";
const MARGIN = 88;

// The two shapes of the logo, from public/repchek-logo.svg (viewBox 0 8 108 94).
const LOGO_LEAF = "M6 44C10 36 22 34 29 42L42 58C36 68 25 69 18 62Z";
const LOGO_CHECK =
  "M38 86C45 77 54 71 62 62C73 48 84 33 96 20C98 43 88 65 72 79C62 87 50 91 42 90C37 89 35 88 38 86Z";
const LOGO_W = 108;
const LOGO_H = 94;

const SANS = '"Inter", system-ui, sans-serif';

const TONE_COLOR: Record<Note["tone"], string> = {
  bad: BAD,
  muted: MUTED,
  good: FOREST,
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Tight headline spacing, where the browser can do it.
function spacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight: number,
): number {
  let size = startSize;
  const apply = () => {
    ctx.font = `${weight} ${size}px ${SANS}`;
    spacing(ctx, -0.03 * size);
  };
  apply();
  while (ctx.measureText(text).width > maxWidth && size > 60) {
    size -= 8;
    apply();
  }
  return size;
}

export function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && ctx.measureText(`${cut}...`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}...`;
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  scale: number,
): void {
  ctx.save();
  // The viewBox starts at y = 8 and is 94 tall.
  ctx.translate(x, centerY - (8 + LOGO_H / 2) * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = FOREST;
  ctx.save();
  ctx.translate(4, 5);
  ctx.fill(new Path2D(LOGO_LEAF));
  ctx.restore();
  ctx.fill(new Path2D(LOGO_CHECK));
  ctx.restore();
}

export async function drawShareCard(
  record: SessionRecord,
  stats: SessionStats,
): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load(`800 150px "Inter"`),
    document.fonts.load(`600 26px "Inter"`),
    document.fonts.load(`400 26px "Inter"`),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const logoScale = 0.55;
  drawLogo(ctx, MARGIN, 116, logoScale);
  ctx.fillStyle = INK;
  ctx.font = `800 52px ${SANS}`;
  spacing(ctx, -0.045 * 52);
  ctx.textBaseline = "middle";
  ctx.fillText(BRAND, MARGIN + LOGO_W * logoScale + 18, 118);
  spacing(ctx, 0);

  const date = new Date(record.startedAt).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  ctx.fillStyle = MUTED;
  ctx.font = `400 26px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText(date, W - MARGIN, 116);
  ctx.textAlign = "left";

  const name = shortName(record.exerciseName);
  const nameSize = fitFontSize(ctx, name, W - MARGIN * 2, 150, 800);
  const nameBaseline = 200 + nameSize * 0.85;
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, MARGIN, nameBaseline);
  spacing(ctx, 0);
  ctx.fillStyle = MUTED;
  ctx.font = `400 34px ${SANS}`;
  ctx.fillText(
    record.weightKg
      ? `${record.weightKg} kg`
      : `${record.target.sets} x ${record.target.reps} target`,
    MARGIN,
    nameBaseline + 56,
  );

  const statsTop = 480;
  const boxW = (W - MARGIN * 2 - 48) / 3;
  const statBoxes: Array<{ value: string; label: string; color: string }> = [
    { value: String(stats.totalReps), label: "REPS", color: INK },
    { value: String(stats.sets.length), label: "SETS", color: INK },
    { value: `${stats.cleanPct}%`, label: "CLEAN FORM", color: FOREST },
  ];
  statBoxes.forEach((box, i) => {
    const x = MARGIN + i * (boxW + 24);
    ctx.fillStyle = SAND;
    roundedRect(ctx, x, statsTop, boxW, 200, 28);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = box.color;
    ctx.font = `800 96px ${SANS}`;
    spacing(ctx, -0.03 * 96);
    ctx.fillText(box.value, x + 32, statsTop + 118);
    spacing(ctx, 0);
    ctx.fillStyle = MUTED;
    ctx.font = `600 22px ${SANS}`;
    spacing(ctx, 0.12 * 22);
    ctx.fillText(box.label, x + 32, statsTop + 168);
    spacing(ctx, 0);
  });

  let y = 740;
  ctx.font = `600 26px ${SANS}`;
  for (const s of stats.sets.slice(0, 6)) {
    ctx.fillStyle = MUTED;
    ctx.textBaseline = "middle";
    ctx.fillText(`Set ${s.set}`, MARGIN, y + 14);
    const barX = MARGIN + 132;
    const barW = W - MARGIN - 130 - barX;
    ctx.fillStyle = SAND;
    roundedRect(ctx, barX, y, barW, 28, 14);
    ctx.fill();
    if (s.reps > 0) {
      ctx.save();
      roundedRect(ctx, barX, y, barW, 28, 14);
      ctx.clip();
      const cleanW = (s.clean / s.reps) * barW;
      ctx.fillStyle = FOREST;
      ctx.fillRect(barX, y, cleanW, 28);
      ctx.fillStyle = BAD;
      ctx.fillRect(barX + cleanW, y, barW - cleanW, 28);
      ctx.restore();
    }
    ctx.fillStyle = INK;
    ctx.textAlign = "right";
    ctx.fillText(String(s.reps), W - MARGIN, y + 14);
    ctx.textAlign = "left";
    y += 54;
  }

  const notesTop = Math.max(y + 40, 1040);
  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${SANS}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`What ${BRAND} noticed`, MARGIN, notesTop);

  ctx.font = `400 28px ${SANS}`;
  const notes = stats.notes.slice(0, 3);
  notes.forEach((note, i) => {
    const lineY = notesTop + 50 + i * 46;
    ctx.fillStyle = TONE_COLOR[note.tone];
    ctx.beginPath();
    ctx.arc(MARGIN + 8, lineY - 9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(
      truncate(ctx, note.text, W - MARGIN * 2 - 36),
      MARGIN + 32,
      lineY,
    );
  });

  ctx.fillStyle = MUTED;
  ctx.font = `600 24px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText(SITE, W - MARGIN, H - 64);
  ctx.textAlign = "left";

  return canvas;
}

export function summaryText(
  record: SessionRecord,
  stats: SessionStats,
): string {
  const name = shortName(record.exerciseName);
  const weight = record.weightKg ? `, ${record.weightKg} kg` : "";
  const notes = stats.notes.map((n) => n.text).join(". ");
  return `${name}${weight}: ${stats.totalReps} reps, ${stats.sets.length} sets, ${stats.cleanPct}% clean form. ${notes}. ${SITE}`;
}

export async function shareSession(
  record: SessionRecord,
  stats: SessionStats,
): Promise<void> {
  const canvas = await drawShareCard(record, stats);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not render share card");

  const stamp = record.startedAt.slice(0, 10);
  const file = new File([blob], `repchek-${record.exerciseId}-${stamp}.png`, {
    type: "image/png",
  });
  const text = summaryText(record, stats);

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Repchek session", text });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
