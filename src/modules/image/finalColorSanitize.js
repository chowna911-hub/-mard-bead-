import { getColorProfile, areHueGroupsCompatible } from "./colorUtils.js";
import { createPaletteStat } from "./types.js";

function getCellKey(x, y) {
  return `${x},${y}`;
}

export function detectHueDriftCell(cell, paletteMapper, regionModel) {
  if (!cell?.code || cell.isBackground || cell.isOutline || cell.isHighlight || cell._protectedLocalColor) {
    return false;
  }
  if (!cell._sample?.avgRgb) return false;

  const sourceProfile = getColorProfile(cell._sample.avgRgb);
  const mapped = paletteMapper.getByCode(cell.code);
  if (!mapped) return false;

  if (sourceProfile.hueGroup === mapped.hueGroup || areHueGroupsCompatible(sourceProfile.hueGroup, mapped.hueGroup)) {
    return false;
  }

  return !regionModel?.allowedCodes?.includes(cell.code);
}

export function getNearestAllowedColorForRegion(cell, regionModel, paletteMapper) {
  if (!regionModel?.allowedCodes?.length) {
    return paletteMapper.findNearest(cell._sample?.avgRgb || cell.rgb, { enableHueGuard: true });
  }
  return paletteMapper.findNearest(cell._sample?.avgRgb || cell.rgb, {
    enableHueGuard: true,
    allowedCodes: regionModel.allowedCodes
  });
}

export function rollbackHueDriftCell(cell, regionModel, paletteMapper) {
  const next = getNearestAllowedColorForRegion(cell, regionModel, paletteMapper);
  if (!next) return;
  cell.code = next.code;
  cell.color = next.hex;
  cell.hex = next.hex;
  cell.rgb = next.rgb.slice();
}

export function sanitizeRegionByAllowedPalette(grid, regionState, paletteMapper) {
  if (!regionState?.models?.length) return grid;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      const regionId = regionState.regionIdMap.get(getCellKey(x, y));
      const regionModel = regionState.models[regionId];
      if (detectHueDriftCell(cell, paletteMapper, regionModel)) {
        rollbackHueDriftCell(cell, regionModel, paletteMapper);
      }
    }
  }

  return grid;
}

export function finalColorSanitize(grid, paletteMapper, regionState) {
  sanitizeRegionByAllowedPalette(grid, regionState, paletteMapper);
  const stats = {};
  grid.cells.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.code || cell.isBackground) return;
      const meta = paletteMapper.getByCode(cell.code);
      if (!stats[cell.code]) {
        stats[cell.code] = createPaletteStat(meta, 0);
      }
      stats[cell.code].count += 1;
    });
  });
  grid.paletteStats = stats;
  return grid;
}
