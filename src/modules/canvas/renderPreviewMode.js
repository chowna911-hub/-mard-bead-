export function renderPreviewMode(ctx, renderer, layout) {
  const { grid, selectedCode, progressGrid } = renderer;
  const { cellSize, offsetX, offsetY } = layout;
  const radius = cellSize * 0.38;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const placed = progressGrid?.placed?.[`${x},${y}`];
      const cell = grid.cells[y][x];
      if (!placed || !cell.code) continue;

      const matched = !selectedCode || cell.code === selectedCode;
      const alpha = selectedCode ? (matched ? 0.95 : 0.14) : 0.98;
      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = cell.color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.24;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - radius * 0.18, cy - radius * 0.22, radius * 0.48, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, radius * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
