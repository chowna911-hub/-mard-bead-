function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function scoreRange(value, idealMin, idealMax, tolerance = 0.2) {
  if (value >= idealMin && value <= idealMax) return 1;
  if (value < idealMin) {
    return clamp01(1 - (idealMin - value) / Math.max(0.0001, tolerance));
  }
  return clamp01(1 - (value - idealMax) / Math.max(0.0001, tolerance));
}

function collectComponents(grid, predicate = null) {
  const visited = new Uint8Array(grid.width * grid.height);
  const components = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;
      const cell = grid.cells[y][x];
      const matches = predicate ? predicate(cell) : (!cell.isBackground && !!cell.code);
      if (visited[index] || !matches) continue;

      const queue = [[x, y]];
      const pixels = [];
      visited[index] = 1;
      let head = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (head < queue.length) {
        const [cx, cy] = queue[head];
        head += 1;
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
            const neighbor = grid.cells[ny][nx];
            const neighborMatches = predicate ? predicate(neighbor) : (!neighbor.isBackground && !!neighbor.code);
            if (visited[ni] || !neighborMatches) continue;
            visited[ni] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      components.push({
        area: pixels.length,
        pixels,
        bounds: { minX, minY, maxX, maxY }
      });
    }
  }

  return components.sort((a, b) => b.area - a.area);
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

  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function getWhitespaceRatio(grid) {
  const bounds = getActiveBounds(grid);
  if (!bounds) return 1;
  const bboxArea = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
  return 1 - bboxArea / Math.max(1, grid.width * grid.height);
}

function getOutlineContinuity(grid, outlineComponents) {
  if (!outlineComponents.length) return 0;
  const outlineArea = outlineComponents.reduce((sum, item) => sum + item.area, 0);
  const mainArea = outlineComponents[0].area;
  return clamp01(mainArea / Math.max(1, outlineArea));
}

function getOutlineNoiseRatio(grid, outlineComponents) {
  const totalOutlineArea = outlineComponents.reduce((sum, item) => sum + item.area, 0);
  if (!totalOutlineArea) return 0;
  const detached = outlineComponents.slice(1).reduce((sum, item) => sum + item.area, 0);
  let thickPixels = 0;
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 1; x < grid.width - 1; x += 1) {
      const cell = grid.cells[y][x];
      if (!cell.isOutline) continue;
      let outlineNeighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (grid.cells[y + dy][x + dx].isOutline) outlineNeighbors += 1;
        }
      }
      if (outlineNeighbors >= 5) thickPixels += 1;
    }
  }
  return clamp01((detached + thickPixels * 0.6) / Math.max(1, totalOutlineArea));
}

function getSmallFeatureStats(grid) {
  let smallDark = 0;
  let smallVivid = 0;
  let highlight = 0;
  let saturated = 0;

  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell.isBackground || !cell._sample) continue;
      const saturation = cell._sample.avgSaturation ?? 0;
      const luma = cell._sample.avgLuma ?? 0;
      if (cell.isHighlight) highlight += 1;
      if (saturation >= 0.62) saturated += 1;
      if (cell._sample.sampleCount <= 8 && cell._sample.contrast >= 22) {
        if (saturation >= 0.58) smallVivid += 1;
        if (luma <= 72) smallDark += 1;
      }
    }
  }

  return {
    smallFeatureRetention: clamp01((smallDark + smallVivid) / Math.max(4, grid.width * 0.18)),
    highlightRetention: clamp01(highlight / Math.max(3, grid.width * 0.12)),
    saturatedFeatureRetention: clamp01(saturated / Math.max(4, grid.width * 0.15))
  };
}

