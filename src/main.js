const { invoke } = window.__TAURI__.core;
// ===== SETTINGS: change these to customise the app =====
const settings = {
  rememberLayout: true,
  widgets: [
    {
      type: "calculator",
      title: "Calculator",
      left: 80,
      top: 60,
      width: 260,
      scale: 1,
      startMinimised: false
    }
  ]
};
// =======================================================

// --- The calculator's memory ---
let current = "0";
let stored = null;
let operator = null;
let fresh = false;
let lastExpression = "";

const display = document.querySelector(".display");
const widget = display.closest(".widget");
const progress = document.querySelector(".progress");
const prettyOp = { "+": "+", "-": "\u2212", "*": "\u00d7", "/": "\u00f7" };

function press(key) {
  if (current === "Error" && key !== "C" && !/^[0-9.]$/.test(key)) return;
  if (key !== "=") lastExpression = "";

  if (/^[0-9]$/.test(key)) {
    if (fresh || current === "0") current = key;
    else current += key;
    fresh = false;

  } else if (key === ".") {
    if (fresh) { current = "0."; fresh = false; }
    else if (!current.includes(".")) current += ".";

  } else if (["+", "-", "*", "/"].includes(key)) {
    if (operator && !fresh) {
      current = calculate(stored, Number(current), operator);
      if (current === "Error") { stored = null; operator = null; fresh = true; show(); return; }
    }
    stored = Number(current);
    operator = key;
    fresh = true;

  } else if (key === "=") {
    if (operator) {
      lastExpression = `${stored} ${prettyOp[operator]} ${current} =`;
      current = calculate(stored, Number(current), operator);
      stored = null;
      operator = null;
      fresh = true;
    }

  } else if (key === "C") {
    current = "0"; stored = null; operator = null; fresh = false;

  } else if (key === "neg") {
    if (current !== "0") current = current.startsWith("-") ? current.slice(1) : "-" + current;

  } else if (key === "%") {
    current = String(Number(current) / 100);

  } else if (key === "backspace") {
    if (!fresh) current = current.slice(0, -1);
    if (current === "" || current === "-") current = "0";
  }

  show();
}

function calculate(a, b, op) {
  let result;
  if (op === "+") result = a + b;
  if (op === "-") result = a - b;
  if (op === "*") result = a * b;
  if (op === "/") result = a / b;
  if (!isFinite(result)) return "Error";
  return String(parseFloat(result.toPrecision(12)));
}

function show() {
  display.textContent = current;
  progress.textContent = operator ? `${stored} ${prettyOp[operator]}` : lastExpression;
}

// --- Feed 1: clicking the buttons ---
const symbols = { "\u00d7": "*", "\u00f7": "/", "\u2212": "-", "\u00b1": "neg" };
document.querySelectorAll(".key").forEach(button => {
  button.addEventListener("click", () => {
    const label = button.textContent.trim();
    press(symbols[label] || label);
  });
});

// Match each key to its on-screen button, so typing can "press" it
const buttonFor = {};
document.querySelectorAll(".key").forEach(button => {
  const label = button.textContent.trim();
  buttonFor[symbols[label] || label] = button;
});

function flash(key) {
  const button = buttonFor[key];
  if (!button) return;
  button.classList.add("pressed");
  setTimeout(() => button.classList.remove("pressed"), 120);
}

// --- Feed 2: typing on the keyboard ---
document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (widget.classList.contains("minimised")) return;

  const k = event.key;
  let key = null;
  if (/^[0-9]$/.test(k) || ["+", "-", "*", "/", ".", "%"].includes(k)) key = k;
  else if (k === "Enter" || k === "=") key = "=";
  else if (k === "Backspace") key = "backspace";
  else if (k === "Escape" || k === "c" || k === "C") key = "C";

  if (key) {
    event.preventDefault();
    flash(key);
    press(key);
  }
});

// ===== Apply settings to the calculator widget =====
const config = settings.widgets[0];
widget.style.left = config.left + "px";
widget.style.top = config.top + "px";
widget.style.width = config.width + "px";
widget.querySelector("h3").textContent = config.title;
if (config.startMinimised) widget.classList.add("minimised");

// ===== Moving, resizing and remembering =====
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const MIN_SCALE = 0.6;
const STORAGE_KEY = "widgetLayout";
const header = widget.querySelector(".widget-header");
const handle = widget.querySelector(".resize-handle");
let scale = config.scale || 1;
let topLayer = 1;

