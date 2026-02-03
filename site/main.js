const lines = [
  "$ neuralmail policy apply --strict",
  "Analyzing 142 unread threads...",
  "Auto-drafted 12 replies. Flagged 3 for human review.",
];

const target = document.getElementById("terminal-body");
let index = 0;

function typeLine() {
  if (!target) return;
  if (index >= lines.length) return;
  target.textContent += (index === 0 ? "" : "\n") + lines[index];
  index += 1;
  setTimeout(typeLine, 800);
}

window.addEventListener("load", () => {
  setTimeout(typeLine, 400);
});