function getColorRegionStability(grid, paletteMapper) {
  let stableVotes = 0;
  let totalVotes = 0;

  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 1; x < grid.width - 1; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground || cell.isOutline || cell.isHighlight) continue;
      totalVotes += 1;
      const neighborCodes = new Map();
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = grid.cells[y + dy][x + dx];
          if (neighbor.isBackground || neighbor.isOutline || neighbor.isHighlight || !neighbor.code) continue;
          neighborCodes.set(neighbor.code, (neighborCodes.get(neighbor.code) || 0) + 1);
        }
      }
      const sorted = Array.from(neighborCodes.entries()).sort((a, b) => b[1] - a[1]);
      const [dominantCode, votes] = sorted[0] || [];
      if (!dominantCode) continue;
      if (dominantCode === cell.code && votes >= 3) {
        stableVotes += 1;
        continue;
      }
      const cellMeta = paletteMapper.getByCode(cell.code);
      const dominantMeta = paletteMapper.getByCode(dominantCode);
      if (cellMeta && dominantMeta && paletteMapper.distance(cellMeta.rgb, dominantMeta.rgb) <= 26 && votes >= 4) {
        stableVotes += 0.6;
      }
    }
  }

  return clamp01(stableVotes / Math.max(1, totalVotes));
}

function getColorCountScore(colorCount, mode) {
  const preferred = {
    icon: [5, 8],
    cartoon: [7, 10],
    portrait: [8, 12],
    sticker: [7, 10]
  };
  const [min, max] = preferred[mode] || preferred.cartoon;
  return scoreRange(colorCount, min, max, 4);
}

function getExportReadability(grid, colorCount) {
  const sizePenalty = grid.width > 72 || grid.height > 72 ? 0.18 : 0;
  const densityPenalty = colorCount > 10 ? 0.12 : 0;
  const shortSide = Math.min(grid.width, grid.height);
  const base = shortSide <= 44 ? 0.76 : shortSide <= 60 ? 0.9 : shortSide <= 72 ? 0.96 : 0.86;
  return clamp01(base - sizePenalty - densityPenalty);
}

function createScoreSummary(metrics, mode) {
  const subjectCoverageScore = scoreRange(metrics.subjectCoverage, 0.85, 0.92, 0.18);
  const backgroundScore = 1 - clamp01(Math.abs(metrics.backgroundRatio - 0.22) / 0.34);
  const outlineContinuityScore = metrics.outlineContinuity;
  const outlineNoiseScore = 1 - metrics.outlineNoiseRatio;
  const isolatedCellScore = 1 - clamp01(metrics.isolatedCellCount / 8);
  const colorCountScore = getColorCountScore(metrics.colorCount, mode);
  const smallFeatureScore = metrics.smallFeatureRetention;
  const highlightScore = metrics.highlightRetention;
  const regionStabilityScore = metrics.colorRegionStability;
  const exportReadabilityScore = metrics.exportReadability;
  const saturatedFeatureScore = metrics.saturatedFeatureRetention;

  const score = (
    subjectCoverageScore * 0.12 +
    backgroundScore * 0.12 +
    outlineContinuityScore * 0.18 +
    outlineNoiseScore * 0.12 +
    isolatedCellScore * 0.10 +
    colorCountScore * 0.10 +
    Math.max(smallFeatureScore, saturatedFeatureScore) * 0.12 +
    highlightScore * 0.10 +
    regionStabilityScore * 0.10 +
    exportReadabilityScore * 0.04
  );

  return {
    score: Number(score.toFixed(4)),
    scoreParts: {
      subjectCoverageScore,
      backgroundScore,
      outlineContinuityScore,
      outlineNoiseScore,
      isolatedCellScore,
      colorCountScore,
      smallFeatureScore,
      highlightScore,
      regionStabilityScore,
      exportReadabilityScore
    }
  };
}

