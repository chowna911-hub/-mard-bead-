export function getLuma([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function getSaturation(rgb) {
  const [r, g, b] = rgb.map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

export function rgbToHsl(rgb) {
  let [r, g, b] = rgb.map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }

  return { h, s, l };
}

export function getHueGroup(rgb) {
  const luma = getLuma(rgb);
  const { h, s, l } = rgbToHsl(rgb);

  if (luma < 52) return "dark";
  if (luma > 236 && s < 0.16) return "light";
  if (s < 0.12) return "neutral";

  if (h >= 12 && h < 50 && l < 0.62 && s > 0.2) return "brown";
  if (h < 14 || h >= 345) return "red";
  if (h < 28) return "orange";
  if (h < 60) return "yellow";
  if (h < 150) return "green";
  if (h < 195) return "cyan";
  if (h < 255) return "blue";
  if (h < 310) return "purple";
  return "pink";
}

export function weightedDistance(rgbA, rgbB) {
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

const HUE_COMPATIBILITY = {
  red: new Set(["red", "pink", "orange"]),
  orange: new Set(["orange", "yellow", "brown", "red"]),
  yellow: new Set(["yellow", "orange", "brown"]),
  brown: new Set(["brown", "orange", "yellow", "neutral"]),
  green: new Set(["green", "cyan", "yellow"]),
  cyan: new Set(["cyan", "blue", "green"]),
  blue: new Set(["blue", "cyan", "purple"]),
  purple: new Set(["purple", "pink", "blue"]),
  pink: new Set(["pink", "red", "purple"]),
  neutral: new Set(["neutral", "light", "dark", "brown"]),
  dark: new Set(["dark", "neutral", "brown"]),
  light: new Set(["light", "neutral", "yellow", "pink"])
};

export function areHueGroupsCompatible(a, b) {
  if (a === b) return true;
  return Boolean(HUE_COMPATIBILITY[a]?.has(b) || HUE_COMPATIBILITY[b]?.has(a));
}

export function getColorProfile(rgb) {
  return {
    rgb,
    luma: getLuma(rgb),
    saturation: getSaturation(rgb),
    hueGroup: getHueGroup(rgb)
  };
}
