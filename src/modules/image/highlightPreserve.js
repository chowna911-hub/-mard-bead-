function getLuma(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function getSaturation(rgb) {
  const nr = rgb[0] / 255;
  const ng = rgb[1] / 255;
  const nb = rgb[2] / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  if (max === 0) return 0;
  return (max - min) / max;
}

function getNeighbors(grid, x, y) {
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const next = grid.cells[y + dy]?.[x + dx];
      if (next && !next.isBackground) {
        neighbors.push(next);
      }
    }
  }
  return neighbors;
}

export function detectHighlightComponents(grid, config) {
  const featureConfig = config.feature || config;
  const candidates = [];

  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell.isBackground || !cell._sample) continue;
      const sampleRgb = cell._sample.avgRgb || cell.rgb;
      const luma = getLuma(sampleRgb);
      const saturation = getSaturation(sampleRgb);
      if (
        luma >= featureConfig.highlightLightnessThreshold &&
        saturation <= 0.24 &&
        cell._sample.contrast >= featureConfig.highlightContrastThreshold
      ) {
        candidates.push(cell);
      }
    }
  }

  return candidates;
}

export function preserveInternalHighlight(grid, paletteMapper, config) {
  const candidates = detectHighlightComponents(grid, config);
  for (const cell of candidates) {
    const nearest = paletteMapper.findNearest(cell._sample.avgRgb || cell.rgb);
    cell.code = nearest.code;
    cell.color = nearest.hex;
    cell.hex = nearest.hex;
    cell.rgb = nearest.rgb.slice();
    cell.isHighlight = true;
  }
  return grid;
}

export function thinThickHighlight(grid) {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (!cell.isHighlight) continue;
      const neighbors = getNeighbors(grid, x, y).filter((item) => item.isHighlight);
      if (neighbors.length >= 7) {
        cell.isHighlight = false;
      }
    }
  }
  return grid;
}

export function removeIsolatedHighlightPixels(grid, paletteMapper) {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (!cell.isHighlight) continue;
      const neighbors = getNeighbors(grid, x, y).filter((item) => item.isHighlight);
      if (neighbors.length === 0) {
        cell.isHighlight = false;
        if (cell._sample?.avgRgb) {
          const fallback = paletteMapper.findNearest(cell._sample.avgRgb);
          cell.code = fallback.code;
          cell.color = fallback.hex;
          cell.hex = fallback.hex;
          cell.rgb = fallback.rgb.slice();
        }
      }
    }
  }
  return grid;
}
