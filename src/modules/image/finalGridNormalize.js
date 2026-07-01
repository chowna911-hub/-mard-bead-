import { createPaletteStat } from "./types.js";

function rebuildPaletteStats(grid, paletteMapper) {
  const stats = {};
  for (const row of grid.cells) {
    for (const cell of row) {
      if (!cell.code || cell.isBackground) continue;
      const meta = paletteMapper.getByCode(cell.code);
      if (!stats[cell.code]) {
        stats[cell.code] = createPaletteStat(meta, 0);
      }
      stats[cell.code].count += 1;
    }
  }
  grid.paletteStats = stats;
  return grid;
}

function getActiveBounds(grid) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || !cell.code) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

export function normalizeFinalGrid(grid, paletteMapper, options = {}) {
  const finalConfig = options.finalGrid || options;
  if (!finalConfig.enableAutoCrop) {
    return rebuildPaletteStats(grid, paletteMapper);
  }

  const bounds = getActiveBounds(grid);
  if (!bounds) {
    return rebuildPaletteStats(grid, paletteMapper);
  }

  const minPadding = finalConfig.minPaddingCells ?? 1;
  const maxPadding = finalConfig.maxPaddingCells ?? 3;
  let padding = Math.max(minPadding, Math.min(maxPadding, finalConfig.paddingCells ?? 2));

  if (bounds.minX <= padding || bounds.minY <= padding || (grid.width - 1 - bounds.maxX) <= padding || (grid.height - 1 - bounds.maxY) <= padding) {
    padding = Math.min(maxPadding, padding + 1);
  }

  const cropMinX = Math.max(0, bounds.minX - padding);
  const cropMinY = Math.max(0, bounds.minY - padding);
  const cropMaxX = Math.min(grid.width - 1, bounds.maxX + padding);
  const cropMaxY = Math.min(grid.height - 1, bounds.maxY + padding);
  const width = cropMaxX - cropMinX + 1;
  const height = cropMaxY - cropMinY + 1;

  const nextGrid = {
    width,
    height,
    cells: Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        const source = grid.cells[cropMinY + y][cropMinX + x];
        return {
          ...source,
          x,
          y
        };
      })
    ),
    paletteStats: {}
  };

  return rebuildPaletteStats(nextGrid, paletteMapper);
}
