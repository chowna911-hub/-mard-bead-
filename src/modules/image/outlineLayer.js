function getCell(grid, x, y) {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  return grid.cells[y][x];
}

function isBoundaryCell(grid, x, y) {
  const current = getCell(grid, x, y);
  if (!current || current.isBackground) return false;
  const neighbors = [
    getCell(grid, x - 1, y),
    getCell(grid, x + 1, y),
    getCell(grid, x, y - 1),
    getCell(grid, x, y + 1)
  ];
  return neighbors.some((neighbor) => !neighbor || neighbor.isBackground);
}

function hasStrongInternalLineSample(cell, outlineConfig) {
  if (!cell || cell.isBackground || !cell._sample) return false;
  return (
    outlineConfig.internalLinePreserve &&
    cell._sample.avgLuma <= outlineConfig.lineDarknessThreshold &&
    cell._sample.contrast >= outlineConfig.lineContrastThreshold &&
    cell._sample.avgSaturation <= outlineConfig.lineSaturationThreshold &&
    cell._sample.darkRatio >= 0.58
  );
}

function countOutlineInRow(grid, rowIndex) {
  let count = 0;
  for (let x = 0; x < grid.width; x += 1) {
    if (grid.cells[rowIndex][x].isOutline) count += 1;
  }
  return count;
}

function countOutlineInCol(grid, colIndex) {
  let count = 0;
  for (let y = 0; y < grid.height; y += 1) {
    if (grid.cells[y][colIndex].isOutline) count += 1;
  }
  return count;
}

function rollbackAbnormalBands(grid, fallbackResolver) {
  for (let y = 0; y < grid.height; y += 1) {
    if (countOutlineInRow(grid, y) / grid.width <= 0.7) continue;
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (!cell.isOutline) continue;
      fallbackResolver(cell);
    }
  }

  for (let x = 0; x < grid.width; x += 1) {
    if (countOutlineInCol(grid, x) / grid.height <= 0.7) continue;
    for (let y = 0; y < grid.height; y += 1) {
      const cell = grid.cells[y][x];
      if (!cell.isOutline) continue;
      fallbackResolver(cell);
    }
  }
}

export function generateOutlineLayer(grid, paletteMapper, config) {
  const outlineConfig = config.outline || config;
  if (!outlineConfig.enableOutlineLayer) {
    return grid;
  }

  const outlineColor = paletteMapper.getByCode(outlineConfig.outlineColorCode) || paletteMapper.getDarkestEntry();

  function fallbackResolver(cell) {
    cell.isOutline = false;
    if (cell._sample?.avgRgb) {
      const fallback = paletteMapper.findNearest(cell._sample.avgRgb, { enableHueGuard: true });
      cell.code = fallback.code;
      cell.color = fallback.hex;
      cell.hex = fallback.hex;
      cell.rgb = fallback.rgb.slice();
    } else {
      cell.code = null;
      cell.color = "transparent";
      cell.hex = null;
      cell.rgb = null;
      cell.isBackground = true;
    }
  }

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground) continue;

      const external = isBoundaryCell(grid, x, y);
      const internal = hasStrongInternalLineSample(cell, outlineConfig);
      if (!external && !internal) continue;

      cell.code = outlineColor.code;
      cell.color = outlineColor.hex;
      cell.hex = outlineColor.hex;
      cell.rgb = outlineColor.rgb.slice();
      cell.isOutline = true;
    }
  }

  rollbackAbnormalBands(grid, fallbackResolver);
  return grid;
}
