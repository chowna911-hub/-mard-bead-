function getTextColor(cell) {
  if (!cell.rgb) return "#3f4d64";
  const luma = 0.299 * cell.rgb[0] + 0.587 * cell.rgb[1] + 0.114 * cell.rgb[2];
  return luma < 148 ? "#ffffff" : "#243042";
}

function getOpacityForState(state) {
  if (state === "target-selected-unplaced") return 0.4;
  if (state === "target-selected-placed") return 1;
  if (state === "target-other-placed") return 0.92;
  if (state === "target-unselected") return 0.65;
  if (state === "wrong-placed") return 1;
  return 0;
}

export function renderPatternMode(ctx, renderer, layout) {
  const { grid, hoverCell } = renderer;
  const { cellSize, offsetX, offsetY, headerBand, footerBand, leftBand, rightBand, drawCodes } = layout;
  const widthPx = grid.width * cellSize;
  const heightPx = grid.height * cellSize;

  ctx.save();
  ctx.translate(offsetX + leftBand, offsetY + headerBand);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      const state = renderer.getCellRenderState(cell, x, y);
      const px = x * cellSize;
      const py = y * cellSize;

      if (state !== "background") {
        ctx.globalAlpha = getOpacityForState(state);
        ctx.fillStyle = cell.color || "#ffffff";
        ctx.fillRect(px, py, cellSize, cellSize);
      }

      if (state === "wrong-placed") {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#e0505e";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      }

      if (drawCodes && cell.code && state !== "background" && state !== "target-other-placed") {
        ctx.globalAlpha = state === "target-selected-unplaced" ? 0.7 : 1;
        ctx.fillStyle = getTextColor(cell);
        ctx.font = `${state === "target-selected-placed" ? "800" : "700"} ${Math.min(12, Math.max(9, cellSize * 0.42))}px "Trebuchet MS", "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.code, px + cellSize / 2, py + cellSize / 2 + 0.2);
      }
    }
  }

  ctx.globalAlpha = 1;
  for (let index = 0; index <= grid.width; index += 1) {
    const lineX = index * cellSize;
    ctx.beginPath();
    ctx.lineWidth = index % 10 === 0 ? 1.4 : index % 5 === 0 ? 1 : 0.7;
    ctx.strokeStyle = index % 10 === 0 ? "rgba(129,146,178,0.6)" : index % 5 === 0 ? "rgba(171,185,208,0.48)" : "rgba(193,203,222,0.34)";
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, heightPx);
    ctx.stroke();
  }

  for (let index = 0; index <= grid.height; index += 1) {
    const lineY = index * cellSize;
    ctx.beginPath();
    ctx.lineWidth = index % 10 === 0 ? 1.4 : index % 5 === 0 ? 1 : 0.7;
    ctx.strokeStyle = index % 10 === 0 ? "rgba(129,146,178,0.6)" : index % 5 === 0 ? "rgba(171,185,208,0.48)" : "rgba(193,203,222,0.34)";
    ctx.moveTo(0, lineY);
    ctx.lineTo(widthPx, lineY);
    ctx.stroke();
  }

  ctx.restore();

  if (hoverCell) {
    ctx.save();
    ctx.translate(offsetX + leftBand, offsetY + headerBand);
    ctx.strokeStyle = "rgba(240, 100, 153, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(hoverCell.gridX * cellSize + 1, hoverCell.gridY * cellSize + 1, cellSize - 2, cellSize - 2);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#5c6a83";
  ctx.font = '700 11px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let x = 0; x < grid.width; x += 1) {
    const tx = offsetX + leftBand + x * cellSize + cellSize / 2;
    if (cellSize >= 10 || (x + 1) % 5 === 0) {
      ctx.fillText(String(x + 1), tx, offsetY + headerBand * 0.48);
      ctx.fillText(String(x + 1), tx, offsetY + headerBand + heightPx + footerBand * 0.4);
    }
  }
  for (let y = 0; y < grid.height; y += 1) {
    const ty = offsetY + headerBand + y * cellSize + cellSize / 2;
    if (cellSize >= 10 || (y + 1) % 5 === 0) {
      ctx.fillText(String(y + 1), offsetX + leftBand * 0.48, ty);
      ctx.fillText(String(y + 1), offsetX + leftBand + widthPx + rightBand * 0.5, ty);
    }
  }
  ctx.restore();
}
