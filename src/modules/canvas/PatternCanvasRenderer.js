import { renderPatternMode } from "./renderPatternMode.js";
import { renderPreviewMode } from "./renderPreviewMode.js";
import { renderIronedMode } from "./renderIronedMode.js";
import { exportPatternPNG, exportPatternPages, exportPreviewPNG, exportIronedPNG } from "./exportPattern.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneProgressGrid(progressGrid) {
  return {
    width: progressGrid.width,
    height: progressGrid.height,
    placed: Object.fromEntries(
      Object.entries(progressGrid.placed).map(([key, value]) => [key, { ...value }])
    )
  };
}

function makeKey(x, y) {
  return `${x},${y}`;
}

function createEmptyProgressGrid(grid) {
  return {
    width: grid.width,
    height: grid.height,
    placed: {}
  };
}

export class PatternCanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.grid = null;
    this.progressGrid = null;
    this.progressStats = null;
    this.mode = "pattern";
    this.ironedSource = "progress";
    this.toolMode = "view";
    this.selectedCode = null;
    this.selectedColor = null;
    this.codeDisplayMode = "auto";
    this.exportShowCodes = "always";
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.padding = 18;
    this.background = options.background || "#fbfdff";
    this.minZoom = 0.75;
    this.maxZoom = 8;
    this.metrics = { side: 0 };
    this.hoverCell = null;
    this.cellTooltip = null;
    this.history = [];
    this.future = [];
    this.onViewportChange = options.onViewportChange || (() => {});
    this.onGridChange = options.onGridChange || (() => {});
    this.onToolStateChange = options.onToolStateChange || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onTooltipChange = options.onTooltipChange || (() => {});
    this.onCodeDisplayModeChange = options.onCodeDisplayModeChange || (() => {});
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.metrics.side = Math.min(rect.width || 0, rect.height || 0)
      || Math.min(this.canvas.width / dpr, this.canvas.height / dpr);
    this.render();
  }

  setGrid(grid) {
    this.grid = grid;
    this.progressGrid = createEmptyProgressGrid(grid);
    this.history = [];
    this.future = [];
    this.hideCellTooltip();
    this.recalculateProgressStats();
    this.resetView();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === "ironed" && this.progressStats?.placedCells > 0) {
      this.ironedSource = "progress";
    }
    this.render();
  }

  toggleIronedSource() {
    this.ironedSource = this.ironedSource === "progress" ? "full" : "progress";
    this.render();
  }

  setToolMode(mode) {
    this.toolMode = mode;
    this.onToolStateChange({ toolMode: this.toolMode, selectedCode: this.selectedCode });
    this.render();
  }

  setBrush(colorMeta) {
    this.selectedColor = colorMeta || null;
    this.selectedCode = colorMeta?.code || null;
    if (colorMeta) this.toolMode = "paint";
    this.onToolStateChange({ toolMode: this.toolMode, selectedCode: this.selectedCode });
    this.render();
  }

  clearSelection() {
    this.selectedColor = null;
    this.selectedCode = null;
    if (this.toolMode === "paint" || this.toolMode === "picker") {
      this.toolMode = "view";
    }
    this.onToolStateChange({ toolMode: this.toolMode, selectedCode: this.selectedCode });
    this.render();
  }

  setSelectedCode(code) {
    this.selectedCode = code;
    this.onToolStateChange({ toolMode: this.toolMode, selectedCode: this.selectedCode });
    this.render();
  }

  setCodeDisplayMode(mode) {
    this.codeDisplayMode = mode;
    this.onCodeDisplayModeChange(mode);
    this.render();
  }

  setShowCodesMode(mode) {
    const normalized = mode === "never" ? "hidden" : mode;
    this.setCodeDisplayMode(normalized);
  }

  cycleCodeDisplayMode() {
    const order = ["auto", "always", "hidden"];
    const currentIndex = order.indexOf(this.codeDisplayMode);
    const nextMode = order[(currentIndex + 1) % order.length];
    this.setCodeDisplayMode(nextMode);
    return nextMode;
  }

  getCodeDisplayLabel() {
    if (this.codeDisplayMode === "always") return "显示";
    if (this.codeDisplayMode === "hidden") return "隐藏";
    return "自动";
  }

  getDisplayCode(code, screenCellSize, mode = this.codeDisplayMode, forceFull = false) {
    if (!code || mode === "hidden") return "";
    if (forceFull) return code;
    if (mode === "always") return screenCellSize >= 8 ? code : code[0];
    if (screenCellSize >= 10) return code;
    if (screenCellSize >= 7) return code[0];
    return "";
  }

  getCodeFontSize(screenCellSize, displayCode, forceFull = false) {
    if (!displayCode) return 0;
    const base = forceFull
      ? Math.floor(screenCellSize * (displayCode.length > 1 ? 0.42 : 0.5))
      : Math.floor(screenCellSize * (displayCode.length > 1 ? 0.48 : 0.55));
    return clamp(base, 5, Math.floor(screenCellSize * 0.55));
  }

  setZoom(zoom) {
    this.zoomLevel = clamp(zoom, this.minZoom, this.maxZoom);
    this.render();
  }

  resetView() {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.render();
  }

  zoomBy(delta, anchor = null) {
    const prevZoom = this.zoomLevel;
    const nextZoom = clamp(Number((this.zoomLevel * delta).toFixed(3)), this.minZoom, this.maxZoom);
    if (prevZoom === nextZoom) return;

    if (anchor && this.grid) {
      const before = this.screenToWorld(anchor.x, anchor.y);
      this.zoomLevel = nextZoom;
      const after = this.screenToWorld(anchor.x, anchor.y);
      const layout = this.getLayout();
      this.panX += (after.x - before.x) * layout.cellSize * nextZoom;
      this.panY += (after.y - before.y) * layout.cellSize * nextZoom;
    } else {
      this.zoomLevel = nextZoom;
    }

    this.clampPan();
    this.render();
  }

  panBy(deltaX, deltaY) {
    this.panX += deltaX;
    this.panY += deltaY;
    this.clampPan();
    this.render();
  }

  getLayout() {
    if (!this.grid) {
      return {
        cellSize: 0,
        offsetX: 0,
        offsetY: 0,
        headerBand: 0,
        footerBand: 0,
        leftBand: 0,
        rightBand: 0,
        drawCodes: false
      };
    }

    const isPattern = this.mode === "pattern";
    const headerBand = isPattern ? 24 : 0;
    const footerBand = isPattern ? 24 : 0;
    const leftBand = isPattern ? 24 : 0;
    const rightBand = isPattern ? 24 : 0;
    const usableSide = this.metrics.side - this.padding * 2;
    const boardSide = Math.max(1, usableSide - headerBand - footerBand);
    const cellSize = boardSide / Math.max(this.grid.width, this.grid.height);
    const drawSide = Math.max(this.grid.width, this.grid.height) * cellSize;
    const offsetX = (usableSide - (drawSide + leftBand + rightBand)) / 2 + this.padding + this.panX;
    const offsetY = (usableSide - (drawSide + headerBand + footerBand)) / 2 + this.padding + this.panY;

    return {
      cellSize: cellSize * this.zoomLevel,
      baseCellSize: cellSize,
      screenCellSize: cellSize * this.zoomLevel,
      offsetX,
      offsetY,
      headerBand,
      footerBand,
      leftBand,
      rightBand,
      drawCodes: this.getShouldDrawCodes(cellSize * this.zoomLevel, this.mode === "pattern")
    };
  }

  getShouldDrawCodes(screenCellSize, isPatternMode = true, overrideMode = null) {
    if (!isPatternMode) return overrideMode === "always";
    const mode = overrideMode || this.codeDisplayMode;
    if (mode === "always") return true;
    if (mode === "hidden") return false;
    return screenCellSize >= 7;
  }

  clampPan() {
    const layout = this.getLayout();
    const totalWidth = this.grid ? layout.baseCellSize * this.grid.width * this.zoomLevel : 0;
    const overflow = Math.max(0, totalWidth - this.metrics.side * 0.82);
    this.panX = clamp(this.panX, -overflow, overflow);
    this.panY = clamp(this.panY, -overflow, overflow);
    this.onViewportChange({ zoomLevel: this.zoomLevel });
  }

  screenToWorld(screenX, screenY) {
    const layout = this.getLayout();
    return {
      x: (screenX - layout.offsetX - layout.leftBand) / Math.max(1, layout.cellSize),
      y: (screenY - layout.offsetY - layout.headerBand) / Math.max(1, layout.cellSize)
    };
  }

  screenToGrid(screenX, screenY) {
    if (!this.grid) return null;
    const layout = this.getLayout();
    const localX = screenX - layout.offsetX - layout.leftBand;
    const localY = screenY - layout.offsetY - layout.headerBand;
    const boardWidth = this.grid.width * layout.cellSize;
    const boardHeight = this.grid.height * layout.cellSize;
    if (localX < 0 || localY < 0 || localX >= boardWidth || localY >= boardHeight) {
      return null;
    }
    const gridX = Math.floor(localX / Math.max(1, layout.cellSize));
    const gridY = Math.floor(localY / Math.max(1, layout.cellSize));
    if (gridX < 0 || gridY < 0 || gridX >= this.grid.width || gridY >= this.grid.height) {
      return null;
    }
    return { gridX, gridY };
  }

  getCellAt(gridX, gridY) {
    return this.grid?.cells?.[gridY]?.[gridX] || null;
  }

  getScreenPointForCell(gridX, gridY) {
    const layout = this.getLayout();
    return {
      screenX: layout.offsetX + layout.leftBand + gridX * layout.cellSize + layout.cellSize / 2,
      screenY: layout.offsetY + layout.headerBand + gridY * layout.cellSize + layout.cellSize / 2
    };
  }

  showCellTooltip(gridX, gridY, options = {}) {
    const cell = this.getCellAt(gridX, gridY);
    if (!cell?.code) {
      this.hideCellTooltip();
      return null;
    }
    const position = this.getScreenPointForCell(gridX, gridY);
    this.cellTooltip = {
      x: gridX,
      y: gridY,
      code: cell.code,
      color: cell.color,
      name: cell.name || cell.code,
      screenX: options.screenX ?? position.screenX,
      screenY: options.screenY ?? position.screenY,
      visible: true,
      locked: Boolean(options.locked)
    };
    this.onTooltipChange(this.cellTooltip);
    this.render();
    return this.cellTooltip;
  }

  hideCellTooltip(force = false) {
    if (!this.cellTooltip) return;
    if (this.cellTooltip.locked && !force) return;
    this.cellTooltip = null;
    this.onTooltipChange(null);
    this.render();
  }

  isPlaced(x, y) {
    return !!this.progressGrid?.placed[makeKey(x, y)];
  }

  getPlacedCell(x, y) {
    return this.progressGrid?.placed[makeKey(x, y)] || null;
  }

  getCellRenderState(cell, x, y) {
    const placed = this.getPlacedCell(x, y);
    if (!cell.code) {
      if (placed) return "wrong-placed";
      return "background";
    }
    if (placed && placed.code !== cell.code) return "wrong-placed";
    if (!this.selectedCode) {
      return placed ? "target-other-placed" : "target-unselected";
    }
    if (cell.code === this.selectedCode) {
      return placed ? "target-selected-placed" : "target-selected-unplaced";
    }
    return placed ? "target-other-placed" : "target-unselected";
  }

  pushHistory() {
    if (!this.progressGrid) return;
    this.history.push(cloneProgressGrid(this.progressGrid));
    if (this.history.length > 80) this.history.shift();
    this.future = [];
  }

  recalculateProgressStats() {
    if (!this.grid || !this.progressGrid) return;
    const perColor = {};
    let totalTargetCells = 0;
    let placedCells = 0;

    for (let y = 0; y < this.grid.height; y += 1) {
      for (let x = 0; x < this.grid.width; x += 1) {
        const cell = this.grid.cells[y][x];
        if (!cell.code) continue;
        totalTargetCells += 1;
        if (!perColor[cell.code]) {
          perColor[cell.code] = {
            targetCount: 0,
            placedCount: 0,
            remainingCount: 0
          };
        }
        perColor[cell.code].targetCount += 1;
        const placed = this.getPlacedCell(x, y);
        if (placed && placed.code === cell.code) {
          perColor[cell.code].placedCount += 1;
          placedCells += 1;
        }
      }
    }

    Object.values(perColor).forEach((item) => {
      item.remainingCount = item.targetCount - item.placedCount;
    });

    this.progressStats = {
      totalTargetCells,
      placedCells,
      remainingCells: totalTargetCells - placedCells,
      progressPercent: totalTargetCells ? Math.round((placedCells / totalTargetCells) * 100) : 0,
      perColor
    };
  }

  notifyGridChange() {
    this.recalculateProgressStats();
    this.onGridChange(this.grid, this.progressGrid, this.progressStats);
    this.render();
  }

  placeBeadAt(x, y) {
    if (!this.grid || !this.progressGrid) return false;
    if (this.toolMode !== "paint") return false;
    if (!this.selectedCode) {
      this.onStatus("请先选择一个豆子颜色");
      return false;
    }
    const targetCell = this.grid.cells[y]?.[x];
    if (!targetCell?.code) return false;
    if (targetCell.code !== this.selectedCode) {
      this.onStatus("这里不是当前颜色");
      return false;
    }
    const key = makeKey(x, y);
    const existing = this.progressGrid.placed[key];
    if (existing && existing.code === this.selectedCode) return false;
    this.progressGrid.placed[key] = { x, y, code: this.selectedCode, placedAt: Date.now() };
    return true;
  }

  eraseBeadAt(x, y) {
    if (!this.progressGrid) return false;
    const key = makeKey(x, y);
    if (!this.progressGrid.placed[key]) return false;
    delete this.progressGrid.placed[key];
    return true;
  }

  pickCodeAt(x, y) {
    const targetCell = this.grid?.cells[y]?.[x];
    if (targetCell?.code) {
      this.setBrush({
        code: targetCell.code,
        hex: targetCell.color,
        rgb: Array.isArray(targetCell.rgb) ? targetCell.rgb.slice() : null,
        name: targetCell.name || targetCell.code
      });
      return true;
    }
    const placed = this.getPlacedCell(x, y);
    if (placed) {
      const cell = this.grid?.cells[y]?.[x];
      this.setBrush({
        code: placed.code,
        hex: cell?.color || "#000000",
        rgb: Array.isArray(cell?.rgb) ? cell.rgb.slice() : null,
        name: cell?.name || placed.code
      });
      return true;
    }
    return false;
  }

  applyToolAt(gridX, gridY) {
    if (!this.grid || this.mode === "preview" || this.mode === "ironed") return false;
    if (this.toolMode === "paint") return this.placeBeadAt(gridX, gridY);
    if (this.toolMode === "erase") return this.eraseBeadAt(gridX, gridY);
    if (this.toolMode === "picker") {
      if (this.pickCodeAt(gridX, gridY)) {
        this.onStatus(`已吸取 ${this.selectedCode}`);
      }
      return false;
    }
    return false;
  }

  beginEdit(screenX, screenY) {
    const hit = this.screenToGrid(screenX, screenY);
    if (!hit) return false;
    if (this.toolMode === "pan" || this.toolMode === "view") return false;
    this.pushHistory();
    const changed = this.applyToolAt(hit.gridX, hit.gridY);
    if (changed) {
      this.notifyGridChange();
    } else {
      if (this.toolMode !== "picker") this.history.pop();
      this.render();
    }
    return true;
  }

  continueEdit(screenX, screenY) {
    const hit = this.screenToGrid(screenX, screenY);
    if (!hit) return false;
    const changed = this.applyToolAt(hit.gridX, hit.gridY);
    if (changed) this.notifyGridChange();
    return changed;
  }

  undo() {
    if (!this.history.length || !this.progressGrid) return;
    this.future.push(cloneProgressGrid(this.progressGrid));
    this.progressGrid = this.history.pop();
    this.notifyGridChange();
  }

  redo() {
    if (!this.future.length || !this.progressGrid) return;
    this.history.push(cloneProgressGrid(this.progressGrid));
    this.progressGrid = this.future.pop();
    this.notifyGridChange();
  }

  setHoverFromScreen(screenX, screenY) {
    this.hoverCell = this.screenToGrid(screenX, screenY);
    this.render();
  }

  clearHover() {
    this.hoverCell = null;
    this.render();
  }

  render() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width;
    const height = rect.height || this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, width, height);

    if (!this.grid) {
      this.ctx.fillStyle = "#8ca0bf";
      this.ctx.font = '600 15px "Trebuchet MS", "Segoe UI", sans-serif';
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("上传图片后，这里会显示拼豆图纸", width / 2, height / 2);
      return;
    }

    const layout = this.getLayout();
    if (this.mode === "preview") {
      renderPreviewMode(this.ctx, this, layout);
    } else if (this.mode === "ironed") {
      renderIronedMode(this.ctx, this, layout);
    } else {
      renderPatternMode(this.ctx, this, layout);
    }
  }

  exportPNG() {
    return this.exportPreviewPNG();
  }

  exportPreviewPNG() {
    if (!this.grid) return null;
    return exportPreviewPNG(this);
  }

  exportPatternPNG(options = {}) {
    return exportPatternPNG(this, options);
  }

  exportIronedPNG(options = {}) {
    return exportIronedPNG(this, options);
  }

  exportPatternPages(options = {}) {
    return exportPatternPages(this, options);
  }

  exportGridJson() {
    return JSON.stringify({
      targetGrid: this.grid,
      progressGrid: this.progressGrid,
      progressStats: this.progressStats
    }, null, 2);
  }
}
