function neighborCoords(x, y, width, height) {
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      result.push([nx, ny, dx, dy]);
    }
  }
  return result;
}

function isPotentialLine(cell, config) {
  if (!cell || cell.isBackground || !cell._sample) return false;
  const sample = cell._sample;
  return (
    sample.avgLuma <= config.lineDarknessThreshold &&
    sample.contrast >= config.lineContrastThreshold &&
    (sample.avgSaturation <= config.lineSaturationThreshold || sample.darkRatio >= 0.38)
  );
}

function cloneGrid(grid) {
  return {
    ...grid,
    paletteStats: { ...grid.paletteStats },
    cells: grid.cells.map((row) => row.map((cell) => ({ ...cell })))
  };
}

function recountPalette(grid) {
  grid.paletteStats = {};
  for (const row of grid.cells) {
    for (const cell of row) {
      if (!cell.code) continue;
      grid.paletteStats[cell.code] = (grid.paletteStats[cell.code] || 0) + 1;
    }
  }
}

function applyThinCleanup(grid, config, blackEntry) {
  const { width, height } = grid;
  const next = cloneGrid(grid);
  const lineMask = Array.from({ length: height }, () => Array.from({ length: width }, () => false));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      lineMask[y][x] = isPotentialLine(grid.cells[y][x], config);
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!lineMask[y][x]) continue;

      const neighbors = neighborCoords(x, y, width, height);
      const count = neighbors.reduce((sum, [nx, ny]) => sum + (lineMask[ny][nx] ? 1 : 0), 0);
      const horizontal = (x > 0 && lineMask[y][x - 1]) && (x < width - 1 && lineMask[y][x + 1]);
      const vertical = (y > 0 && lineMask[y - 1][x]) && (y < height - 1 && lineMask[y + 1][x]);
      const diagonalA = (x > 0 && y > 0 && lineMask[y - 1][x - 1]) && (x < width - 1 && y < height - 1 && lineMask[y + 1][x + 1]);
      const diagonalB = (x < width - 1 && y > 0 && lineMask[y - 1][x + 1]) && (x > 0 && y < height - 1 && lineMask[y + 1][x - 1]);

      if (count < config.lineIsolatedMinNeighbors) {
        lineMask[y][x] = false;
        continue;
      }

      if (config.maxLineWidth === 1 && count >= 6 && !(horizontal || vertical || diagonalA || diagonalB)) {
        lineMask[y][x] = false;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (lineMask[y][x]) continue;
      const cell = grid.cells[y][x];
      if (cell.isBackground || !cell._sample) continue;

      const left = x > 0 && lineMask[y][x - 1];
      const right = x < width - 1 && lineMask[y][x + 1];
      const up = y > 0 && lineMask[y - 1][x];
      const down = y < height - 1 && lineMask[y + 1][x];
      const upLeft = x > 0 && y > 0 && lineMask[y - 1][x - 1];
      const upRight = x < width - 1 && y > 0 && lineMask[y - 1][x + 1];
      const downLeft = x > 0 && y < height - 1 && lineMask[y + 1][x - 1];
      const downRight = x < width - 1 && y < height - 1 && lineMask[y + 1][x + 1];

      const shouldReconnect =
        cell._sample.avgLuma <= config.lineDarknessThreshold + 18 &&
        (
          (left && right) ||
          (up && down) ||
          (upLeft && downRight) ||
          (upRight && downLeft)
        );

      if (shouldReconnect) {
        lineMask[y][x] = true;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nextCell = next.cells[y][x];
      if (!lineMask[y][x]) {
        nextCell.isLine = false;
        continue;
      }
      nextCell.code = blackEntry.code;
      nextCell.color = blackEntry.hex;
      nextCell.rgb = blackEntry.rgb.slice();
      nextCell.isLine = true;
    }
  }

  recountPalette(next);
  return next;
}

function enhanceCartoonFace(grid, paletteMapper, config) {
  const next = cloneGrid(grid);
  const faceMinY = Math.floor(grid.height * config.faceZoneTopRatio);
  const faceMaxY = Math.floor(grid.height * config.faceZoneBottomRatio);
  const faceMinX = Math.floor(grid.width * config.faceZoneSideRatio);
  const faceMaxX = Math.ceil(grid.width * (1 - config.faceZoneSideRatio));
  const darkEntry = paletteMapper.getDarkestEntry();

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = next.cells[y][x];
      if (cell.isBackground || !cell._sample) continue;
      const insideFaceZone = y >= faceMinY && y <= faceMaxY && x >= faceMinX && x <= faceMaxX;
      if (!insideFaceZone && cell.isLine && cell._sample.darkRatio < 0.32) {
        cell.code = null;
        cell.color = "transparent";
        cell.rgb = null;
        cell.isBackground = true;
        cell.isLine = false;
      }
      if (insideFaceZone && cell.code === darkEntry.code) {
        const left = x > 0 ? next.cells[y][x - 1] : null;
        const right = x < grid.width - 1 ? next.cells[y][x + 1] : null;
        const up = y > 0 ? next.cells[y - 1][x] : null;
        const down = y < grid.height - 1 ? next.cells[y + 1][x] : null;
        const crossDarkCount = [left, right, up, down].filter((item) => item && item.code === darkEntry.code).length;
        if (crossDarkCount >= 3) {
          const neighbors = [left, right, up, down].filter((item) => item && !item.isBackground && item.code !== darkEntry.code);
          if (neighbors.length) {
            const substitute = neighbors[0];
            cell.code = substitute.code;
            cell.color = substitute.color;
            cell.rgb = substitute.rgb ? substitute.rgb.slice() : null;
            cell.isLine = false;
          }
        }
      }
    }
  }

  recountPalette(next);
  return next;
}

export function applyLinePreserve(grid, paletteMapper, config) {
  if (!config.enableLinePreserve) {
    return grid;
  }

  const blackEntry = paletteMapper.getDarkestEntry();
  let next = applyThinCleanup(grid, config, blackEntry);

  if (config.detailEnhanceMode === "cartoon-face" || config.detailEnhanceMode === "icon") {
    next = enhanceCartoonFace(next, paletteMapper, config);
  }

  return next;
}
