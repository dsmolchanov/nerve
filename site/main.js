const terminalLines = [
  "$ nerve policy apply --strict",
  "Analyzing 142 unread threads...",
  "Auto-drafted 12 replies. Flagged 3 for human review.",
];

function typeTerminal() {
  const target = document.getElementById("terminal-body");
  if (!target) return;

  let index = 0;
  const tick = () => {
    if (index >= terminalLines.length) return;
    const prefix = index === 0 ? "" : "\n";
    target.textContent += prefix + terminalLines[index];
    index += 1;
    window.setTimeout(tick, 900);
  };

  window.setTimeout(tick, 320);
}

function revealSections() {
  const elements = document.querySelectorAll("[data-reveal]");
  elements.forEach((el, idx) => {
    window.setTimeout(() => el.classList.add("is-visible"), 120 + idx * 80);
  });
}

window.addEventListener("load", () => {
  typeTerminal();
  revealSections();
});
