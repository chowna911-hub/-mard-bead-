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

export function renderIronedMode(ctx, renderer, layout) {
  const { grid, selectedCode, progressGrid, ironedSource } = renderer;
  const { cellSize, offsetX, offsetY } = layout;
  const radius = Math.max(2, cellSize * 0.28);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      const placed = progressGrid?.placed?.[`${x},${y}`];
      const shouldDraw = ironedSource === "full" ? !!cell.code : !!placed;
      if (!shouldDraw || !cell.code) continue;

      const matched = !selectedCode || cell.code === selectedCode;
      const alpha = selectedCode ? (matched ? 0.98 : 0.14) : 1;
      const px = x * cellSize - 0.5;
      const py = y * cellSize - 0.5;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = cell.color;
      roundedRect(ctx, px, py, cellSize + 1, cellSize + 1, radius);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.18;
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, px + cellSize * 0.1, py + cellSize * 0.1, cellSize * 0.72, cellSize * 0.32, radius * 0.6);
      ctx.fill();
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
