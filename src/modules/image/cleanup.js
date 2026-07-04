import { createPaletteStat } from "./types.js";
import { getColorProfile, areHueGroupsCompatible } from "./colorUtils.js";

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
      const protectedCell = cell.isHighlight || cell.isOutline || cell._protectedLocalColor || (cell._sample?.avgSaturation ?? 0) >= 0.62;
      if (neighbors.length < cleanupConfig.minNeighborCount && !protectedCell) {
        removeCell(cell);
      }
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
      if (cell.isBackground || cell.isOutline || cell.isHighlight || cell._protectedLocalColor) continue;

      const neighbors = getNeighbors(grid, x, y).filter((item) => (
        !item.isBackground
        && !item.isOutline
        && !item.isHighlight
        && !item._protectedLocalColor
      ));
      if (neighbors.length < 4) continue;

      const votes = new Map();
      for (const neighbor of neighbors) {
        const neighborMeta = paletteMapper.getByCode(neighbor.code);
        const cellMeta = paletteMapper.getByCode(cell.code);
        if (!neighborMeta || !cellMeta) continue;
        if (!areHueGroupsCompatible(cellMeta.hueGroup, neighborMeta.hueGroup) && cellMeta.hueGroup !== neighborMeta.hueGroup) {
          continue;
        }
        votes.set(neighbor.code, (votes.get(neighbor.code) || 0) + 1);
      }

      const sorted = Array.from(votes.entries()).sort((a, b) => b[1] - a[1]);
      const [dominantCode, dominantVotes] = sorted[0] || [];
      if (!dominantCode || dominantVotes < 4 || dominantCode === cell.code) continue;

      const currentMeta = paletteMapper.getByCode(cell.code);
      const dominantMeta = paletteMapper.getByCode(dominantCode);
      if (!currentMeta || !dominantMeta) continue;
      const currentProfile = getColorProfile(cell._sample?.avgRgb || currentMeta.rgb);
      if (!areHueGroupsCompatible(currentProfile.hueGroup, dominantMeta.hueGroup) && currentProfile.hueGroup !== dominantMeta.hueGroup) {
        continue;
      }

      const next = paletteMapper.findNearest(cell._sample?.avgRgb || currentMeta.rgb, {
        enableHueGuard: true,
        allowedCodes: [dominantCode, cell.code]
      });
      cell.code = next.code;
      cell.color = next.hex;
      cell.hex = next.hex;
      cell.rgb = next.rgb.slice();
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
          const fallback = paletteMapper.findNearest(cell._sample.avgRgb, {
            enableHueGuard: true
          });
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
  stabilizeLargeColorRegions(next, paletteMapper, config);
  return rebuildPaletteStats(next, paletteMapper);
}

export {
  removeIsolatedCells,
  stabilizeLargeColorRegions
};
