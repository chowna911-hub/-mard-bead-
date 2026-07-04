import { getColorProfile, areHueGroupsCompatible } from "./colorUtils.js";

function getCellKey(x, y) {
  return `${x},${y}`;
}

export function buildRegionColorModel(grid, paletteMapper) {
  const visited = new Set();
  const regionIdMap = new Map();
  const models = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground) continue;
      const key = getCellKey(x, y);
      if (visited.has(key)) continue;

      const queue = [[x, y]];
      const codeVotes = new Map();
      const hueVotes = new Map();
      const cells = [];
      visited.add(key);

      while (queue.length) {
        const [cx, cy] = queue.shift();
        const current = grid.cells[cy]?.[cx];
        if (!current || current.isBackground) continue;
        const currentKey = getCellKey(cx, cy);
        cells.push([cx, cy]);
        regionIdMap.set(currentKey, models.length);
        codeVotes.set(current.code, (codeVotes.get(current.code) || 0) + 1);
        const meta = paletteMapper.getByCode(current.code);
        const hueGroup = meta?.hueGroup || getColorProfile(current.rgb || [0, 0, 0]).hueGroup;
        hueVotes.set(hueGroup, (hueVotes.get(hueGroup) || 0) + 1);

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            const neighbor = grid.cells[ny]?.[nx];
            if (!neighbor || neighbor.isBackground) continue;
            const nextKey = getCellKey(nx, ny);
            if (visited.has(nextKey)) continue;
            visited.add(nextKey);
            queue.push([nx, ny]);
          }
        }
      }

      const dominantCodes = Array.from(codeVotes.entries()).sort((a, b) => b[1] - a[1]).map(([code]) => code);
      const dominantHueGroups = Array.from(hueVotes.entries()).sort((a, b) => b[1] - a[1]).map(([group]) => group);
      const allowedCodes = new Set(dominantCodes.slice(0, 4));

      paletteMapper.palette.forEach((entry) => {
        if (dominantHueGroups.some((group) => group === entry.hueGroup || areHueGroupsCompatible(group, entry.hueGroup))) {
          allowedCodes.add(entry.code);
        }
      });

      models.push({
        regionId: models.length,
        dominantHueGroups,
        dominantCodes,
        allowedCodes: Array.from(allowedCodes),
        protectedComponentIds: Array.from(new Set(cells.map(([cx, cy]) => grid.cells[cy][cx]._localComponentId).filter(Boolean)))
      });
    }
  }

  return { models, regionIdMap };
}
