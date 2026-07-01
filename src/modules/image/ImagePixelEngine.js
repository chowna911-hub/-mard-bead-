import { defaultPixelEngineConfig, DEFAULT_CONVERT_MODE, getPixelEngineConfigForMode } from "./types.js";
import { createPaletteMapper } from "./paletteMapper.js";
import { estimateBackground, createInitialBackgroundMask } from "./backgroundRemoval.js";
import { extractSubjectMask, expandBounds, fitSubjectToGrid } from "./subjectMask.js";
import { buildLimitedPaletteFromImage, buildLimitedPaletteFromEntries } from "./colorCluster.js";
import { downsampleToBeadGrid } from "./downsample.js";
import { applyFeaturePreserve } from "./featurePreserve.js";
import { generateOutlineLayer } from "./outlineLayer.js";
import { cleanupGrid } from "./cleanup.js";
import { analyzeGridQuality, autoTuneConfigIfNeeded } from "./qualityCheck.js";
import { normalizeFinalGrid } from "./finalGridNormalize.js";
import { analyzeMacroRegions } from "./macroRegionAnalysis.js";

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function createWorkingCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    canvas,
    context,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height)
  };
}

export class ImagePixelEngine {
  constructor(options = {}) {
    const mode = options.config?.mode || options.mode || DEFAULT_CONVERT_MODE;
    this.config = deepMerge(
      deepMerge(defaultPixelEngineConfig, getPixelEngineConfigForMode(mode)),
      options.config || {}
    );
    this.paletteMapper = createPaletteMapper(options.palette);
  }

  async process(image, options = {}) {
    return this.runPipeline(image, options, false);
  }

  async runPipeline(image, options = {}, attemptedRefit = false) {
    const mode = options.mode || options.config?.mode || this.config.mode || DEFAULT_CONVERT_MODE;
    const modeConfig = getPixelEngineConfigForMode(mode);
    const config = deepMerge(deepMerge(this.config, modeConfig), options.config || {});
    const targetSize = options.targetSize || config.targetGridSize;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};

    onProgress(6, "normalize image");
    const { canvas, imageData } = createWorkingCanvas(image);
    const width = canvas.width;
    const height = canvas.height;

    await Promise.resolve();
    onProgress(16, "estimate background");
    const backgroundEstimate = estimateBackground(imageData, width, height, config);
    backgroundEstimate.distance = this.paletteMapper.distance;
    const backgroundMask = createInitialBackgroundMask(imageData, width, height, backgroundEstimate, config);

    await Promise.resolve();
    onProgress(28, "generate subject mask");
    const subject = extractSubjectMask(width, height, backgroundMask, config);
    const paddedBounds = expandBounds(subject.bounds, width, height, 0.02);
    const fit = fitSubjectToGrid(paddedBounds, width, height, targetSize, config);

    await Promise.resolve();
    onProgress(42, "macro color analysis");
    const semanticModel = config.macro?.enableSemanticPrepass
      ? analyzeMacroRegions(imageData, subject.mask, this.paletteMapper, config)
      : null;
    const limitedPalette = semanticModel?.limitedPalette?.length
      ? buildLimitedPaletteFromEntries(semanticModel.limitedPalette, config)
      : buildLimitedPaletteFromImage(imageData, subject.mask, this.paletteMapper, config);

    await Promise.resolve();
    onProgress(58, "semantic grid arrangement");
    let beadGrid = downsampleToBeadGrid({
      imageData,
      width,
      height,
      subjectMask: subject.mask,
      fit,
      targetWidth: targetSize,
      targetHeight: targetSize,
      paletteMapper: this.paletteMapper,
      limitedPalette,
      semanticModel,
      backgroundEstimate,
      config
    });

    await Promise.resolve();
    onProgress(74, "highlight / small feature protection");
    beadGrid = applyFeaturePreserve(beadGrid, this.paletteMapper, config);

    await Promise.resolve();
    onProgress(86, "outline layer generation");
    beadGrid = generateOutlineLayer(beadGrid, this.paletteMapper, config);

    await Promise.resolve();
    onProgress(96, "noise cleanup");
    beadGrid = cleanupGrid(beadGrid, this.paletteMapper, config);

    await Promise.resolve();
    onProgress(98, "final crop");
    beadGrid = normalizeFinalGrid(beadGrid, this.paletteMapper, config);

    onProgress(99, "quality check");
    const qualityReport = analyzeGridQuality(beadGrid, {
      mode,
      config,
      paletteMapper: this.paletteMapper
    });
    const { nextConfig, shouldRetry } = autoTuneConfigIfNeeded(config, qualityReport, attemptedRefit);
    if (shouldRetry) {
      onProgress(99, "quality retry");
      return this.runPipeline(image, {
        ...options,
        config: nextConfig,
        targetSize: Math.min(targetSize, nextConfig.targetGridSize || targetSize),
        mode
      }, true);
    }

    onProgress(100, "output bead grid");
    return {
      beadGrid,
      debug: {
        mode,
        backgroundEstimate,
        subjectBounds: subject.bounds,
        paddedBounds,
        fit,
        limitedPalette,
        semanticModel,
        qualityReport
      }
    };
  }
}