function saveLayout() {
  if (!settings.rememberLayout) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      left: parseFloat(widget.style.left),
      top: parseFloat(widget.style.top),
      scale: scale,
      minimised: widget.classList.contains("minimised")
    }));
  } catch (err) {}
}

if (settings.rememberLayout) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && [saved.left, saved.top, saved.scale].every(Number.isFinite)) {
      widget.style.left = saved.left + "px";
      widget.style.top = saved.top + "px";
      scale = saved.scale;
      widget.classList.toggle("minimised", !!saved.minimised);
    }
  } catch (err) {}
} else {
  try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
}

function fitToWindow() {
  const maxScale = Math.min(
    window.innerWidth / widget.offsetWidth,
    window.innerHeight / widget.offsetHeight
  );
  scale = Math.min(scale, maxScale);
  widget.style.transform = `scale(${scale})`;
  const left = parseFloat(widget.style.left);
  const top = parseFloat(widget.style.top);
  widget.style.left = clamp(left, 0, Math.max(0, window.innerWidth - widget.offsetWidth * scale)) + "px";
  widget.style.top = clamp(top, 0, Math.max(0, window.innerHeight - widget.offsetHeight * scale)) + "px";
}
fitToWindow();
window.addEventListener("resize", () => { fitToWindow(); saveLayout(); });
widget.addEventListener("transitionend", e => {
  if (e.propertyName === "grid-template-rows") { fitToWindow(); saveLayout(); }
});

widget.addEventListener("pointerdown", () => {
  widget.style.zIndex = ++topLayer;
});

// --- Moving: drag the title bar ---
let dragging = null;
function stopDrag() {
  if (!dragging) return;
  dragging = null;
  widget.classList.remove("dragging");
  saveLayout();
}
header.addEventListener("pointerdown", e => {
  if (e.target.closest("button")) return;
  e.preventDefault();
  const rect = widget.getBoundingClientRect();
  dragging = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  header.setPointerCapture(e.pointerId);
  widget.classList.add("dragging");
});
header.addEventListener("pointermove", e => {
  if (!dragging) return;
  if (e.buttons === 0) { stopDrag(); return; }
  const maxLeft = Math.max(0, window.innerWidth - widget.offsetWidth * scale);
  const maxTop = Math.max(0, window.innerHeight - widget.offsetHeight * scale);
  widget.style.left = clamp(e.clientX - dragging.dx, 0, maxLeft) + "px";
  widget.style.top = clamp(e.clientY - dragging.dy, 0, maxTop) + "px";
});
header.addEventListener("pointerup", stopDrag);
header.addEventListener("pointercancel", stopDrag);
header.addEventListener("lostpointercapture", stopDrag);

// ===== Dragging the problem viewer =====
const problemFrame = document.querySelector(".problem-frame");
const problemHeader = document.querySelector(".problem-frame-header");
let problemDrag = null;

problemHeader.addEventListener("pointerdown", e => {
  if (e.target.closest("button")) return;
  e.preventDefault();
  const rect = problemFrame.getBoundingClientRect();
  problemDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  problemHeader.setPointerCapture(e.pointerId);
});
problemHeader.addEventListener("pointermove", e => {
  if (!problemDrag) return;
  if (e.buttons === 0) { problemDrag = null; return; }
  const x = clamp(e.clientX - problemDrag.dx, 0, window.innerWidth - problemFrame.offsetWidth);
  const y = clamp(e.clientY - problemDrag.dy, 0, window.innerHeight - problemFrame.offsetHeight);
  problemFrame.style.left = x + "px";
  problemFrame.style.top = y + "px";
  invoke("move_problem_viewer", { x: x + 10, y: y + 36 });
});
problemHeader.addEventListener("pointerup", () => { problemDrag = null; });
problemHeader.addEventListener("pointercancel", () => { problemDrag = null; });
// --- Resizing: drag the bottom-right corner ---
let resizing = null;
function stopResize() {
  if (!resizing) return;
  resizing = null;
  saveLayout();
}
handle.addEventListener("pointerdown", e => {
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  resizing = { x: e.clientX, y: e.clientY, scale: scale };
});
handle.addEventListener("pointermove", e => {
  if (!resizing) return;
  if (e.buttons === 0) { stopResize(); return; }
  const w = widget.offsetWidth;
  const h = widget.offsetHeight;
  const rect = widget.getBoundingClientRect();
  const room = Math.min((window.innerWidth - rect.left) / w, (window.innerHeight - rect.top) / h);
  const dx = e.clientX - resizing.x;
  const dy = e.clientY - resizing.y;
  const wanted = resizing.scale + (dx * w + dy * h) / (w * w + h * h);
  scale = clamp(wanted, Math.min(MIN_SCALE, room), room);
  widget.style.transform = `scale(${scale})`;
});
handle.addEventListener("pointerup", stopResize);
handle.addEventListener("pointercancel", stopResize);
handle.addEventListener("lostpointercapture", stopResize);

