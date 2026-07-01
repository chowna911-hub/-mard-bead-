import { ImagePixelEngine } from "./modules/image/ImagePixelEngine.js";
import {
  defaultPixelEngineConfig,
  DEFAULT_CONVERT_MODE,
  getPixelEngineConfigForMode
} from "./modules/image/types.js";
import { createImageUploader } from "./components/ImageUploader.js";
import { createPatternCanvas } from "./components/PatternCanvas.js";
import { createPaletteStatsPanel } from "./components/PaletteStatsPanel.js";
import { createPatternLibraryDrawer } from "./components/PatternLibraryDrawer.js";

const root = document.getElementById("app");
const STORAGE_KEY = "cyber-beads-simple-patterns";
const MAX_SAVED_PATTERNS = 12;

let activeMode = DEFAULT_CONVERT_MODE;
let engineConfig = buildEngineConfig(activeMode);
let engine = new ImagePixelEngine({ config: engineConfig });
let activeSize = 64;
let currentGrid = null;
let currentImage = null;
let currentProgressGrid = null;
let currentProgressStats = null;
let currentSavedId = null;
let selectedCode = null;
let autoSaveTimer = null;

const sizeOptions = [
  { value: 48, label: "48×48", desc: "小巧清爽" },
  { value: 64, label: "64×64", desc: "默认推荐" },
  { value: 72, label: "72×72", desc: "细节更多" }
];

const canvasView = createPatternCanvas();
const statsPanel = createPaletteStatsPanel({
  onSelectCode(code, meta) {
    selectedCode = code;
    if (meta) {
      canvasView.setBrush({
        code: meta.code,
        hex: meta.hex,
        rgb: meta.rgb,
        name: meta.name
      });
      canvasView.setStatus(`当前画笔：${meta.code} ${meta.name}`);
    } else {
      canvasView.renderer.clearSelection();
      canvasView.renderer.setToolMode("paint");
      canvasView.setStatus("已清空当前颜色选择");
    }
    statsPanel.render(currentGrid, engine.paletteMapper, selectedCode, currentProgressStats);
  }
});

const libraryDrawer = createPatternLibraryDrawer({
  onLoad(item) {
    restoreSavedPattern(item);
    libraryDrawer.close();
  },
  onDelete(item) {
    const items = loadSavedPatterns().filter((entry) => entry.id !== item.id);
    saveSavedPatterns(items);
    if (currentSavedId === item.id) currentSavedId = null;
    libraryDrawer.render(items);
  }
});

canvasView.onGridChange((targetGrid, progressGrid, progressStats) => {
  currentGrid = targetGrid;
  currentProgressGrid = cloneData(progressGrid);
  currentProgressStats = cloneData(progressStats);
  statsPanel.render(currentGrid, engine.paletteMapper, selectedCode, currentProgressStats);
  scheduleAutoSave();
});

const uploader = createImageUploader({
  sizes: sizeOptions,
  defaultValue: activeSize,
  onLibraryOpen() {
    libraryDrawer.render(loadSavedPatterns());
    libraryDrawer.open();
  },
  async onSizeChange(size) {
    if (activeSize === size) return;
    if (!currentImage && currentGrid) {
      uploader.setActiveSize(currentGrid.width);
      canvasView.setStatus("这张图纸来自本地继续记录。想换尺寸的话，需要重新上传原图。");
      return;
    }
    const hasProgress = (currentProgressStats?.placedCells ?? 0) > 0;
    if (hasProgress) {
      const shouldContinue = window.confirm("切换尺寸会重新生成图纸，当前拼豆进度会回到新尺寸版本。要继续吗？");
      if (!shouldContinue) {
        uploader.setActiveSize(activeSize);
        return;
      }
      persistCurrentPattern();
    }
    activeSize = size;
    uploader.setActiveSize(activeSize);
    if (currentImage) {
      await convertCurrentImage();
    }
  },
  async onFileSelect(file) {
    uploader.setBusy(true, "转换中...");
    canvasView.setLoading(2, "正在读取图片...");

    try {
      currentImage = await loadImage(file);
      currentSavedId = null;
      await convertCurrentImage();
    } catch (error) {
      console.error(error);
      canvasView.clearLoading();
      canvasView.setStatus("图片处理失败了，换一张边缘更清晰的图片再试试。");
    } finally {
      uploader.setBusy(false, "转换图纸");
      canvasView.renderer.resize();
    }
  }
});