function getReasonAndWarningTexts(metrics, scoreParts, mode) {
  const reasons = [];
  const warnings = [];

  if (scoreParts.outlineContinuityScore >= 0.82) reasons.push("轮廓连续性较好");
  if (scoreParts.outlineNoiseScore >= 0.82) reasons.push("黑线噪点控制较稳");
  if (scoreParts.smallFeatureScore >= 0.66) reasons.push("小特征保留较完整");
  if (scoreParts.highlightScore >= 0.58) reasons.push("高光和浅色内部结构保留较好");
  if (scoreParts.colorCountScore >= 0.78) reasons.push("色号数量落在当前模式的合理区间");
  if (scoreParts.regionStabilityScore >= 0.72) reasons.push("大色块更干净，散点较少");
  if (scoreParts.subjectCoverageScore >= 0.8) reasons.push("主体占板率比较合理");

  if (metrics.outlineContinuity < 0.58) warnings.push("轮廓可能存在断裂");
  if (metrics.outlineNoiseRatio > 0.24) warnings.push("黑线偏重或存在非线性黑块");
  if (metrics.isolatedCellCount > 2) warnings.push("仍有孤立有效格或小噪点");
  if (scoreParts.smallFeatureScore < 0.42) warnings.push("小细节可能丢失较多");
  if (scoreParts.highlightScore < 0.35) warnings.push("内部高光保留一般");
  if (scoreParts.colorCountScore < 0.45) warnings.push(`色号数量不太适合 ${mode} 模式`);
  if (scoreParts.exportReadabilityScore < 0.7) warnings.push("导出图纸会更大，阅读与制作成本更高");
  if (metrics.subjectCoverage > 0.94) warnings.push("主体偏贴边，局部细节可能被挤压");
  if (metrics.subjectCoverage < 0.8) warnings.push("主体偏小，细节利用率不高");

  return { reasons, warnings };
}

export function analyzeGridQuality(grid, sourceAnalysis = {}) {
  const total = grid.width * grid.height;
  let active = 0;
  let transparent = 0;
  let outline = 0;
  let highlight = 0;
  let touchingEdge = 0;
  let internalTransparentHole = 0;
  const colorCounts = [];
  const components = collectComponents(grid);
  const outlineComponents = collectComponents(grid, (cell) => cell.isOutline);
  const bounds = getActiveBounds(grid);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y][x];
      if (cell.isBackground) {
        transparent += 1;
        const isInterior = x > 0 && y > 0 && x < grid.width - 1 && y < grid.height - 1;
        if (isInterior) {
          const activeNeighbors =
            Number(!grid.cells[y - 1][x].isBackground) +
            Number(!grid.cells[y + 1][x].isBackground) +
            Number(!grid.cells[y][x - 1].isBackground) +
            Number(!grid.cells[y][x + 1].isBackground);
          if (activeNeighbors >= 3) internalTransparentHole += 1;
        }
        continue;
      }
      active += 1;
      if (cell.isOutline) outline += 1;
      if (cell.isHighlight) highlight += 1;
      if (x === 0 || y === 0 || x === grid.width - 1 || y === grid.height - 1) touchingEdge += 1;
    }
  }

  Object.values(grid.paletteStats).forEach((stat) => colorCounts.push(stat.count));
  colorCounts.sort((a, b) => b - a);

  const bboxArea = bounds ? (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1) : 0;
  const subjectCoverage = bboxArea / Math.max(1, total);
  const detachedComponentArea = components.slice(1).reduce((sum, item) => sum + item.area, 0);
  const featureStats = getSmallFeatureStats(grid);
  const mode = sourceAnalysis.mode || sourceAnalysis.config?.mode || "cartoon";
  const paletteMapper = sourceAnalysis.paletteMapper;

  const metrics = {
    subjectCoverage,
    backgroundRatio: transparent / Math.max(1, total),
    outlineContinuity: getOutlineContinuity(grid, outlineComponents),
    outlineNoiseRatio: getOutlineNoiseRatio(grid, outlineComponents),
    isolatedCellCount: detachedComponentArea,
    colorCount: Object.keys(grid.paletteStats).length,
    smallFeatureRetention: featureStats.smallFeatureRetention,
    highlightRetention: featureStats.highlightRetention,
    saturatedFeatureRetention: featureStats.saturatedFeatureRetention,
    colorRegionStability: paletteMapper ? getColorRegionStability(grid, paletteMapper) : 0.5,
    exportReadability: getExportReadability(grid, Object.keys(grid.paletteStats).length)
  };

  const report = {
    activeRatio: active / Math.max(1, total),
    transparentRatio: transparent / Math.max(1, total),
    outlineRatio: active ? outline / active : 0,
    highlightRatio: active ? highlight / active : 0,
    edgeTouchRatio: active ? touchingEdge / active : 0,
    internalTransparentHoleRatio: active ? internalTransparentHole / active : 0,
    colorCount: metrics.colorCount,
    dominantColorRatio: active && colorCounts.length ? colorCounts[0] / active : 0,
    detachedComponentCount: Math.max(0, components.length - 1),
    detachedComponentArea,
    whitespaceRatio: getWhitespaceRatio(grid),
    metrics,
    warnings: [],
    reasons: []
  };

  const summary = createScoreSummary(metrics, mode);
  report.score = summary.score;
  report.scoreParts = summary.scoreParts;

  const texts = getReasonAndWarningTexts(metrics, summary.scoreParts, mode);
  report.reasons.push(...texts.reasons);
  report.warnings.push(...texts.warnings);

  if (report.edgeTouchRatio > 0.18) report.warnings.push("subject_touches_edge");
  if (report.outlineRatio > 0.34) report.warnings.push("outline_too_heavy");
  if (report.transparentRatio < 0.06) report.warnings.push("too_little_transparent");
  if (report.colorCount < 4) report.warnings.push("too_few_colors");
  if (report.colorCount > 12) report.warnings.push("too_many_colors");
  if (report.dominantColorRatio > 0.72) report.warnings.push("dominant_color_too_strong");
  if (report.highlightRatio > 0.18) report.warnings.push("highlight_too_wide");
  if (report.detachedComponentCount > 0 && report.detachedComponentArea > 2) report.warnings.push("detached_noise_exists");
  if (report.internalTransparentHoleRatio > 0.035) report.warnings.push("too_many_internal_holes");
  if (report.whitespaceRatio > 0.62) report.warnings.push("too_much_whitespace");

  return report;
}

