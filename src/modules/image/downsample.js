import { createEmptyCell, createPaletteStat } from "./types.js";

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

function getPixel(data, width, x, y) {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function getRepresentativeColor(colors, config) {
  if (!colors.length) return [0, 0, 0];
  if (config.downsample.useMedianColor) {
    return [
      median(colors.map((rgb) => rgb[0])),
      median(colors.map((rgb) => rgb[1])),
      median(colors.map((rgb) => rgb[2]))
    ];
  }

  const sum = [0, 0, 0];
  for (const rgb of colors) {
    sum[0] += rgb[0];
    sum[1] += rgb[1];
    sum[2] += rgb[2];
  }
  return sum.map((value) => Math.round(value / colors.length));
}

function getVoteLeader(votes) {
  let leader = null;
  let bestScore = -1;
  for (const [code, score] of votes.entries()) {
    if (score > bestScore) {
      bestScore = score;
      leader = code;
    }
  }
  return leader;
}

function chooseMappedColor(repRgb, paletteMapper, limitedPalette) {
  const palette = limitedPalette?.length ? limitedPalette : paletteMapper.palette;
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of palette) {
    const currentDistance = paletteMapper.distance(repRgb, entry.rgb);
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      best = entry;
    }
  }

  return best;
}

function incPaletteStat(stats, meta) {
  if (!stats[meta.code]) {
    stats[meta.code] = createPaletteStat(meta, 0);
  }
  stats[meta.code].count += 1;
}

function isNearBackground(rgb, backgroundEstimate) {
  if (!backgroundEstimate?.candidates?.length) return false;
  return backgroundEstimate.candidates.some((candidate) => (
    backgroundEstimate.distance(rgb, candidate) <= backgroundEstimate.bgThreshold + 6
  ));
}

export function downsampleToBeadGrid({
  imageData,
  width,
  height,
  subjectMask,
  fit,
  targetWidth,
  targetHeight,
  paletteMapper,
  limitedPalette,
  semanticModel,
  backgroundEstimate,
  config
}) {
  const cells = [];
  const paletteStats = {};
  const left = fit.offsetX;
  const top = fit.offsetY;
  const usableWidth = fit.scaledWidth;
  const usableHeight = fit.scaledHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const row = [];

    for (let x = 0; x < targetWidth; x += 1) {
      const cellLeft = (x + 0.05 - left) / Math.max(1, usableWidth);
      const cellTop = (y + 0.05 - top) / Math.max(1, usableHeight);
      const cellRight = (x + 0.95 - left) / Math.max(1, usableWidth);
      const cellBottom = (y + 0.95 - top) / Math.max(1, usableHeight);

      if (cellRight <= 0 || cellBottom <= 0 || cellLeft >= 1 || cellTop >= 1) {
        row.push(createEmptyCell(x, y));
        continue;
      }

      const sampleMinX = Math.max(fit.sampleBounds.minX, Math.floor(fit.sampleBounds.minX + Math.max(0, cellLeft) * fit.subjectWidth));
      const sampleMaxX = Math.min(fit.sampleBounds.maxX + 1, Math.ceil(fit.sampleBounds.minX + Math.min(1, cellRight) * fit.subjectWidth));
      const sampleMinY = Math.max(fit.sampleBounds.minY, Math.floor(fit.sampleBounds.minY + Math.max(0, cellTop) * fit.subjectHeight));
      const sampleMaxY = Math.min(fit.sampleBounds.maxY + 1, Math.ceil(fit.sampleBounds.minY + Math.min(1, cellBottom) * fit.subjectHeight));

      if (sampleMaxX <= sampleMinX || sampleMaxY <= sampleMinY) {
        row.push(createEmptyCell(x, y));
        continue;
      }

      const regionArea = (sampleMaxX - sampleMinX) * (sampleMaxY - sampleMinY);
      const stride = Math.max(1, Math.min(config.sampleStrideCap, Math.floor(Math.sqrt(regionArea) / 6) || 1));
      const subjectPixels = [];
      const lumas = [];
      const saturations = [];
      const semanticVotes = new Map();
      let consideredSamples = 0;
      let lineVotes = 0;
      let subjectHits = 0;

      for (let sourceY = sampleMinY; sourceY < sampleMaxY; sourceY += stride) {
        for (let sourceX = sampleMinX; sourceX < sampleMaxX; sourceX += stride) {
          consideredSamples += 1;
          const flatIndex = sourceY * width + sourceX;
          if (!subjectMask[flatIndex]) continue;
          subjectHits += 1;

          const pixel = getPixel(imageData.data, width, sourceX, sourceY);
          if (pixel[3] <= (config.background?.alphaThreshold ?? 20)) continue;
          const rgb = [pixel[0], pixel[1], pixel[2]];
          if (isNearBackground(rgb, backgroundEstimate)) continue;

          subjectPixels.push(rgb);
          lumas.push(getLuma(rgb));
          saturations.push(getSaturation(rgb));

          if (semanticModel?.codeMap?.[flatIndex]) {
            const semanticCode = semanticModel.codeMap[flatIndex];
            semanticVotes.set(
              semanticCode,
              (semanticVotes.get(semanticCode) || 0) + (config.colorQuantization?.quantVoteBoost || 1.15)
            );
          }
          if (semanticModel?.lineMask?.[flatIndex]) {
            lineVotes += 1;
          }
        }
      }

      const subjectRatio = subjectPixels.length / Math.max(1, consideredSamples);
      if (!subjectPixels.length || subjectRatio < config.downsample.minSubjectRatio) {
        row.push(createEmptyCell(x, y));
        continue;
      }

      const representative = getRepresentativeColor(subjectPixels, config);
      let mapped = chooseMappedColor(representative, paletteMapper, limitedPalette);
      const semanticLeader = getVoteLeader(semanticVotes);
      if (semanticLeader) {
        const semanticMeta = paletteMapper.getByCode(semanticLeader);
        if (semanticMeta) {
          mapped = semanticMeta;
        }
      }

      const lineRatio = lineVotes / Math.max(1, subjectHits);
      if (lineRatio >= (config.macro?.lineMinBlockRatio || 0.12)) {
        const outlineMeta = paletteMapper.getByCode(config.outline?.outlineColorCode || "H7") || paletteMapper.getDarkestEntry();
        mapped = outlineMeta;
      }

      const avgSaturation = saturations.reduce((sum, value) => sum + value, 0) / saturations.length;
      const contrast = Math.max(...lumas) - Math.min(...lumas);

      const cell = {
        x,
        y,
        code: mapped.code,
        color: mapped.hex,
        hex: mapped.hex,
        rgb: mapped.rgb.slice(),
        isBackground: false,
        isOutline: false,
        isHighlight: false,
        _sample: {
          avgRgb: representative,
          avgLuma: getLuma(representative),
          avgSaturation,
          contrast,
          darkRatio: lumas.filter((value) => value <= config.outline.lineDarknessThreshold).length / lumas.length,
          subjectRatio,
          sampleCount: subjectPixels.length,
          semanticLeader,
          lineRatio
        }
      };

      row.push(cell);
      incPaletteStat(paletteStats, mapped);
    }

    cells.push(row);
  }

  return {
    width: targetWidth,
    height: targetHeight,
    cells,
    paletteStats
  };
}