canvasView.onExportPng(() => {
  if (!currentGrid) return;
  const dataUrl = canvasView.renderer.exportPatternPNG({
    preset: "high",
    title: "Cyber Beads Pattern",
    subtitle: `${currentGrid.width} × ${currentGrid.height}`
  });
  if (!dataUrl) return;
  download(dataUrl, `cyber-beads-${currentGrid.width}x${currentGrid.height}.png`);
});

const footer = document.createElement("div");
footer.className = "footer-note";
footer.textContent = "主界面只保留最常用功能，复杂参数已收起。你可以直接上传、选色、拼豆、导出。";

root.append(
  uploader.element,
  canvasView.element,
  statsPanel.element,
  footer,
  libraryDrawer.element
);

statsPanel.render(null, engine.paletteMapper, null, null);

async function convertCurrentImage() {
  if (!currentImage) return;

  selectedCode = null;
  canvasView.renderer.clearSelection();
  canvasView.renderer.setToolMode("paint");
  canvasView.setLoading(8, "正在生成图纸...");
  canvasView.setStatus(`正在生成 ${activeSize} × ${activeSize} 图纸`);

  const result = await engine.process(currentImage, {
    mode: activeMode,
    targetSize: activeSize,
    config: {
      targetGridSize: activeSize
    },
    onProgress(progress, text) {
      canvasView.setLoading(progress, translateProgress(text));
    }
  });

  currentGrid = result.beadGrid;
  currentProgressGrid = null;
  currentProgressStats = null;
  canvasView.setGrid(currentGrid);
  canvasView.clearLoading();
  canvasView.setStatus(`图纸已生成，现在可以直接开始拼 ${activeSize} × ${activeSize}`);
  statsPanel.render(currentGrid, engine.paletteMapper, null, canvasView.renderer.progressStats);
  persistCurrentPattern();
}

function translateProgress(text = "") {
  const map = {
    "normalize image": "整理图片中...",
    "estimate background": "识别背景中...",
    "generate subject mask": "提取主体中...",
    "macro color analysis": "整理主色块中...",
    "semantic grid arrangement": "排布拼豆网格中...",
    "highlight / small feature protection": "保护细节中...",
    "outline layer generation": "清理轮廓中...",
    "noise cleanup": "去除杂点中...",
    "final crop": "整理画面边距中...",
    "quality check": "检查图纸质量中...",
    "quality retry": "微调图纸效果中...",
    "output bead grid": "准备展示图纸..."
  };
  return map[text] || "处理中...";
}

function buildEngineConfig(mode) {
  return deepMerge(defaultPixelEngineConfig, getPixelEngineConfigForMode(mode));
}

function deepMerge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

function download(url, filename, revoke = false) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function loadSavedPatterns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveSavedPatterns(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error(error);
  }
}

function scheduleAutoSave() {
  if (!currentGrid || !currentProgressGrid) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    persistCurrentPattern();
  }, 400);
}

function persistCurrentPattern() {
  if (!currentGrid) return;
  const items = loadSavedPatterns();
  const now = Date.now();
  const progressPercent = currentProgressStats?.progressPercent ?? 0;
  const payload = {
    id: currentSavedId || createPatternId(),
    name: `未命名图纸_${currentGrid.width}板`,
    size: currentGrid.width,
    sizeLabel: `${currentGrid.width} × ${currentGrid.height}`,
    updatedAt: now,
    createdAt: currentSavedId
      ? items.find((entry) => entry.id === currentSavedId)?.createdAt || now
      : now,
    progressPercent,
    thumbnail: createPatternThumbnail(currentGrid, currentProgressGrid),
    targetGrid: serializeTargetGrid(currentGrid),
    progressGrid: serializeProgressGrid(
      currentProgressGrid
      || canvasView.renderer.progressGrid
      || { width: currentGrid.width, height: currentGrid.height, placed: {} }
    )
  };

  const nextItems = items.filter((entry) => entry.id !== payload.id);
  nextItems.unshift(payload);
  saveSavedPatterns(nextItems.slice(0, MAX_SAVED_PATTERNS));
  currentSavedId = payload.id;
}

