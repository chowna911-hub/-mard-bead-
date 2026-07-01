import { MARD_PALETTE } from "./mardPalette.js";

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  const number = Number.parseInt(value, 16);
  return [
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255
  ];
}

function getLuma([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function weightedDistance(rgbA, rgbB) {
  const [r1, g1, b1] = rgbA;
  const [r2, g2, b2] = rgbB;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const rMean = (r1 + r2) / 2;

  if (rMean < 128) {
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  }
  return Math.sqrt(3 * dr * dr + 4 * dg * dg + 2 * db * db);
}

export function createPaletteMapper(palette = MARD_PALETTE) {
  const entries = palette.map((item) => {
    const rgb = hexToRgb(item.hex);
    return {
      ...item,
      rgb,
      luma: getLuma(rgb),
      isDark: getLuma(rgb) < 138
    };
  });

  const byCode = new Map(entries.map((item) => [item.code, item]));
  const cache = new Map();

  function findNearest(rgb) {
    const key = rgb.join(",");
    if (cache.has(key)) {
      return cache.get(key);
    }

    let best = entries[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entry of entries) {
      const distance = weightedDistance(rgb, entry.rgb);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    }

    cache.set(key, best);
    return best;
  }

  function findNearestInPalette(rgb, paletteSubset) {
    if (!paletteSubset?.length) {
      return findNearest(rgb);
    }

    let best = paletteSubset[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of paletteSubset) {
      const currentDistance = weightedDistance(rgb, entry.rgb);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        best = entry;
      }
    }
    return best;
  }

  return {
    palette: entries,
    byCode,
    findNearest,
    findNearestInPalette,
    getByCode(code) {
      return byCode.get(code) || null;
    },
    getDarkestEntry() {
      return byCode.get("H7") || entries.reduce((darkest, item) => (
        item.luma < darkest.luma ? item : darkest
      ), entries[0]);
    },
    distance: weightedDistance
  };
}
