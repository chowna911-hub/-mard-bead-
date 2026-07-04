import { MARD_PALETTE } from "./mardPalette.js";
import { getColorProfile, weightedDistance, areHueGroupsCompatible } from "./colorUtils.js";

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

function buildMappingOptions(options = {}) {
  return {
    enableHueGuard: options.enableHueGuard !== false,
    crossHuePenalty: options.crossHuePenalty ?? 1.35,
    grayPenaltyForSaturatedSource: options.grayPenaltyForSaturatedSource ?? 1.45,
    minSaturationForHueGuard: options.minSaturationForHueGuard ?? 0.18,
    allowCrossHueOnlyIfDeltaEImprovesBy: options.allowCrossHueOnlyIfDeltaEImprovesBy ?? 0.25,
    restrictDarkSourceToDarkPalette: options.restrictDarkSourceToDarkPalette !== false
  };
}

export function createPaletteMapper(palette = MARD_PALETTE, options = {}) {
  const mappingOptions = buildMappingOptions(options);
  const entries = palette.map((item) => {
    const rgb = hexToRgb(item.hex);
    const profile = getColorProfile(rgb);
    return {
      ...item,
      rgb,
      luma: profile.luma,
      saturation: profile.saturation,
      hueGroup: profile.hueGroup,
      isDark: profile.luma < 138
    };
  });

  const byCode = new Map(entries.map((item) => [item.code, item]));
  const cache = new Map();

  function scoreEntry(sourceProfile, entry, settings) {
    let distance = weightedDistance(sourceProfile.rgb, entry.rgb);

    if (!settings.enableHueGuard) return distance;

    if (settings.restrictDarkSourceToDarkPalette && sourceProfile.luma < 68 && entry.hueGroup !== "dark" && entry.hueGroup !== "neutral") {
      distance *= 1.55;
    }

    const sourceHue = sourceProfile.hueGroup;
    const targetHue = entry.hueGroup;
    const hueGuardActive = sourceProfile.saturation >= settings.minSaturationForHueGuard && !["dark", "light", "neutral"].includes(sourceHue);

    if (hueGuardActive && sourceHue !== targetHue) {
      distance *= areHueGroupsCompatible(sourceHue, targetHue) ? 1.12 : settings.crossHuePenalty;
    }

    if (sourceProfile.saturation >= settings.minSaturationForHueGuard && targetHue === "neutral") {
      distance *= settings.grayPenaltyForSaturatedSource;
    }

    if (sourceHue === "dark" && !["dark", "neutral", "brown"].includes(targetHue)) {
      distance *= 1.45;
    }

    if (sourceHue === "light" && targetHue === "dark") {
      distance *= 1.4;
    }

    return distance;
  }

  function findNearest(rgb, optionsOverride = {}) {
    const key = `${rgb.join(",")}::${JSON.stringify(optionsOverride.allowedCodes || [])}::${Boolean(optionsOverride.enableHueGuard ?? true)}`;
    if (!optionsOverride.allowedEntries && !optionsOverride.allowedCodes && cache.has(key)) {
      return cache.get(key);
    }

    const settings = {
      ...mappingOptions,
      ...optionsOverride
    };
    const sourceProfile = getColorProfile(rgb);
    let pool = settings.allowedEntries
      || (settings.allowedCodes?.length ? settings.allowedCodes.map((code) => byCode.get(code)).filter(Boolean) : null)
      || entries;

    if (!pool.length) pool = entries;

    let best = pool[0];
    let bestScore = Number.POSITIVE_INFINITY;
    let bestCompatible = null;
    let bestCompatibleScore = Number.POSITIVE_INFINITY;

    for (const entry of pool) {
      const score = scoreEntry(sourceProfile, entry, settings);
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
      if (areHueGroupsCompatible(sourceProfile.hueGroup, entry.hueGroup) || sourceProfile.hueGroup === entry.hueGroup) {
        if (score < bestCompatibleScore) {
          bestCompatibleScore = score;
          bestCompatible = entry;
        }
      }
    }

    if (
      bestCompatible &&
      best !== bestCompatible &&
      bestCompatibleScore <= bestScore * (1 + settings.allowCrossHueOnlyIfDeltaEImprovesBy)
    ) {
      best = bestCompatible;
    }

    if (!optionsOverride.allowedEntries && !optionsOverride.allowedCodes) {
      cache.set(key, best);
    }
    return best;
  }

  function findNearestInPalette(rgb, paletteSubset, optionsOverride = {}) {
    if (!paletteSubset?.length) {
      return findNearest(rgb, optionsOverride);
    }
    return findNearest(rgb, {
      ...optionsOverride,
      allowedEntries: paletteSubset
    });
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
