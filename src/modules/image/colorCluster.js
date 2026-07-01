function getPixel(data, width, x, y) {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
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

function averageCluster(points) {
  const sum = [0, 0, 0];
  for (const point of points) {
    sum[0] += point[0];
    sum[1] += point[1];
    sum[2] += point[2];
  }
  return sum.map((value) => Math.round(value / points.length));
}

function dedupeByCode(entries) {
  const byCode = new Map();
  for (const entry of entries) {
    if (!byCode.has(entry.code)) {
      byCode.set(entry.code, entry);
    }
  }
  return Array.from(byCode.values());
}

export function buildLimitedPaletteFromImage(imageData, subjectMask, paletteMapper, config) {
  const width = imageData.width;
  const height = imageData.height;
  const samplePoints = [];
  const step = Math.max(1, Math.floor(Math.max(width, height) / 120));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const flatIndex = y * width + x;
      if (!subjectMask[flatIndex]) continue;
      const rgb = getPixel(imageData.data, width, x, y);
      samplePoints.push(rgb);
    }
  }

  if (!samplePoints.length) {
    return paletteMapper.palette.slice(0, config.colorQuantization.maxColors);
  }

  const sortedByLuma = samplePoints.slice().sort((a, b) => getLuma(a) - getLuma(b));
  const sortedBySaturation = samplePoints.slice().sort((a, b) => getSaturation(b) - getSaturation(a));
  const darkPoints = samplePoints.filter((rgb) => getLuma(rgb) <= config.outline.lineDarknessThreshold);
  const clusterCount = Math.min(config.colorQuantization.clusterCount, samplePoints.length);
  const seeds = [];

  for (let index = 0; index < clusterCount; index += 1) {
    const pivot = sortedByLuma[Math.floor(index * sortedByLuma.length / clusterCount)];
    if (pivot) seeds.push(pivot);
  }

  if (sortedBySaturation[0]) seeds.push(sortedBySaturation[0]);
  if (sortedByLuma[sortedByLuma.length - 1]) seeds.push(sortedByLuma[sortedByLuma.length - 1]);

  let centers = seeds.slice(0, clusterCount);
  if (!centers.length) {
    centers = samplePoints.slice(0, clusterCount);
  }

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const groups = Array.from({ length: centers.length }, () => []);
    for (const point of samplePoints) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        const currentDistance = weightedDistance(point, centers[index]);
        if (currentDistance < bestDistance) {
          bestDistance = currentDistance;
          bestIndex = index;
        }
      }
      groups[bestIndex].push(point);
    }

    centers = centers.map((center, index) => (
      groups[index].length ? averageCluster(groups[index]) : center
    ));
  }

  const mapped = centers.map((center) => paletteMapper.findNearest(center));
  const limited = dedupeByCode(mapped).slice(0, config.colorQuantization.maxColors);

  if (darkPoints.length / samplePoints.length >= 0.035 && !limited.some((item) => item.code === "H7")) {
    limited.push(paletteMapper.getDarkestEntry());
  }

  return dedupeByCode(limited).slice(0, config.colorQuantization.maxColors);
}

export function buildLimitedPaletteFromEntries(entries, config) {
  return dedupeByCode(entries).slice(0, config.colorQuantization.maxColors);
}