export function autoTuneConfigIfNeeded(config, report, attemptedRefit = false) {
  if (attemptedRefit || !report.warnings.length) {
    return { nextConfig: config, shouldRetry: false };
  }

  const nextConfig = structuredClone(config);
  let changed = false;

  if (report.warnings.includes("subject_touches_edge")) {
    nextConfig.subjectFitRatio = Math.max(0.84, (config.subjectFitRatio || 0.88) - 0.02);
    nextConfig.paddingCells = Math.min(3, (config.paddingCells || 2) + 1);
    changed = true;
  }
  if (report.warnings.includes("outline_too_heavy")) {
    nextConfig.outline.lineDarknessThreshold = Math.max(42, config.outline.lineDarknessThreshold - 4);
    nextConfig.outline.lineContrastThreshold = Math.min(62, config.outline.lineContrastThreshold + 4);
    changed = true;
  }
  if (report.warnings.includes("too_little_transparent")) {
    nextConfig.downsample.minSubjectRatio = Math.min(0.42, config.downsample.minSubjectRatio + 0.03);
    changed = true;
  }
  if (report.warnings.includes("too_many_colors")) {
    nextConfig.colorQuantization.maxColors = Math.max(6, config.colorQuantization.maxColors - 1);
    changed = true;
  }
  if (report.warnings.includes("too_few_colors")) {
    nextConfig.colorQuantization.maxColors = Math.min(10, config.colorQuantization.maxColors + 1);
    changed = true;
  }
  if (report.warnings.includes("detached_noise_exists")) {
    nextConfig.cleanup.minNeighborCount = Math.min(3, (config.cleanup.minNeighborCount || 2) + 1);
    nextConfig.cleanup.maxDetachedComponentDistance = Math.max(1, (config.cleanup.maxDetachedComponentDistance || 2) - 1);
    changed = true;
  }
  if (report.warnings.includes("too_many_internal_holes")) {
    nextConfig.downsample.minSubjectRatio = Math.max(0.28, (config.downsample.minSubjectRatio || 0.35) - 0.02);
    changed = true;
  }
  if (report.warnings.includes("too_much_whitespace")) {
    nextConfig.finalGrid.paddingCells = Math.max(1, (config.finalGrid.paddingCells || 2) - 1);
    nextConfig.subjectFitRatio = Math.min(0.92, (config.subjectFitRatio || 0.88) + 0.01);
    changed = true;
  }

  return {
    nextConfig,
    shouldRetry: changed
  };
}
