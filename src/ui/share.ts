import type { SessionRecord } from "../engine/session";
import type { SessionStats, Note } from "./summary";
import { shortName } from "./summary";

const W = 1080;
const H = 1350;
const INK = "#070707";
const PANEL = "#111110";
const LINE = "#2a2a28";
const PAPER = "#f5f5f2";
const MUTED = "#a8a8a2";
const LIME = "#c6f135";
const BAD = "#ef4444";
const SITE = "morgan-pt.vercel.app";
const MARGIN = 88;

const TONE_COLOR: Record<Note["tone"], string> = {
  bad: BAD,
  muted: MUTED,
  good: LIME,
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

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  family: string,
): number {
  let size = startSize;
  ctx.font = `${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > 60) {
    size -= 8;
    ctx.font = `${size}px ${family}`;
  }
  return size;
}

function truncate(
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

export async function drawShareCard(
  record: SessionRecord,
  stats: SessionStats,
): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load('220px "Bebas Neue"'),
    document.fonts.load('600 26px "IBM Plex Sans"'),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const display = '"Bebas Neue", "Archivo", system-ui, sans-serif';
  const sans = '"IBM Plex Sans", system-ui, sans-serif';

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = LIME;
  ctx.beginPath();
  ctx.arc(MARGIN + 9, 116, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = `44px ${display}`;
  ctx.textBaseline = "middle";
  ctx.fillText("MORGAN", MARGIN + 34, 116);

  const date = new Date(record.startedAt).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  ctx.fillStyle = MUTED;
  ctx.font = `26px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText(date, W - MARGIN, 116);
  ctx.textAlign = "left";

  const name = shortName(record.exerciseName).toUpperCase();
  const nameSize = fitFontSize(ctx, name, W - MARGIN * 2, 200, display);
  const nameBaseline = 190 + nameSize * 0.85;
  ctx.fillStyle = PAPER;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${nameSize}px ${display}`;
  ctx.fillText(name, MARGIN, nameBaseline);
  ctx.fillStyle = MUTED;
  ctx.font = `34px ${sans}`;
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
    { value: String(stats.totalReps), label: "REPS", color: PAPER },
    { value: String(stats.sets.length), label: "SETS", color: PAPER },
    { value: `${stats.cleanPct}%`, label: "CLEAN FORM", color: LIME },
  ];
  statBoxes.forEach((box, i) => {
    const x = MARGIN + i * (boxW + 24);
    ctx.fillStyle = PANEL;
    roundedRect(ctx, x, statsTop, boxW, 200, 28);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = box.color;
    ctx.font = `104px ${display}`;
    ctx.fillText(box.value, x + 32, statsTop + 120);
    ctx.fillStyle = MUTED;
    ctx.font = `24px ${sans}`;
    ctx.fillText(box.label, x + 32, statsTop + 168);
  });

  let y = 740;
  ctx.font = `600 26px ${sans}`;
  for (const s of stats.sets.slice(0, 6)) {
    ctx.fillStyle = MUTED;
    ctx.textBaseline = "middle";
    ctx.fillText(`Set ${s.set}`, MARGIN, y + 14);
    const barX = MARGIN + 132;
    const barW = W - MARGIN - 130 - barX;
    ctx.fillStyle = "#1c1c1a";
    roundedRect(ctx, barX, y, barW, 28, 14);
    ctx.fill();
    if (s.reps > 0) {
      ctx.save();
      roundedRect(ctx, barX, y, barW, 28, 14);
      ctx.clip();
      const cleanW = (s.clean / s.reps) * barW;
      ctx.fillStyle = LIME;
      ctx.fillRect(barX, y, cleanW, 28);
      ctx.fillStyle = BAD;
      ctx.fillRect(barX + cleanW, y, barW - cleanW, 28);
      ctx.restore();
    }
    ctx.fillStyle = PAPER;
    ctx.textAlign = "right";
    ctx.fillText(String(s.reps), W - MARGIN, y + 14);
    ctx.textAlign = "left";
    y += 54;
  }

  const notesTop = Math.max(y + 40, 1040);
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${sans}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("MORGAN NOTICED", MARGIN, notesTop);

  ctx.font = `28px ${sans}`;
  const notes = stats.notes.slice(0, 3);
  notes.forEach((note, i) => {
    const lineY = notesTop + 50 + i * 46;
    ctx.fillStyle = TONE_COLOR[note.tone];
    ctx.beginPath();
    ctx.arc(MARGIN + 8, lineY - 9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.fillText(
      truncate(ctx, note.text, W - MARGIN * 2 - 36),
      MARGIN + 32,
      lineY,
    );
  });

  ctx.fillStyle = MUTED;
  ctx.font = `24px ${sans}`;
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
  const file = new File([blob], `morgan-${record.exerciseId}-${stamp}.png`, {
    type: "image/png",
  });
  const text = summaryText(record, stats);

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Morgan session", text });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
