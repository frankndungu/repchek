const hud = document.querySelector<HTMLElement>("#hud")!;

let lastText = "";

export function showFeedback(messages: string[]): void {
  const text = messages.join("   |   ");
  if (text === lastText) return;
  lastText = text;

  if (text === "") {
    hud.hidden = true;
  } else {
    hud.textContent = text;
    hud.hidden = false;
  }
}
