function getIndex(width, x, y) {
  return y * width + x;
}

function floodFill(width, height, startX, startY, allowedMask, visited) {
  const queueX = [startX];
  const queueY = [startY];
  let head = 0;
  let area = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = startX;
  let minY = startY;
  let maxX = startX;
  let maxY = startY;
  const pixels = [];
  visited[getIndex(width, startX, startY)] = 1;

  while (head < queueX.length) {
    const x = queueX[head];
    const y = queueY[head];
    head += 1;
    const index = getIndex(width, x, y);
    area += 1;
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    pixels.push(index);

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ];

    for (const [nextX, nextY] of neighbors) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const nextIndex = getIndex(width, nextX, nextY);
      if (visited[nextIndex] || !allowedMask[nextIndex]) continue;
      visited[nextIndex] = 1;
      queueX.push(nextX);
      queueY.push(nextY);
    }
  }

  return {
    pixels,
    area,
    bounds: { minX, minY, maxX, maxY },
    centroid: { x: sumX / area, y: sumY / area }
  };
}

function collectForegroundComponents(width, height, backgroundMask) {
  const allowedMask = new Uint8Array(width * height);
  for (let index = 0; index < allowedMask.length; index += 1) {
    allowedMask[index] = backgroundMask[index] ? 0 : 1;
  }

  const visited = new Uint8Array(width * height);
  const components = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = getIndex(width, x, y);
      if (!allowedMask[index] || visited[index]) continue;
      components.push(floodFill(width, height, x, y, allowedMask, visited));
    }
  }

  return components;
}

function scoreComponent(component, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = (component.centroid.x - cx) / width;
  const dy = (component.centroid.y - cy) / height;
  const centerBias = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) * 1.6);
  return component.area * (1 + centerBias * 0.42);
}

function fillSmallHoles(width, height, subjectMask, maxHoleArea) {
  const inverseMask = new Uint8Array(width * height);
  for (let index = 0; index < inverseMask.length; index += 1) {
    inverseMask[index] = subjectMask[index] ? 0 : 1;
  }

  const visited = new Uint8Array(width * height);
  const edgeConnected = new Uint8Array(width * height);
  const queue = [];
  let head = 0;

  function seed(x, y) {
    const index = getIndex(width, x, y);
    if (!inverseMask[index] || visited[index]) return;
    visited[index] = 1;
    edgeConnected[index] = 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < width; x += 1) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    seed(0, y);
    seed(width - 1, y);
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
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = getIndex(width, nx, ny);
      if (!inverseMask[ni] || visited[ni]) continue;
      visited[ni] = 1;
      edgeConnected[ni] = 1;
      queue.push([nx, ny]);
    }
  }

  const holeVisited = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = getIndex(width, x, y);
      if (!inverseMask[index] || edgeConnected[index] || holeVisited[index]) continue;
      const component = floodFill(width, height, x, y, inverseMask, holeVisited);
      if (component.area <= maxHoleArea) {
        for (const pixelIndex of component.pixels) {
          subjectMask[pixelIndex] = 1;
        }
      }
    }
  }

  return subjectMask;
}

export function extractSubjectMask(width, height, backgroundMask, config) {
  const backgroundConfig = config.background || config;
  const components = collectForegroundComponents(width, height, backgroundMask);
  const minArea = width * height * backgroundConfig.minComponentAreaRatio;
  const meaningful = components.filter((component) => component.area >= minArea);

  if (!meaningful.length) {
    return {
      mask: new Uint8Array(width * height),
      bounds: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 }
    };
  }

  meaningful.sort((a, b) => scoreComponent(b, width, height) - scoreComponent(a, width, height));
  const primary = meaningful[0];
  const mask = new Uint8Array(width * height);
  for (const index of primary.pixels) {
    mask[index] = 1;
  }

  fillSmallHoles(width, height, mask, Math.max(6, Math.floor(width * height * 0.002)));

  let minX = width - 1;
  let minY = height - 1;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[getIndex(width, x, y)]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    mask,
    bounds: { minX, minY, maxX, maxY }
  };
}

export function expandBounds(bounds, width, height, paddingRatio) {
  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const padding = Math.floor(Math.max(boxWidth, boxHeight) * paddingRatio);
  return {
    minX: Math.max(0, bounds.minX - padding),
    minY: Math.max(0, bounds.minY - padding),
    maxX: Math.min(width - 1, bounds.maxX + padding),
    maxY: Math.min(height - 1, bounds.maxY + padding)
  };
}

export function fitSubjectToGrid(bounds, imageWidth, imageHeight, targetGridSize, config) {
  const subjectWidth = bounds.maxX - bounds.minX + 1;
  const subjectHeight = bounds.maxY - bounds.minY + 1;
  const safeGrid = Math.max(1, targetGridSize);
  const fitRatio = Math.min(0.92, Math.max(0.88, config.subjectFitRatio ?? 0.88));
  const paddingCells = Math.max(1, config.paddingCells ?? 1);
  const drawableGrid = Math.max(1, safeGrid - paddingCells * 2);
  const scale = (drawableGrid * fitRatio) / Math.max(subjectWidth, subjectHeight);
  const scaledWidth = subjectWidth * scale;
  const scaledHeight = subjectHeight * scale;
  const offsetX = (safeGrid - scaledWidth) / 2;
  const offsetY = (safeGrid - scaledHeight) / 2;

  return {
    subjectWidth,
    subjectHeight,
    scale,
    scaledWidth,
    scaledHeight,
    offsetX,
    offsetY,
    sampleBounds: bounds,
    imageWidth,
    imageHeight
  };
}
