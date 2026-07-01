import { ImagePixelEngine } from "./ImagePixelEngine.js";
import { defaultPixelEngineConfig, getPixelEngineConfigForMode } from "./types.js";
import { analyzeGridQuality } from "./qualityCheck.js";

export const SIMPLE_SIZE_OPTIONS = [
  { label: "小图", key: "small", size: 48 },
  { label: "标准", key: "standard", size: 64 },
  { label: "精细", key: "fine", size: 72 }
];

function deepMerge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function scoreCandidate(metrics) {
  const noisePenalty = metrics.noiseRatio;
  const isolatedCellPenalty = clamp01(metrics.isolatedCellCount / 8);
  const makingCostPenalty = metrics.makingCost;
  return Number((
    metrics.detailRetention * 0.22 +
    metrics.outlineContinuity * 0.18 +
    metrics.internalLineRetention * 0.14 +
    metrics.highlightRetention * 0.12 +
    metrics.smallFeatureRetention * 0.12 +
    metrics.shapeFidelity * 0.12 +
    metrics.colorStability * 0.06 -
    noisePenalty * 0.08 -
    isolatedCellPenalty * 0.08 -
    makingCostPenalty * 0.04
  ).toFixed(4));
}

function createMetrics(quality, option) {
  const detailRetention = clamp01(
    quality.metrics.smallFeatureRetention * 0.46 +
    quality.metrics.highlightRetention * 0.24 +
    quality.metrics.saturatedFeatureRetention * 0.3
  );
  const internalLineRetention = clamp01(
    quality.metrics.outlineContinuity * 0.55 +
    (1 - quality.metrics.outlineNoiseRatio) * 0.45
  );
  const shapeFidelity = clamp01(
    quality.metrics.subjectCoverage * 0.32 +
    quality.metrics.outlineContinuity * 0.42 +
    quality.metrics.colorRegionStability * 0.26
  );
  const makingCost = option.size === 48 ? 0.15 : option.size === 64 ? 0.4 : 0.64;

  return {
    detailRetention,
    outlineContinuity: quality.metrics.outlineContinuity,
    internalLineRetention,
    highlightRetention: quality.metrics.highlightRetention,
    smallFeatureRetention: quality.metrics.smallFeatureRetention,
    shapeFidelity,
    noiseRatio: quality.metrics.outlineNoiseRatio,
    isolatedCellCount: quality.metrics.isolatedCellCount,
    colorStability: quality.metrics.colorRegionStability,
    makingCost
  };
}

function analyzeImageComplexity(candidateReports) {
  const fine = candidateReports.find((item) => item.option.size === 72);
  const standard = candidateReports.find((item) => item.option.size === 64);
  const base = fine || standard || candidateReports[0];
  const metrics = base.metrics;

  const hasFaceLikeSmallFeatures = metrics.smallFeatureRetention >= 0.55;
  const hasThinLines = metrics.outlineContinuity >= 0.68;
  const hasHighlightLines = metrics.highlightRetention >= 0.42;
  const hasSmallSaturatedFeatures = base.metrics.smallFeatureRetention >= 0.5 && base.metrics.colorStability >= 0.55;
  const hasOverlappingObjects = metrics.shapeFidelity >= 0.7 && metrics.detailRetention >= 0.58;

  let complexityLevel = "simple";
  let estimatedRecommendedSize = 48;
  const signals = [
    hasFaceLikeSmallFeatures,
    hasThinLines,
    hasHighlightLines,
    hasSmallSaturatedFeatures,
    hasOverlappingObjects
  ].filter(Boolean).length;

  if (signals >= 4) {
    complexityLevel = "detailed";
    estimatedRecommendedSize = 72;
  } else if (signals >= 2) {
    complexityLevel = "medium";
    estimatedRecommendedSize = 64;
  }

  return {
    complexityLevel,
    hasFaceLikeSmallFeatures,
    hasThinLines,
    hasHighlightLines,
    hasSmallSaturatedFeatures,
    hasOverlappingObjects,
    estimatedRecommendedSize
  };
}

function createUserReason(option, complexity, metrics) {
  if (option.size === 72) {
    if (complexity.hasThinLines || complexity.hasHighlightLines || complexity.hasFaceLikeSmallFeatures) {
      return "这张图包含较多线条和小细节，精细尺寸会更清楚。";
    }
    return "这张图在精细尺寸下轮廓和细节更完整。";
  }
  if (option.size === 64) {
    if (complexity.complexityLevel === "medium") {
      return "这张图细节适中，标准尺寸会更平衡。";
    }
    return "标准尺寸在清晰度和制作轻松度之间更均衡。";
  }
  return "这张图结构比较简单，小图尺寸也能保持清楚。";
}

