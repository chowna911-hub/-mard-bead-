import { getColorProfile, areHueGroupsCompatible, weightedDistance } from "./colorUtils.js";

function getCellKey(x, y) {
  return `${x},${y}`;
}

function getNeighbors(grid, x, y) {
  const list = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const cell = grid.cells[y + dy]?.[x + dx];
      if (cell) list.push(cell);
    }
  }
  return list;
}

function averageRgb(values) {
  const sum = [0, 0, 0];
  for (const rgb of values) {
    sum[0] += rgb[0];
    sum[1] += rgb[1];
    sum[2] += rgb[2];
  }
  return sum.map((value) => Math.round(value / values.length));
}

export function detectSmallStableColorRegions(grid, config) {
  const localConfig = config.localStableColor || {};
  if (!localConfig.enable) return [];

  const visited = new Set();
  const components = [];
  const maxArea = Math.max(2, Math.floor(grid.width * grid.height * (localConfig.maxComponentAreaRatio || 0.2)));

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || cell.isOutline || !cell._sample?.avgRgb) continue;
      const key = getCellKey(x, y);
      if (visited.has(key)) continue;

      const seedProfile = getColorProfile(cell._sample.avgRgb);
      const queue = [[x, y]];
      const pixels = [];
      const sourceColors = [];
      const hueVotes = new Map();
      visited.add(key);

      while (queue.length) {
        const [cx, cy] = queue.shift();
        const current = grid.cells[cy][cx];
        if (!current?._sample?.avgRgb || current.isBackground || current.isOutline) continue;
        const sampleProfile = getColorProfile(current._sample.avgRgb);
        if (!areHueGroupsCompatible(seedProfile.hueGroup, sampleProfile.hueGroup)) continue;
        if (weightedDistance(seedProfile.rgb, sampleProfile.rgb) > (localConfig.localColorDistanceThreshold || 42)) continue;

        pixels.push([cx, cy]);
        sourceColors.push(current._sample.avgRgb);
        hueVotes.set(sampleProfile.hueGroup, (hueVotes.get(sampleProfile.hueGroup) || 0) + 1);

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            const neighbor = grid.cells[ny]?.[nx];
            if (!neighbor || neighbor.isBackground || neighbor.isOutline || !neighbor._sample?.avgRgb) continue;
            const nextKey = getCellKey(nx, ny);
            if (visited.has(nextKey)) continue;
            visited.add(nextKey);
            queue.push([nx, ny]);
          }
        }
      }

      if (pixels.length < (localConfig.minComponentAreaCells || 2) || pixels.length > maxArea) continue;

      const dominantHueGroup = Array.from(hueVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || seedProfile.hueGroup;
      const avgRgb = averageRgb(sourceColors);
      const avgProfile = getColorProfile(avgRgb);
      const hueConsistency = (hueVotes.get(dominantHueGroup) || 0) / pixels.length;
      const contrast = Math.max(...sourceColors.map((rgb) => getColorProfile(rgb).luma)) - Math.min(...sourceColors.map((rgb) => getColorProfile(rgb).luma));

      if (hueConsistency < (localConfig.minHueConsistency || 0.65)) continue;
      if (avgProfile.saturation < (localConfig.minSaturation || 0.18) && !localConfig.preserveMediumSaturationColors) continue;
      if (contrast < (localConfig.minLocalContrast || 18)) continue;

      components.push({
        id: `local_${components.length + 1}`,
        pixels,
        cells: new Set(pixels.map(([px, py]) => getCellKey(px, py))),
        hueGroup: dominantHueGroup,
        sourceColor: avgRgb,
        bbox: pixels.reduce((bbox, [px, py]) => ({
          minX: Math.min(bbox.minX, px),
          minY: Math.min(bbox.minY, py),
          maxX: Math.max(bbox.maxX, px),
          maxY: Math.max(bbox.maxY, py)
        }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }),
        protected: true
      });
    }
  }

  return components;
}

export function preserveLocalStableColors(grid, paletteMapper, config) {
  const components = detectSmallStableColorRegions(grid, config);
  if (!components.length) return { grid, components };

  for (const component of components) {
    const mapped = paletteMapper.findNearest(component.sourceColor, {
      enableHueGuard: true
    });
    component.mardColor = mapped;

    component.pixels.forEach(([x, y]) => {
      const cell = grid.cells[y][x];
      if (cell.isBackground || cell.isOutline || cell.isHighlight) return;
      const sampleRgb = cell._sample?.avgRgb || cell.rgb;
      const sampleHue = getColorProfile(sampleRgb).hueGroup;
      if (!areHueGroupsCompatible(sampleHue, mapped.hueGroup) && sampleHue !== mapped.hueGroup) {
        return;
      }
      cell.code = mapped.code;
      cell.color = mapped.hex;
      cell.hex = mapped.hex;
      cell.rgb = mapped.rgb.slice();
      cell._localComponentId = component.id;
      cell._protectedLocalColor = true;
    });
  }

  return { grid, components };
}
