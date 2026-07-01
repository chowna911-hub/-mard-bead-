function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function getTextColor(cell) {
  if (!cell.rgb) return "#3f4d64";
  const luma = 0.299 * cell.rgb[0] + 0.587 * cell.rgb[1] + 0.114 * cell.rgb[2];
  return luma < 148 ? "#ffffff" : "#243042";
}

function getExportPreset(options = {}) {
  const preset = options.preset || "high";
  if (preset === "normal") return { cellSize: 20, titleHeight: 76, statsMinHeight: 88 };
  if (preset === "ultra") return { cellSize: 30, titleHeight: 92, statsMinHeight: 132 };
  return { cellSize: 24, titleHeight: 84, statsMinHeight: 108 };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawPaperBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#fdfefe");
  gradient.addColorStop(1, "#f2f6fb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawTitleBlock(ctx, grid, title, subtitle, canvasWidth, paddingX, topY, titleHeight) {
  roundedRect(ctx, paddingX, topY, canvasWidth - paddingX * 2, titleHeight, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(160, 176, 202, 0.32)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#243042";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = '700 26px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText(title, paddingX + 24, topY + 18);

  ctx.fillStyle = "#667791";
  ctx.font = '500 14px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText(subtitle, paddingX + 24, topY + 52);

  ctx.textAlign = "right";
  ctx.fillStyle = "#5b6f8f";
  ctx.font = '700 15px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.fillText(`${grid.width} x ${grid.height}`, canvasWidth - paddingX - 24, topY + 24);
}

function drawStatsBar(ctx, grid, startX, startY, width) {
  const stats = Object.values(grid.paletteStats).sort((a, b) => b.count - a.count);
  if (!stats.length) return 0;

  const cardHeight = 34;
  const gap = 8;
  let cursorX = startX;
  let cursorY = startY;
  const maxX = startX + width;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 14px "Trebuchet MS", "Segoe UI", sans-serif';

  for (const stat of stats) {
    const label = `${stat.code} ${stat.count}`;
    const cardWidth = Math.max(82, ctx.measureText(label).width + 28);
    if (cursorX + cardWidth > maxX) {
      cursorX = startX;
      cursorY += cardHeight + gap;
    }
    roundedRect(ctx, cursorX, cursorY, cardWidth, cardHeight, 12);
    ctx.fillStyle = stat.hex;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cursorX + cardWidth / 2, cursorY + cardHeight / 2);
    cursorX += cardWidth + gap;
  }

  return cursorY - startY + cardHeight;
}

function drawPatternBoard(ctx, grid, boardX, boardY, cellSize, includeCoordinates, forceCodes) {
  const boardWidth = grid.width * cellSize;
  const boardHeight = grid.height * cellSize;
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, boardX - 10, boardY - 10, boardWidth + 20, boardHeight + 20, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || !cell.code) continue;
      const px = boardX + x * cellSize;
      const py = boardY + y * cellSize;
      ctx.fillStyle = cell.color;
      ctx.fillRect(px, py, cellSize, cellSize);
      if (forceCodes) {
        ctx.fillStyle = getTextColor(cell);
        ctx.font = `${Math.min(14, Math.max(9, cellSize * 0.46))}px "Trebuchet MS", "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.code, px + cellSize / 2, py + cellSize / 2 + 0.4);
      }
    }
  }

  for (let index = 0; index <= grid.width; index += 1) {
    const lineX = boardX + index * cellSize;
    ctx.beginPath();
    ctx.lineWidth = index % 10 === 0 ? 2 : index % 5 === 0 ? 1.2 : 0.8;
    ctx.strokeStyle = index % 10 === 0 ? "rgba(129, 146, 178, 0.72)" : index % 5 === 0 ? "rgba(171, 185, 208, 0.52)" : "rgba(193, 203, 222, 0.34)";
    ctx.moveTo(lineX, boardY);
    ctx.lineTo(lineX, boardY + boardHeight);
    ctx.stroke();
  }

  for (let index = 0; index <= grid.height; index += 1) {
    const lineY = boardY + index * cellSize;
    ctx.beginPath();
    ctx.lineWidth = index % 10 === 0 ? 2 : index % 5 === 0 ? 1.2 : 0.8;
    ctx.strokeStyle = index % 10 === 0 ? "rgba(129, 146, 178, 0.72)" : index % 5 === 0 ? "rgba(171, 185, 208, 0.52)" : "rgba(193, 203, 222, 0.34)";
    ctx.moveTo(boardX, lineY);
    ctx.lineTo(boardX + boardWidth, lineY);
    ctx.stroke();
  }

  if (!includeCoordinates) return;

  ctx.fillStyle = "#56657f";
  ctx.font = '700 14px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let x = 0; x < grid.width; x += 1) {
    const tx = boardX + x * cellSize + cellSize / 2;
    ctx.fillText(String(x + 1), tx, boardY - 18);
    ctx.fillText(String(x + 1), tx, boardY + boardHeight + 18);
  }
  for (let y = 0; y < grid.height; y += 1) {
    const ty = boardY + y * cellSize + cellSize / 2;
    ctx.fillText(String(y + 1), boardX - 18, ty);
    ctx.fillText(String(y + 1), boardX + boardWidth + 18, ty);
  }
}

function drawPreviewBoard(ctx, grid, padding, cellSize) {
  const radius = Math.max(2, cellSize * 0.42);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || !cell.code) continue;
      const px = padding + x * cellSize;
      const py = padding + y * cellSize;
      ctx.fillStyle = cell.color;
      ctx.beginPath();
      ctx.arc(px + cellSize / 2, py + cellSize / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.beginPath();
      ctx.arc(px + cellSize / 2 - radius * 0.18, py + cellSize / 2 - radius * 0.18, radius * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(1.1, radius * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawIronedBoard(ctx, grid, padding, cellSize) {
  const radius = Math.max(2, cellSize * 0.28);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || !cell.code) continue;
      const px = padding + x * cellSize - 0.5;
      const py = padding + y * cellSize - 0.5;
      ctx.fillStyle = cell.color;
      roundedRect(ctx, px, py, cellSize + 1, cellSize + 1, radius);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      roundedRect(ctx, px + cellSize * 0.1, py + cellSize * 0.1, cellSize * 0.7, cellSize * 0.26, radius * 0.6);
      ctx.fill();
    }
  }
}

export function exportPatternPNG(renderer, options = {}) {
  const grid = renderer.grid;
  if (!grid) return null;
  const preset = getExportPreset(options);
  const cellSize = options.cellSize || preset.cellSize;
  const includeCoordinates = options.includeCoordinates !== false;
  const includeStats = options.includeStats !== false;
  const title = options.title || "Cyber Beads Pattern";
  const subtitle = options.subtitle || "Coordinate-ready chart with full MARD code labels";
  const outerPadding = 24;
  const coordinateBand = includeCoordinates ? 36 : 0;
  const titleHeight = preset.titleHeight;
  const boardWidth = grid.width * cellSize;
  const boardHeight = grid.height * cellSize;
  const statsHeight = includeStats ? preset.statsMinHeight : 0;
  const canvasWidth = boardWidth + coordinateBand * 2 + outerPadding * 2;
  const canvasHeight = outerPadding * 2 + titleHeight + 18 + boardHeight + coordinateBand * 2 + statsHeight;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  drawPaperBackground(ctx, canvasWidth, canvasHeight);
  drawTitleBlock(ctx, grid, title, subtitle, canvasWidth, outerPadding, outerPadding, titleHeight);
  const boardX = outerPadding + coordinateBand;
  const boardY = outerPadding + titleHeight + 18 + coordinateBand;
  drawPatternBoard(ctx, grid, boardX, boardY, cellSize, includeCoordinates, true);
  if (includeStats) {
    drawStatsBar(ctx, grid, outerPadding, boardY + boardHeight + coordinateBand + 16, canvasWidth - outerPadding * 2);
  }
  return canvas.toDataURL("image/png");
}

export function exportPreviewPNG(renderer, options = {}) {
  const grid = renderer.grid;
  if (!grid) return null;
  const cellSize = options.cellSize || 16;
  const padding = options.padding || 20;
  const boardWidth = grid.width * cellSize;
  const boardHeight = grid.height * cellSize;
  const canvas = createCanvas(boardWidth + padding * 2, boardHeight + padding * 2);
  const ctx = canvas.getContext("2d");
  drawPaperBackground(ctx, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, padding - 8, padding - 8, boardWidth + 16, boardHeight + 16, 18);
  ctx.fill();
  drawPreviewBoard(ctx, grid, padding, cellSize);
  return canvas.toDataURL("image/png");
}

export function exportIronedPNG(renderer, options = {}) {
  const grid = renderer.grid;
  if (!grid) return null;
  const cellSize = options.cellSize || 18;
  const padding = options.padding || 20;
  const boardWidth = grid.width * cellSize;
  const boardHeight = grid.height * cellSize;
  const canvas = createCanvas(boardWidth + padding * 2, boardHeight + padding * 2);
  const ctx = canvas.getContext("2d");
  drawPaperBackground(ctx, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, padding - 8, padding - 8, boardWidth + 16, boardHeight + 16, 18);
  ctx.fill();
  drawIronedBoard(ctx, grid, padding, cellSize);
  return canvas.toDataURL("image/png");
}

export function exportPatternPages() {
  return [];
}
