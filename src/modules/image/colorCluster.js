import { getLuma, getSaturation, getColorProfile, weightedDistance, areHueGroupsCompatible } from "./colorUtils.js";

function getPixel(data, width, x, y) {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
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
    if (!entry || byCode.has(entry.code)) continue;
    byCode.set(entry.code, entry);
  }
  return Array.from(byCode.values());
}

function buildGlobalDominantPalette(samplePoints, paletteMapper, config) {
  const sortedByLuma = samplePoints.slice().sort((a, b) => getLuma(a) - getLuma(b));
  const sortedBySaturation = samplePoints.slice().sort((a, b) => getSaturation(b) - getSaturation(a));
  const clusterCount = Math.min(config.colorQuantization.clusterCount, samplePoints.length);
  const seeds = [];

  for (let index = 0; index < clusterCount; index += 1) {
    const pivot = sortedByLuma[Math.floor(index * sortedByLuma.length / clusterCount)];
    if (pivot) seeds.push(pivot);
  }
  if (sortedBySaturation[0]) seeds.push(sortedBySaturation[0]);
  if (sortedByLuma[sortedByLuma.length - 1]) seeds.push(sortedByLuma[sortedByLuma.length - 1]);

  let centers = seeds.slice(0, clusterCount);
  if (!centers.length) centers = samplePoints.slice(0, clusterCount);

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

  return dedupeByCode(
    centers.map((center) => paletteMapper.findNearest(center, { enableHueGuard: true }))
  );
}

function detectLocalSaturatedRegions(samplePoints, paletteMapper, config) {
  const localConfig = config.localStableColor || {};
  if (!localConfig.enable) return [];

  const buckets = new Map();
  for (const rgb of samplePoints) {
    const profile = getColorProfile(rgb);
    if (profile.saturation < (localConfig.minSaturation || 0.18)) continue;
    const key = `${profile.hueGroup}:${Math.round(profile.luma / 18)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(rgb);
  }

  const protectedEntries = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < (localConfig.minComponentAreaCells || 2)) continue;
    const avgRgb = averageCluster(bucket);
    const profile = getColorProfile(avgRgb);
    const nearest = paletteMapper.findNearest(avgRgb, { enableHueGuard: true });
    if (profile.hueGroup !== nearest.hueGroup && !areHueGroupsCompatible(profile.hueGroup, nearest.hueGroup)) {
      continue;
    }
    protectedEntries.push(nearest);
  }

  return dedupeByCode(protectedEntries);
}

function mergePaletteWithPriority(globalPalette, protectedLocalPalette, paletteMapper, config, samplePoints) {
  const merged = dedupeByCode([
    ...globalPalette,
    ...protectedLocalPalette
  ]);

  const darkRatio = samplePoints.filter((rgb) => getLuma(rgb) <= config.outline.lineDarknessThreshold).length / Math.max(1, samplePoints.length);
  if (darkRatio >= 0.035 && !merged.some((item) => item.code === "H7")) {
    merged.unshift(paletteMapper.getDarkestEntry());
  }

  return dedupeByCode(merged).slice(0, Math.max(config.colorQuantization.maxColors, merged.length));
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
      samplePoints.push(getPixel(imageData.data, width, x, y));
    }
  }

  if (!samplePoints.length) {
    return paletteMapper.palette.slice(0, config.colorQuantization.maxColors);
  }

  const globalPalette = buildGlobalDominantPalette(samplePoints, paletteMapper, config);
  const protectedLocalPalette = detectLocalSaturatedRegions(samplePoints, paletteMapper, config);
  return mergePaletteWithPriority(globalPalette, protectedLocalPalette, paletteMapper, config, samplePoints);
}

export function buildLimitedPaletteFromEntries(entries, config) {
  return dedupeByCode(entries).slice(0, Math.max(config.colorQuantization.maxColors, entries.length));
}
