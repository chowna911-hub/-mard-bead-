import {
  preserveInternalHighlight,
  thinThickHighlight,
  removeIsolatedHighlightPixels
} from "./highlightPreserve.js";
import { getLuma, getSaturation } from "./colorUtils.js";
import { preserveLocalStableColors } from "./localStableColor.js";

export function applyFeaturePreserve(grid, paletteMapper, config) {
  const featureConfig = config.feature || config;
  if (!featureConfig.enableHighlightPreserve && !featureConfig.enableSmallColorFeaturePreserve) {
    return { grid, localComponents: [] };
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
        const nearest = paletteMapper.findNearest(sampleRgb, { enableHueGuard: true });
        cell.code = nearest.code;
        cell.color = nearest.hex;
        cell.hex = nearest.hex;
        cell.rgb = nearest.rgb.slice();
        cell.isHighlight = true;
      } else if (isSmallVividFeature) {
        const vivid = paletteMapper.findNearest(sampleRgb, { enableHueGuard: true });
        cell.code = vivid.code;
        cell.color = vivid.hex;
        cell.hex = vivid.hex;
        cell.rgb = vivid.rgb.slice();
      }
    }
  }

  const preserved = preserveLocalStableColors(grid, paletteMapper, config);
  return preserved;
}
