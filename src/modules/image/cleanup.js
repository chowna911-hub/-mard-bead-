import { createPaletteStat } from "./types.js";

function cloneGrid(grid) {
  return {
    ...grid,
    cells: grid.cells.map((row) => row.map((cell) => ({ ...cell }))),
    paletteStats: {}
  };
}

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

function getNeighbors(grid, x, y) {
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const cell = grid.cells[y + dy]?.[x + dx];
      if (cell) result.push(cell);
    }
  }
  return result;
}

function getActiveMask(grid) {
  const mask = new Uint8Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      mask[y * grid.width + x] = !cell.isBackground && !!cell.code ? 1 : 0;
    }
  }
  return mask;
}

function collectComponents(grid) {
  const mask = getActiveMask(grid);
  const visited = new Uint8Array(mask.length);
  const components = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const startIndex = y * grid.width + x;
      if (!mask[startIndex] || visited[startIndex]) continue;

      const queue = [[x, y]];
      const pixels = [];
      visited[startIndex] = 1;
      let head = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (head < queue.length) {
        const [cx, cy] = queue[head];
        head += 1;
        const currentIndex = cy * grid.width + cx;
        pixels.push([cx, cy]);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
            const ni = ny * grid.width + nx;
            if (!mask[ni] || visited[ni]) continue;
            visited[ni] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      components.push({
        pixels,
        area: pixels.length,
        bounds: { minX, minY, maxX, maxY },
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      });
    }
  }

  return components;
}

function getComponentDistance(a, b) {
  const dx = Math.max(0, Math.max(a.bounds.minX - b.bounds.maxX, b.bounds.minX - a.bounds.maxX));
  const dy = Math.max(0, Math.max(a.bounds.minY - b.bounds.maxY, b.bounds.minY - a.bounds.maxY));
  return Math.max(dx, dy);
}

function removeCell(cell) {
  cell.code = null;
  cell.color = "transparent";
  cell.hex = null;
  cell.rgb = null;
  cell.isBackground = true;
  cell.isOutline = false;
  cell.isHighlight = false;
}

function removeIsolatedCells(grid, config) {
  const cleanupConfig = config.cleanup || config;
  if (!cleanupConfig.removeIsolatedCells) return grid;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || !cell.code) continue;
      const neighbors = getNeighbors(grid, x, y).filter((item) => !item.isBackground && !!item.code);
      const protectedCell = cell.isHighlight || cell.isOutline || (cell._sample?.avgSaturation ?? 0) >= 0.62;
      if (neighbors.length < cleanupConfig.minNeighborCount && !protectedCell) {
        removeCell(cell);
      }
    }
  }

  return grid;
}

function removeDisconnectedComponents(grid, config) {
  const cleanupConfig = config.cleanup || config;
  if (!cleanupConfig.removeDisconnectedComponents) return grid;

  const components = collectComponents(grid);
  if (!components.length) return grid;
  components.sort((a, b) => b.area - a.area);
  const main = components[0];

  for (let index = 1; index < components.length; index += 1) {
    const component = components[index];
    const distance = getComponentDistance(main, component);
    const isProtected =
      cleanupConfig.keepNearbySmallComponents &&
      distance <= cleanupConfig.maxDetachedComponentDistance &&
      component.area >= cleanupConfig.minDetachedComponentArea &&
      component.pixels.some(([x, y]) => {
        const cell = grid.cells[y][x];
        return cell.isHighlight || cell.isOutline || (cell._sample?.avgSaturation ?? 0) >= 0.62;
      });

    if (isProtected) continue;
    if (distance > cleanupConfig.maxDetachedComponentDistance || component.area < cleanupConfig.minDetachedComponentArea) {
      component.pixels.forEach(([x, y]) => removeCell(grid.cells[y][x]));
    }
  }

  return grid;
}

function stabilizeLargeColorRegions(grid, paletteMapper, config) {
  const cleanupConfig = config.cleanup || config;
  if (!cleanupConfig.stabilizeLargeRegions) return grid;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || cell.isOutline || cell.isHighlight) continue;

      const neighbors = getNeighbors(grid, x, y).filter((item) => !item.isBackground && !item.isOutline && !item.isHighlight);
      if (neighbors.length < 4) continue;

      const votes = new Map();
      for (const neighbor of neighbors) {
        votes.set(neighbor.code, (votes.get(neighbor.code) || 0) + 1);
      }
      const sorted = Array.from(votes.entries()).sort((a, b) => b[1] - a[1]);
      const [dominantCode, dominantVotes] = sorted[0] || [];
      if (!dominantCode || dominantVotes < 4 || dominantCode === cell.code) continue;

      const currentMeta = paletteMapper.getByCode(cell.code);
      const dominantMeta = paletteMapper.getByCode(dominantCode);
      if (!currentMeta || !dominantMeta) continue;
      const distance = paletteMapper.distance(currentMeta.rgb, dominantMeta.rgb);
      if (distance <= 34 && (cell._sample?.avgSaturation ?? 0) < 0.55) {
        cell.code = dominantMeta.code;
        cell.color = dominantMeta.hex;
        cell.hex = dominantMeta.hex;
        cell.rgb = dominantMeta.rgb.slice();
      }
    }
  }

  return grid;
}

function removeIsolatedDarkPixels(grid, paletteMapper, config) {
  const outlineConfig = config.outline || config;
  if (!outlineConfig.removeIsolatedDarkPixels) return grid;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (!cell.isOutline) continue;
      const darkNeighbors = getNeighbors(grid, x, y).filter((item) => item.isOutline);
      if (darkNeighbors.length === 0) {
        cell.isOutline = false;
        if (cell._sample?.avgRgb) {
          const fallback = paletteMapper.findNearest(cell._sample.avgRgb);
          cell.code = fallback.code;
          cell.color = fallback.hex;
          cell.hex = fallback.hex;
          cell.rgb = fallback.rgb.slice();
        } else {
          removeCell(cell);
        }
      }
    }
  }

  return grid;
}

export function cleanupGrid(grid, paletteMapper, config) {
  const next = cloneGrid(grid);
  removeIsolatedDarkPixels(next, paletteMapper, config);
  removeIsolatedCells(next, config);
  removeDisconnectedComponents(next, config);
  stabilizeLargeColorRegions(next, paletteMapper, config);
  return rebuildPaletteStats(next, paletteMapper);
}

export {
  removeIsolatedCells,
  removeDisconnectedComponents,
  stabilizeLargeColorRegions
};