function createWarnings(option, metrics) {
  const warnings = [];
  if (option.size === 48 && metrics.detailRetention < 0.58) warnings.push("细节会减少");
  if (option.size === 64 && metrics.detailRetention < 0.62) warnings.push("部分小细节会变粗");
  if (option.size === 72 && metrics.noiseRatio > 0.22) warnings.push("噪点会略有增加");
  if (metrics.isolatedCellCount > 2) warnings.push("有少量孤立噪点风险");
  return warnings;
}

function compareStandardAndFine(candidate64, candidate72) {
  if (!candidate64 || !candidate72) return candidate72 ? "fine" : "standard";

  const detailGain72 =
    (candidate72.metrics.detailRetention - candidate64.metrics.detailRetention) +
    (candidate72.metrics.outlineContinuity - candidate64.metrics.outlineContinuity) +
    (candidate72.metrics.highlightRetention - candidate64.metrics.highlightRetention) +
    (candidate72.metrics.smallFeatureRetention - candidate64.metrics.smallFeatureRetention) +
    (candidate72.metrics.shapeFidelity - candidate64.metrics.shapeFidelity);

  const extraNoise =
    (candidate72.metrics.noiseRatio - candidate64.metrics.noiseRatio) +
    ((candidate72.metrics.isolatedCellCount - candidate64.metrics.isolatedCellCount) / 12);

  if (detailGain72 > 0.08 && extraNoise < 0.1) {
    return "fine";
  }
  return "standard";
}

export async function recommendSimpleSize(image, mode, options = {}) {
  const baseConfig = deepMerge(defaultPixelEngineConfig, getPixelEngineConfigForMode(mode));
  const engine = new ImagePixelEngine({ config: deepMerge(baseConfig, options.config || {}) });
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const candidates = [];

  for (let index = 0; index < SIMPLE_SIZE_OPTIONS.length; index += 1) {
    const option = SIMPLE_SIZE_OPTIONS[index];
    onProgress(
      Math.round((index / SIMPLE_SIZE_OPTIONS.length) * 100),
      `evaluating ${option.label}`
    );

    const result = await engine.process(image, {
      mode,
      targetSize: option.size,
      config: deepMerge(baseConfig, { targetGridSize: option.size })
    });

    const quality = analyzeGridQuality(result.beadGrid, {
      mode,
      paletteMapper: engine.paletteMapper,
      config: baseConfig
    });

    const metrics = createMetrics(quality, option);
    candidates.push({
      option,
      size: option.size,
      grid: result.beadGrid,
      metrics,
      score: scoreCandidate(metrics),
      internalReasons: quality.reasons || [],
      warnings: [],
      userReason: "",
      debug: result.debug
    });
  }

  const complexity = analyzeImageComplexity(candidates);
  for (const candidate of candidates) {
    candidate.userReason = createUserReason(candidate.option, complexity, candidate.metrics);
    candidate.warnings = createWarnings(candidate.option, candidate.metrics);
  }

  const candidate48 = candidates.find((item) => item.option.size === 48);
  const candidate64 = candidates.find((item) => item.option.size === 64);
  const candidate72 = candidates.find((item) => item.option.size === 72);

  let recommended = candidates.reduce((best, current) => (
    current.score > best.score ? current : best
  ), candidates[0]);

  if (complexity.estimatedRecommendedSize === 72 && candidate72 && candidate64) {
    recommended = compareStandardAndFine(candidate64, candidate72) === "fine" ? candidate72 : candidate64;
  } else if (complexity.estimatedRecommendedSize === 64 && candidate64) {
    recommended = candidate64.score >= recommended.score - 0.03 ? candidate64 : recommended;
  } else if (complexity.estimatedRecommendedSize === 48 && candidate48) {
    recommended = candidate48.score >= recommended.score - 0.02 ? candidate48 : recommended;
  }

  onProgress(100, `recommended ${recommended.option.label}`);

  return {
    recommendedOption: recommended.option,
    recommendedGrid: recommended.grid,
    recommendedSize: recommended.option.size,
    candidates,
    userMessage: `推荐：${recommended.option.label}。${recommended.userReason}`,
    complexity
  };
}

export { compareStandardAndFine };