// ===== Random problem picker =====
async function fetchRandomCF() {
  const rating = Number(document.getElementById("cfRating").value);
  const res = await fetch("https://codeforces.com/api/problemset.problems");
  const data = await res.json();
  const problems = data.result.problems.filter(p => p.rating === rating);
  if (problems.length === 0) throw new Error(`No Codeforces problems rated ${rating}`);
  const pick = problems[Math.floor(Math.random() * problems.length)];
  return `https://codeforces.com/problemset/problem/${pick.contestId}/${pick.index}`;
}


function wireRandomButton(buttonId, action) {
  const button = document.getElementById(buttonId);
  button.addEventListener("click", async () => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "…";
    try {
      await action();
    } catch (err) {
      console.error(`Couldn't load a random problem (${buttonId}):`, err);
    }
    button.disabled = false;
    button.textContent = original;
  });
}
wireRandomButton("randomCF", async () => {
  const url = await fetchRandomCF();
  await invoke("load_problem_url", { url });
});
wireRandomButton("randomAC", () =>
  invoke("random_atcoder_problem", { letter: document.getElementById("acLetter").value })
);

// ===== Draw on the background =====
const board = document.getElementById("board");
const boardCtx = board.getContext("2d");
const boardWrap = document.getElementById("boardWrap");
const BOARD_KEY = "whiteboardDrawing";
let tool = "select"; // "select" | "draw" | "erase"

const ERASER_KEY = "eraserSize";
const eraserPreview = document.getElementById("eraserPreview");
let eraserSize = 24;
function setEraserSize(size) {
  eraserSize = clamp(size, 8, 80);
  eraserPreview.style.width = eraserSize + "px";
  eraserPreview.style.height = eraserSize + "px";
  if (settings.rememberLayout) {
    try { localStorage.setItem(ERASER_KEY, eraserSize); } catch (err) {}
  }
}
if (settings.rememberLayout) {
  try {
    const savedSize = parseFloat(localStorage.getItem(ERASER_KEY));
    if (Number.isFinite(savedSize)) eraserSize = savedSize;
  } catch (err) {}
}
setEraserSize(eraserSize);

function resizeBoard() {
  const previous = document.createElement("canvas");
  previous.width = board.width;
  previous.height = board.height;
  previous.getContext("2d").drawImage(board, 0, 0);

  board.width = boardWrap.clientWidth;
  board.height = boardWrap.clientHeight;
  if (previous.width && previous.height) {
    boardCtx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, board.width, board.height);
  }
}
resizeBoard();
window.addEventListener("resize", resizeBoard);
boardWrap.addEventListener("transitionend", e => {
  if (e.propertyName === "width") resizeBoard();
});

function saveBoard() {
  if (!settings.rememberLayout) return;
  try { localStorage.setItem(BOARD_KEY, board.toDataURL()); } catch (err) {}
}
function loadBoard() {
  if (!settings.rememberLayout) return;
  try {
    const data = localStorage.getItem(BOARD_KEY);
    if (!data) return;
    const img = new Image();
    img.onload = () => boardCtx.drawImage(img, 0, 0);
    img.src = data;
  } catch (err) {}
}
loadBoard();

const toolbar = document.querySelector(".toolbar");
function setTool(next) {
  tool = next;
  toolbar.querySelectorAll(".tool").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  board.style.cursor = tool === "select" ? "default" : tool === "erase" ? "none" : "crosshair";
  if (tool !== "erase") eraserPreview.style.display = "none";
}
toolbar.querySelectorAll(".tool").forEach(btn => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

function clearBoard() {
  boardCtx.clearRect(0, 0, board.width, board.height);
  saveBoard();
}
document.getElementById("clearBoard").addEventListener("click", clearBoard);

// --- Split view: shrink the board, minimise the calculator ---
let splitMode = false;
let calcWasMinimised = false;
const SPLIT_KEY = "boardSplitMode";
function setSplit(on) {
  splitMode = on;
  if (on) ensureEditor();
  boardWrap.classList.toggle("split", on);
  toolbar.classList.toggle("hidden", on);
  if (settings.rememberLayout) {
    try { localStorage.setItem(SPLIT_KEY, on ? "1" : "0"); } catch (err) {}
  }
  if (on) {
    setTool("select");
    calcWasMinimised = widget.classList.contains("minimised");
    widget.classList.add("minimised");
  } else {
    widget.classList.toggle("minimised", calcWasMinimised);
  }
}
document.getElementById("splitBoard").addEventListener("click", () => setSplit(!splitMode));
document.getElementById("maximizeBoard").addEventListener("click", () => setSplit(false));

document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (splitMode) return;
  const k = e.key.toLowerCase();
  if (k === "d") setTool("draw");
  else if (k === "e") setTool("erase");
  else if (k === "x") clearBoard();
  else if (k === "[") setEraserSize(eraserSize - 4);
  else if (k === "]") setEraserSize(eraserSize + 4);
});