function restoreSavedPattern(item) {
  currentSavedId = item.id;
  activeSize = item.size;
  currentImage = null;
  selectedCode = null;
  uploader.setActiveSize(activeSize);
  canvasView.renderer.clearSelection();
  canvasView.renderer.setToolMode("paint");
  const restoredGrid = deserializeTargetGrid(item.targetGrid);
  const restoredProgressGrid = deserializeProgressGrid(item.progressGrid, restoredGrid);
  canvasView.setGrid(restoredGrid);
  if (item.progressGrid) {
    canvasView.setProgressGrid(restoredProgressGrid);
  }
  currentGrid = cloneData(restoredGrid);
  currentProgressGrid = cloneData(restoredProgressGrid || canvasView.renderer.progressGrid);
  currentProgressStats = cloneData(canvasView.renderer.progressStats);
  statsPanel.render(currentGrid, engine.paletteMapper, null, currentProgressStats);
  canvasView.setStatus(`已恢复 ${item.sizeLabel} 图纸，可以继续拼豆了`);
}

function createPatternId() {
  return `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createPatternThumbnail(grid, progressGrid) {
  if (!grid) return "";
  const side = 128;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  const cellSize = side / Math.max(grid.width, grid.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (!cell?.code) continue;
      const placed = progressGrid?.placed?.[`${x},${y}`];
      ctx.globalAlpha = placed ? 1 : 0.35;
      ctx.fillStyle = cell.color;
      ctx.fillRect(x * cellSize, y * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
    }
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/png", 0.82);
}

function cloneData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function serializeTargetGrid(grid) {
  return {
    width: grid.width,
    height: grid.height,
    codes: grid.cells.map((row) => row.map((cell) => cell.code || null))
  };
}

function deserializeTargetGrid(payload) {
  if (payload?.cells) {
    return payload;
  }
  const width = payload.width;
  const height = payload.height;
  const cells = payload.codes.map((row, y) => row.map((code, x) => {
    if (!code) {
      return {
        x,
        y,
        code: null,
        color: "transparent",
        hex: null,
        rgb: null,
        isBackground: true,
        isOutline: false,
        isHighlight: false,
        name: ""
      };
    }
    const meta = engine.paletteMapper.getByCode(code);
    return {
      x,
      y,
      code,
      color: meta?.hex || "#000000",
      hex: meta?.hex || "#000000",
      rgb: meta?.rgb ? meta.rgb.slice() : null,
      isBackground: false,
      isOutline: false,
      isHighlight: false,
      name: meta?.name || code
    };
  }));

  const paletteStats = {};
  cells.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.code) return;
      if (!paletteStats[cell.code]) {
        paletteStats[cell.code] = {
          code: cell.code,
          name: cell.name,
          hex: cell.color,
          count: 0
        };
      }
      paletteStats[cell.code].count += 1;
    });
  });

  return { width, height, cells, paletteStats };
}

function serializeProgressGrid(progressGrid) {
  return {
    width: progressGrid.width,
    height: progressGrid.height,
    placed: Object.values(progressGrid.placed || {}).map((item) => [
      item.x,
      item.y,
      item.code,
      item.placedAt || Date.now()
    ])
  };
}

function deserializeProgressGrid(payload, grid) {
  if (payload?.placed && !Array.isArray(payload.placed)) {
    return payload;
  }
  if (!payload) {
    return {
      width: grid.width,
      height: grid.height,
      placed: {}
    };
  }
  const placed = {};
  (payload.placed || []).forEach((item) => {
    const [x, y, code, placedAt] = item;
    placed[`${x},${y}`] = { x, y, code, placedAt };
  });
  return {
    width: payload.width || grid.width,
    height: payload.height || grid.height,
    placed
  };
}
