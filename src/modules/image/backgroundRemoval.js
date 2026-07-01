function getPixel(imageData, width, x, y) {
  const index = (y * width + x) * 4;
  const data = imageData.data;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function toRgb(pixel) {
  return [pixel[0], pixel[1], pixel[2]];
}

function getChroma([r, g, b]) {
  return Math.max(r, g, b) - Math.min(r, g, b);
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

function createCluster(seed) {
  return {
    rgb: seed.slice(0, 3),
    count: 1
  };
}

function mergeIntoCluster(cluster, rgb) {
  cluster.count += 1;
  cluster.rgb[0] += (rgb[0] - cluster.rgb[0]) / cluster.count;
  cluster.rgb[1] += (rgb[1] - cluster.rgb[1]) / cluster.count;
  cluster.rgb[2] += (rgb[2] - cluster.rgb[2]) / cluster.count;
}

function matchesBackground(rgb, candidates, threshold) {
  return candidates.some((candidate) => weightedDistance(rgb, candidate) <= threshold);
}

export function estimateBackground(imageData, width, height, config) {
  const data = imageData.data;
  const backgroundConfig = config.background || config;
  let transparentCount = 0;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] <= backgroundConfig.alphaThreshold) {
      transparentCount += 1;
    }
  }

  const hasAlphaBackground = transparentCount / (width * height) > 0.015;
  const band = Math.max(2, Math.floor(Math.min(width, height) * backgroundConfig.edgeSampleRatio));
  const step = Math.max(1, Math.floor(band / 2));
  const samples = [];

  for (let x = 0; x < width; x += step) {
    for (let dy = 0; dy < band; dy += 1) {
      samples.push(getPixel(imageData, width, x, dy));
      samples.push(getPixel(imageData, width, x, height - 1 - dy));
    }
  }

  for (let y = 0; y < height; y += step) {
    for (let dx = 0; dx < band; dx += 1) {
      samples.push(getPixel(imageData, width, dx, y));
      samples.push(getPixel(imageData, width, width - 1 - dx, y));
    }
  }

  const opaqueSamples = samples.filter((pixel) => pixel[3] > backgroundConfig.alphaThreshold);
  const clusters = [];

  for (const pixel of opaqueSamples) {
    const rgb = toRgb(pixel);
    let bestCluster = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      const currentDistance = weightedDistance(rgb, cluster.rgb);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestCluster = cluster;
      }
    }

    if (!bestCluster || bestDistance > backgroundConfig.edgeClusterDistance) {
      if (clusters.length < backgroundConfig.maxBackgroundClusters) {
        clusters.push(createCluster(rgb));
      } else {
        mergeIntoCluster(clusters[clusters.length - 1], rgb);
      }
    } else {
      mergeIntoCluster(bestCluster, rgb);
    }
  }

  clusters.sort((a, b) => b.count - a.count);

  return {
    hasAlphaBackground,
    candidates: clusters.slice(0, backgroundConfig.maxBackgroundClusters).map((cluster) => cluster.rgb),
    bgThreshold: backgroundConfig.bgThreshold
  };
}

export function createInitialBackgroundMask(imageData, width, height, backgroundEstimate, config) {
  const backgroundConfig = config.background || config;
  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = [];
  let head = 0;

  function trySeed(x, y) {
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;

    const pixel = getPixel(imageData, width, x, y);
    const alpha = pixel[3];
    const rgb = toRgb(pixel);
    const isTransparent = backgroundEstimate.hasAlphaBackground && alpha <= backgroundConfig.alphaThreshold;
    const isBgColor =
      backgroundEstimate.candidates.length > 0 &&
      matchesBackground(rgb, backgroundEstimate.candidates, backgroundEstimate.bgThreshold);

    if (isTransparent || isBgColor) {
      mask[index] = 1;
      queue.push([x, y]);
    }
  }

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (head < queue.length) {
    const [x, y] = queue[head];
    head += 1;

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ];

    for (const [nextX, nextY] of neighbors) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const nextIndex = nextY * width + nextX;
      if (visited[nextIndex]) continue;
      visited[nextIndex] = 1;

      const pixel = getPixel(imageData, width, nextX, nextY);
      const alpha = pixel[3];
      const rgb = toRgb(pixel);
      const isTransparent = backgroundEstimate.hasAlphaBackground && alpha <= backgroundConfig.alphaThreshold;
      const lowChroma = getChroma(rgb) < 18;
      const isBgColor = backgroundEstimate.candidates.length > 0 && (
        matchesBackground(rgb, backgroundEstimate.candidates, backgroundEstimate.bgThreshold) ||
        (lowChroma && matchesBackground(rgb, backgroundEstimate.candidates, backgroundEstimate.bgThreshold + 8))
      );

      if (isTransparent || isBgColor) {
        mask[nextIndex] = 1;
        queue.push([nextX, nextY]);
      }
    }
  }

  return mask;
}
