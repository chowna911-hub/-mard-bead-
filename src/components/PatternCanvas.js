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
      <div>
        <h2>拼豆画布</h2>
        <p id="canvasStatus">上传图片后，这里会生成你的拼豆图纸。</p>
      </div>
      <div class="canvas-tools compact-tools">
        <button type="button" class="secondary-btn is-active" data-tool="paint" data-action="tool-paint">画笔</button>
        <button type="button" class="secondary-btn" data-tool="erase" data-action="tool-erase">橡皮</button>
        <button type="button" class="secondary-btn" data-action="export-png">导出</button>
        <button type="button" class="secondary-btn" data-action="zoom-in">放大</button>
        <button type="button" class="secondary-btn" data-action="zoom-out">缩小</button>
        <button type="button" class="secondary-btn" data-action="reset">重置</button>
      </div>
    </div>
    <div class="canvas-shell">
      <canvas class="pattern-canvas"></canvas>
      <div class="loading-mask is-hidden">
        <div class="loading-card">
          <div class="loading-bar"><span></span></div>
          <strong>正在生成图纸</strong>
          <p>准备中...</p>
        </div>
      </div>
    </div>
    <div class="canvas-foot">
      <div class="zoom-readout">缩放 1.00x</div>
      <div class="mini-hint">点色号只是选画笔，真正点到画布上才会拼上豆子。</div>
    </div>
  `;

  const canvas = element.querySelector(".pattern-canvas");
  const status = element.querySelector("#canvasStatus");
  const zoomReadout = element.querySelector(".zoom-readout");
  const loadingMask = element.querySelector(".loading-mask");
  const loadingBar = loadingMask.querySelector(".loading-bar span");
  const loadingText = loadingMask.querySelector("p");
  const tools = element.querySelector(".compact-tools");

  const renderer = new PatternCanvasRenderer(canvas, {
    background: "#fbfdff",
    onViewportChange({ zoomLevel }) {
      zoomReadout.textContent = `缩放 ${zoomLevel.toFixed(2)}x`;
    },
    onStatus(text) {
      if (text) status.textContent = text;
    },
    onToolStateChange({ toolMode }) {
      setActiveButtonState(tools, toolMode);
    }
  });

  renderer.setToolMode("paint");
  renderer.setMode("pattern");
  renderer.setShowCodesMode("auto");

  attachCanvasInteraction(renderer, canvas);

  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);
  requestAnimationFrame(() => renderer.resize());

  element.querySelector("[data-action='zoom-in']").addEventListener("click", () => renderer.zoomBy(1.18));
  element.querySelector("[data-action='zoom-out']").addEventListener("click", () => renderer.zoomBy(0.86));
  element.querySelector("[data-action='reset']").addEventListener("click", () => renderer.resetView());
  element.querySelector("[data-action='tool-paint']").addEventListener("click", () => renderer.setToolMode("paint"));
  element.querySelector("[data-action='tool-erase']").addEventListener("click", () => renderer.setToolMode("erase"));

  return {
    element,
    renderer,
    setStatus(text) {
      status.textContent = text;
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
      renderer.setShowCodesMode("auto");
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

function gridLike(progressGrid) {
  return progressGrid && typeof progressGrid === "object" && progressGrid.placed;
}
