function getPixel(data, width, x, y) {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function getLuma([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getSaturation([r, g, b]) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  if (max === 0) return 0;
  return (max - min) / max;
}

function averageColor(points) {
  const sum = [0, 0, 0];
  for (const point of points) {
    sum[0] += point[0];
    sum[1] += point[1];
    sum[2] += point[2];
  }
  return sum.map((value) => Math.round(value / Math.max(1, points.length)));
}

function weightedDistance(rgbA, rgbB) {
  const dr = rgbA[0] - rgbB[0];
  const dg = rgbA[1] - rgbB[1];
  const db = rgbA[2] - rgbB[2];
  const rMean = (rgbA[0] + rgbB[0]) / 2;
  if (rMean < 128) {
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  }
  return Math.sqrt(3 * dr * dr + 4 * dg * dg + 2 * db * db);
}

function dedupePalette(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!entry || seen.has(entry.code)) continue;
    seen.set(entry.code, entry);
  }
  return Array.from(seen.values());
}

function collectSubjectSamples(imageData, subjectMask, stride) {
  const width = imageData.width;
  const height = imageData.height;
  const samples = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = y * width + x;
      if (!subjectMask[index]) continue;
      const pixel = getPixel(imageData.data, width, x, y);
      if (pixel[3] <= 16) continue;
      samples.push({
        rgb: [pixel[0], pixel[1], pixel[2]],
        luma: getLuma([pixel[0], pixel[1], pixel[2]]),
        saturation: getSaturation([pixel[0], pixel[1], pixel[2]])
      });
    }
  }

  return samples;
}

function createSeedColors(samples, coreColorCount) {
  const byLuma = samples.slice().sort((a, b) => a.luma - b.luma);
  const bySaturation = samples.slice().sort((a, b) => b.saturation - a.saturation);
  const seeds = [];

  for (let index = 0; index < coreColorCount; index += 1) {
    const pivot = byLuma[Math.floor(index * byLuma.length / coreColorCount)];
    if (pivot) seeds.push(pivot.rgb);
  }
  if (bySaturation[0]) seeds.push(bySaturation[0].rgb);
  if (byLuma[0]) seeds.push(byLuma[0].rgb);
  if (byLuma[byLuma.length - 1]) seeds.push(byLuma[byLuma.length - 1].rgb);

  return seeds.slice(0, coreColorCount);
}

function kMeansCoreColors(samples, paletteMapper, config) {
  const macroConfig = config.macro || config;
  const colorConfig = config.colorQuantization || config;
  const coreColorCount = Math.min(
    macroConfig.coreColorCount || 6,
    colorConfig.maxColors || 8,
    Math.max(1, samples.length)
  );

  if (!samples.length) {
    return paletteMapper.palette.slice(0, coreColorCount);
  }

  let centers = createSeedColors(samples, coreColorCount);
  if (!centers.length) {
    centers = samples.slice(0, coreColorCount).map((item) => item.rgb);
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const groups = Array.from({ length: centers.length }, () => []);
    for (const sample of samples) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        const currentDistance = weightedDistance(sample.rgb, centers[index]);
        if (currentDistance < bestDistance) {
          bestDistance = currentDistance;
          bestIndex = index;
        }
      }
      groups[bestIndex].push(sample.rgb);
    }
    centers = centers.map((center, index) => (
      groups[index].length ? averageColor(groups[index]) : center
    ));
  }

  const mapped = centers.map((center) => paletteMapper.findNearest(center));
  return dedupePalette(mapped).slice(0, colorConfig.maxColors || coreColorCount);
}

function getLocalContrast(imageData, x, y) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const center = getPixel(data, width, x, y);
  const centerLuma = getLuma(center);
  let maxDiff = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbor = getPixel(data, width, nx, ny);
      const diff = Math.abs(centerLuma - getLuma(neighbor));
      if (diff > maxDiff) {
        maxDiff = diff;
      }
    }
  }

  return maxDiff;
}

