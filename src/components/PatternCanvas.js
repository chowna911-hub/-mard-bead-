import { PatternCanvasRenderer } from "../modules/canvas/PatternCanvasRenderer.js";
import { attachCanvasInteraction } from "../modules/canvas/canvasInteraction.js";

function setActiveButtonState(container, activeMode) {
  container.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === activeMode);
  });
}

export function createPatternCanvas() {
  const element = document.createElement("section");
  element.className = "panel canvas-panel";
  element.innerHTML = `
    <div class="canvas-head simple-head">
      <div class="canvas-copy">
        <h2>拼豆画布</h2>
        <p id="canvasStatus"></p>
      </div>
      <div class="canvas-head-actions">
        <button type="button" class="code-toggle-btn" data-action="toggle-code-display">色号：自动</button>
        <div class="zoom-chip">1.00x</div>
      </div>
    </div>
    <div class="canvas-stage">
      <div class="canvas-shell">
        <canvas class="pattern-canvas"></canvas>
      </div>
      <div class="cell-tooltip is-hidden" data-role="cell-tooltip">
        <span class="cell-tooltip-swatch"></span>
        <div class="cell-tooltip-copy">
          <strong class="cell-tooltip-code"></strong>
          <span class="cell-tooltip-name"></span>
        </div>
      </div>
      <div class="loading-mask is-hidden">
        <div class="loading-card">
          <div class="loading-bar"><span></span></div>
          <strong>正在生成图纸</strong>
          <p>准备中...</p>
        </div>
      </div>
    </div>
    <div class="canvas-tools compact-tools">
      <button type="button" class="tool-card is-active" data-tool="paint" data-action="tool-paint">
        <span class="tool-icon">✎</span>
        <span>画笔</span>
      </button>
      <button type="button" class="tool-card" data-tool="erase" data-action="tool-erase">
        <span class="tool-icon">◐</span>
        <span>橡皮</span>
      </button>
      <button type="button" class="tool-card" data-action="zoom-in">
        <span class="tool-icon">＋</span>
        <span>放大</span>
      </button>
      <button type="button" class="tool-card" data-action="zoom-out">
        <span class="tool-icon">－</span>
        <span>缩小</span>
      </button>
      <button type="button" class="tool-card" data-action="reset">
        <span class="tool-icon">↻</span>
        <span>清空</span>
      </button>
      <button type="button" class="tool-card" data-action="export-png">
        <span class="tool-icon">⇧</span>
        <span>导出</span>
      </button>
    </div>
  `;

  const canvas = element.querySelector(".pattern-canvas");
  const status = element.querySelector("#canvasStatus");
  const zoomReadout = element.querySelector(".zoom-chip");
  const codeToggle = element.querySelector("[data-action='toggle-code-display']");
  const loadingMask = element.querySelector(".loading-mask");
  const loadingBar = loadingMask.querySelector(".loading-bar span");
  const loadingText = loadingMask.querySelector("p");
  const tools = element.querySelector(".compact-tools");
  const tooltip = element.querySelector("[data-role='cell-tooltip']");
  const tooltipSwatch = tooltip.querySelector(".cell-tooltip-swatch");
  const tooltipCode = tooltip.querySelector(".cell-tooltip-code");
  const tooltipName = tooltip.querySelector(".cell-tooltip-name");

  const renderer = new PatternCanvasRenderer(canvas, {
    background: "#fbfdff",
    onViewportChange({ zoomLevel }) {
      zoomReadout.textContent = `${zoomLevel.toFixed(2)}x`;
    },
    onStatus(text) {
      status.textContent = text || "";
    },
    onToolStateChange({ toolMode }) {
      setActiveButtonState(tools, toolMode);
    },
    onCodeDisplayModeChange(mode) {
      codeToggle.textContent = `色号：${getCodeModeLabel(mode)}`;
    },
    onTooltipChange(nextTooltip) {
      if (!nextTooltip?.visible) {
        tooltip.classList.add("is-hidden");
        return;
      }
      tooltip.classList.remove("is-hidden");
      tooltipSwatch.style.background = nextTooltip.color;
      tooltipCode.textContent = nextTooltip.code;
      tooltipName.textContent = nextTooltip.name || "";

      const stageRect = element.querySelector(".canvas-stage").getBoundingClientRect();
      const left = clamp(nextTooltip.screenX + 14, 8, stageRect.width - 124);
      const top = clamp(nextTooltip.screenY - 56, 8, stageRect.height - 48);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }
  });

  renderer.setToolMode("paint");
  renderer.setMode("pattern");
  renderer.setCodeDisplayMode("auto");

  attachCanvasInteraction(renderer, canvas);

  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);
  requestAnimationFrame(() => renderer.resize());

  element.querySelector("[data-action='zoom-in']").addEventListener("click", () => renderer.zoomBy(1.18));
  element.querySelector("[data-action='zoom-out']").addEventListener("click", () => renderer.zoomBy(0.86));
  element.querySelector("[data-action='reset']").addEventListener("click", () => {
    renderer.clearPlacedBeads();
  });
  element.querySelector("[data-action='tool-paint']").addEventListener("click", () => renderer.setToolMode("paint"));
  element.querySelector("[data-action='tool-erase']").addEventListener("click", () => renderer.setToolMode("erase"));
  codeToggle.addEventListener("click", () => {
    renderer.cycleCodeDisplayMode();
  });

  return {
    element,
    renderer,
    setStatus(text) {
      status.textContent = text || "";
    },
    setSelectedCode(code) {
      renderer.setSelectedCode(code);
    },
    setBrush(meta) {
      renderer.setBrush(meta);
    },
    setGrid(grid) {
      renderer.setGrid(grid);
      renderer.setMode("pattern");
      renderer.setToolMode("paint");
      renderer.setCodeDisplayMode("auto");
    },
    setProgressGrid(progressGrid) {
      if (!gridLike(progressGrid)) return;
      renderer.progressGrid = progressGrid;
      renderer.history = [];
      renderer.future = [];
      renderer.notifyGridChange();
    },
    setLoading(progress, text) {
      if (typeof progress === "number") {
        loadingMask.classList.remove("is-hidden");
        loadingBar.style.width = `${progress}%`;
      }
      if (text) loadingText.textContent = text;
    },
    clearLoading() {
      loadingMask.classList.add("is-hidden");
      loadingBar.style.width = "0%";
    },
    onGridChange(callback) {
      renderer.onGridChange = callback;
    },
    onExportPng(callback) {
      element.querySelector("[data-action='export-png']").addEventListener("click", callback);
    },
    onToolStateChange(callback) {
      renderer.onToolStateChange = callback;
    }
  };
}

function getCodeModeLabel(mode) {
  if (mode === "always") return "显示";
  if (mode === "hidden") return "隐藏";
  return "自动";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gridLike(progressGrid) {
  return progressGrid && typeof progressGrid === "object" && progressGrid.placed;
}