// --- Drawing itself ---
let drawing = false;
let last = null;

board.addEventListener("pointerdown", e => {
  if (tool === "select") return;
  drawing = true;
  last = { x: e.clientX, y: e.clientY };
  board.setPointerCapture(e.pointerId);
});
board.addEventListener("pointermove", e => {
  if (tool === "erase") {
    eraserPreview.style.display = "block";
    eraserPreview.style.left = e.clientX + "px";
    eraserPreview.style.top = e.clientY + "px";
  }
  if (!drawing) return;
  if (tool === "erase") {
    boardCtx.globalCompositeOperation = "destination-out";
    boardCtx.lineWidth = eraserSize;
  } else {
    boardCtx.globalCompositeOperation = "source-over";
    boardCtx.strokeStyle = "#ffffff";
    boardCtx.lineWidth = 3;
  }
  boardCtx.lineCap = "round";
  boardCtx.beginPath();
  boardCtx.moveTo(last.x, last.y);
  boardCtx.lineTo(e.clientX, e.clientY);
  boardCtx.stroke();
  last = { x: e.clientX, y: e.clientY };
});
function stopDrawing() {
  if (!drawing) return;
  drawing = false;
  saveBoard();
}
board.addEventListener("pointerup", stopDrawing);
board.addEventListener("pointercancel", stopDrawing);

board.addEventListener("wheel", e => {
  if (tool !== "erase") return;
  e.preventDefault();
  setEraserSize(eraserSize + (e.deltaY > 0 ? -4 : 4));
}, { passive: false });

// ===== Code editor (loads on first use) =====
let editor = null;
const CODE_KEY = "codeEditorContent";
function ensureEditor() {
  if (editor) return;
  require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    let saved = null;
    if (settings.rememberLayout) {
      try { saved = localStorage.getItem(CODE_KEY); } catch (err) {}
    }
    editor = monaco.editor.create(document.getElementById("editorContainer"), {
      value: saved || "#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
      language: "cpp",
      theme: "vs-dark",
      fontSize: 14,
      automaticLayout: true,
      minimap: { enabled: false }
    });
    editor.onDidChangeModelContent(() => {
      if (!settings.rememberLayout) return;
      try { localStorage.setItem(CODE_KEY, editor.getValue()); } catch (err) {}
    });
  });
}
// ===== Running C++ code =====
const runButton = document.getElementById("runCode");
const stdinBox = document.getElementById("stdinBox");
const stdoutBox = document.getElementById("stdoutBox");

runButton.addEventListener("click", async () => {
  if (!editor) {
    stdoutBox.textContent = "Editor is still loading — try again in a second.";
    return;
  }
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (!runButton.disabled) runButton.click();
  }
});
  runButton.disabled = true;
  runButton.textContent = "Running…";
  stdoutBox.style.color = "var(--muted)";
  stdoutBox.textContent = "Compiling…";

  try {
    const result = await invoke("run_cpp", {
      code: editor.getValue(),
      input: stdinBox.value
    });
    stdoutBox.textContent = result.output || "(no output)";
    stdoutBox.style.color = result.success ? "var(--text)" : "#ff8080";
  } catch (err) {
    stdoutBox.textContent = "Something went wrong calling Rust: " + err;
    stdoutBox.style.color = "#ff8080";
  }

  runButton.disabled = false;
  runButton.textContent = "▶ Run";
});
// Restore split view from last time (must run after everything above is defined)
if (settings.rememberLayout) {
  let wasSplit = false;
  try { wasSplit = localStorage.getItem(SPLIT_KEY) === "1"; } catch (err) {}
  if (wasSplit) setSplit(true);
}
document.body.classList.add("ready");