function createInitialLineMask(imageData, subjectMask, config) {
  const width = imageData.width;
  const height = imageData.height;
  const macroConfig = config.macro || config;
  const mask = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!subjectMask[index]) continue;
      const pixel = getPixel(imageData.data, width, x, y);
      const rgb = [pixel[0], pixel[1], pixel[2]];
      const luma = getLuma(rgb);
      const saturation = getSaturation(rgb);
      const contrast = getLocalContrast(imageData, x, y);
      if (
        luma <= macroConfig.lineDarknessThreshold &&
        contrast >= macroConfig.lineContrastThreshold &&
        saturation <= 0.45
      ) {
        mask[index] = 1;
      }
    }
  }

  return mask;
}

function countDirectionalNeighbors(mask, width, height, x, y) {
  const pairs = [
    [[-1, 0], [1, 0]],
    [[0, -1], [0, 1]],
    [[-1, -1], [1, 1]],
    [[1, -1], [-1, 1]]
  ];

  let best = 0;
  for (const [a, b] of pairs) {
    const ax = x + a[0];
    const ay = y + a[1];
    const bx = x + b[0];
    const by = y + b[1];
    let count = 0;
    if (ax >= 0 && ay >= 0 && ax < width && ay < height && mask[ay * width + ax]) count += 1;
    if (bx >= 0 && by >= 0 && bx < width && by < height && mask[by * width + bx]) count += 1;
    best = Math.max(best, count);
  }
  return best;
}

function refineLineMask(lineMask, subjectMask, width, height, config) {
  const macroConfig = config.macro || config;
  const refined = lineMask.slice();

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!subjectMask[index]) {
        refined[index] = 0;
        continue;
      }

      const directional = countDirectionalNeighbors(lineMask, width, height, x, y);
      if (lineMask[index] && directional < 1) {
        refined[index] = 0;
        continue;
      }
      if (!lineMask[index] && directional >= (macroConfig.lineContinuityThreshold || 2)) {
        refined[index] = 1;
      }
    }
  }

  return refined;
}

function chooseDominantCode(votes, fallbackCode = null) {
  let bestCode = fallbackCode;
  let bestScore = -1;
  for (const [code, score] of votes.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }
  return bestCode;
}

function buildSemanticCodeMap(imageData, subjectMask, limitedPalette, paletteMapper) {
  const width = imageData.width;
  const height = imageData.height;
  const codeMap = new Array(width * height).fill(null);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!subjectMask[index]) continue;
      const pixel = getPixel(imageData.data, width, x, y);
      if (pixel[3] <= 16) continue;
      const rgb = [pixel[0], pixel[1], pixel[2]];
      const entry = paletteMapper.findNearestInPalette(rgb, limitedPalette);
      codeMap[index] = entry.code;
    }
  }

  return codeMap;
}

function applyRegionMajoritySmoothing(codeMap, lineMask, subjectMask, width, height, config) {
  const macroConfig = config.macro || config;
  let next = codeMap.slice();

  for (let pass = 0; pass < (macroConfig.regionMajorityPasses || 2); pass += 1) {
    const previous = next.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (!subjectMask[index] || lineMask[index] || !previous[index]) continue;

        const votes = new Map();
        votes.set(previous[index], macroConfig.dominantCenterWeight || 1.15);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const ni = (y + dy) * width + (x + dx);
            if (!subjectMask[ni] || lineMask[ni] || !previous[ni]) continue;
            const weight = dx === 0 || dy === 0
              ? (macroConfig.dominantNeighborhoodWeight || 1.35)
              : 1;
            votes.set(previous[ni], (votes.get(previous[ni]) || 0) + weight);
          }
        }
        next[index] = chooseDominantCode(votes, previous[index]);
      }
    }
  }

  return next;
}

export function analyzeMacroRegions(imageData, subjectMask, paletteMapper, config) {
  const width = imageData.width;
  const height = imageData.height;
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 160));
  const samples = collectSubjectSamples(imageData, subjectMask, stride);
  const limitedPalette = kMeansCoreColors(samples, paletteMapper, config);
  const initialLineMask = createInitialLineMask(imageData, subjectMask, config);
  const refinedLineMask = refineLineMask(initialLineMask, subjectMask, width, height, config);
  const codeMap = buildSemanticCodeMap(imageData, subjectMask, limitedPalette, paletteMapper);
  const smoothedCodeMap = applyRegionMajoritySmoothing(codeMap, refinedLineMask, subjectMask, width, height, config);

  return {
    width,
    height,
    limitedPalette,
    codeMap: smoothedCodeMap,
    lineMask: refinedLineMask
  };
}
