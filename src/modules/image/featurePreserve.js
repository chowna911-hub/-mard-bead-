import {
  preserveInternalHighlight,
  thinThickHighlight,
  removeIsolatedHighlightPixels
} from "./highlightPreserve.js";

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

export function applyFeaturePreserve(grid, paletteMapper, config) {
  const featureConfig = config.feature || config;
  if (!featureConfig.enableHighlightPreserve && !featureConfig.enableSmallColorFeaturePreserve) {
    return grid;
  }

  if (featureConfig.enableHighlightPreserve) {
    preserveInternalHighlight(grid, paletteMapper, config);
    thinThickHighlight(grid);
    removeIsolatedHighlightPixels(grid, paletteMapper);
  }

  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell.isBackground || !cell._sample) continue;
      const sampleRgb = cell._sample.avgRgb || cell.rgb;
      const luma = getLuma(sampleRgb);
      const saturation = getSaturation(sampleRgb);
      const isHighlight =
        featureConfig.enableHighlightPreserve &&
        luma >= featureConfig.highlightLightnessThreshold &&
        cell._sample.contrast >= featureConfig.highlightContrastThreshold &&
        cell._sample.subjectRatio >= config.downsample.minSubjectRatio;

      const isSmallVividFeature =
        featureConfig.enableSmallColorFeaturePreserve &&
        saturation >= featureConfig.highSaturationThreshold &&
        cell._sample.subjectRatio >= config.downsample.minSubjectRatio &&
        cell._sample.sampleCount <= Math.max(6, featureConfig.minFeatureAreaCells * 6);

      if (isHighlight) {
        const nearest = paletteMapper.findNearest(sampleRgb);
        cell.code = nearest.code;
        cell.color = nearest.hex;
        cell.hex = nearest.hex;
        cell.rgb = nearest.rgb.slice();
        cell.isHighlight = true;
      } else if (isSmallVividFeature) {
        const vivid = paletteMapper.findNearest(sampleRgb);
        cell.code = vivid.code;
        cell.color = vivid.hex;
        cell.hex = vivid.hex;
        cell.rgb = vivid.rgb.slice();
      }
    }
  }

  return grid;
}
