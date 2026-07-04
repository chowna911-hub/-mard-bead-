export const EMPTY_CELL_COLOR = "transparent";
export const DEFAULT_CONVERT_MODE = "cartoon";

export const defaultPixelEngineConfig = {
  mode: DEFAULT_CONVERT_MODE,
  targetGridSize: 60,
  subjectFitRatio: 0.88,
  paddingCells: 1,
  sampleStrideCap: 5,
  featureSampleStride: 1,

  background: {
    alphaThreshold: 20,
    bgThreshold: 32,
    edgeSampleRatio: 0.05,
    edgeClusterDistance: 26,
    maxBackgroundClusters: 3,
    minComponentAreaRatio: 0.001
  },

  downsample: {
    minSubjectRatio: 0.35,
    useMedianColor: true,
    preserveDominantColor: true
  },

  colorQuantization: {
    clusterCount: 8,
    maxColors: 8,
    useLimitedPalette: true,
    quantVoteBoost: 1.15
  },

  paletteMapping: {
    enableHueGuard: true,
    crossHuePenalty: 1.35,
    grayPenaltyForSaturatedSource: 1.45,
    minSaturationForHueGuard: 0.18,
    allowCrossHueOnlyIfDeltaEImprovesBy: 0.25
  },

  macro: {
    enableSemanticPrepass: true,
    coreColorCount: 6,
    dominantNeighborhoodWeight: 1.35,
    dominantCenterWeight: 1.15,
    regionMajorityPasses: 2,
    lineDarknessThreshold: 64,
    lineContrastThreshold: 46,
    lineContinuityThreshold: 2,
    lineVoteBoost: 1.85,
    lineMinBlockRatio: 0.12
  },

  outline: {
    enableOutlineLayer: true,
    outlineColorCode: "H7",
    externalOutlineWidth: 1,
    internalLinePreserve: true,
    lineDarknessThreshold: 50,
    lineContrastThreshold: 55,
    lineSaturationThreshold: 0.32,
    maxLineWidth: 1,
    removeIsolatedDarkPixels: true,
    bridgeSmallGaps: true,
    thinThickOutline: true,
    maxInternalLineComponentAreaRatio: 0.03,
    minLineAspectRatio: 1.8
  },

  feature: {
    enableHighlightPreserve: true,
    highlightLightnessThreshold: 210,
    highlightContrastThreshold: 40,
    enableSmallColorFeaturePreserve: true,
    enableSmallDarkFeaturePreserve: true,
    minFeatureAreaCells: 1,
    maxFeatureAreaRatio: 0.08,
    highSaturationThreshold: 0.6,
    saturationThreshold: 0.6,
    localContrastThreshold: 35,
    maxDistanceToMainComponent: 2
  },

  localStableColor: {
    enable: true,
    minComponentAreaCells: 2,
    maxComponentAreaRatio: 0.2,
    minLocalContrast: 18,
    minHueConsistency: 0.65,
    minSaturation: 0.18,
    preserveMediumSaturationColors: true,
    localColorDistanceThreshold: 42
  },

  detail: {
    detailEnhanceMode: "cartoon-face",
    removeNoise: true,
    preserveSmallDarkComponents: true,
    separateMergedDarkFeatures: true
  },

  cleanup: {
    removeIsolatedCells: true,
    minNeighborCount: 2,
    removeDisconnectedComponents: true,
    keepNearbySmallComponents: true,
    maxDetachedComponentDistance: 2,
    minDetachedComponentArea: 2,
    stabilizeLargeRegions: true
  },

  finalGrid: {
    enableAutoCrop: true,
    paddingCells: 2,
    minPaddingCells: 1,
    maxPaddingCells: 3
  }
};

export const pixelEngineModePresets = {
  cartoon: {
    mode: "cartoon",
    targetGridSize: 60,
    subjectFitRatio: 0.88,
    colorQuantization: {
      clusterCount: 8,
      maxColors: 8
    },
    macro: {
      coreColorCount: 6,
      regionMajorityPasses: 2
    },
    outline: {
      lineDarknessThreshold: 50,
      lineContrastThreshold: 55,
      maxLineWidth: 1
    },
    feature: {
      enableHighlightPreserve: true,
      enableSmallColorFeaturePreserve: true
    }
  },
  icon: {
    mode: "icon",
    targetGridSize: 48,
    subjectFitRatio: 0.9,
    colorQuantization: {
      clusterCount: 6,
      maxColors: 6
    },
    macro: {
      coreColorCount: 5,
      regionMajorityPasses: 2
    },
    outline: {
      lineDarknessThreshold: 48,
      lineContrastThreshold: 58,
      maxLineWidth: 1
    },
    feature: {
      enableHighlightPreserve: false,
      enableSmallColorFeaturePreserve: true
    }
  },
  portrait: {
    mode: "portrait",
    targetGridSize: 64,
    subjectFitRatio: 0.9,
    colorQuantization: {
      clusterCount: 9,
      maxColors: 9
    },
    macro: {
      coreColorCount: 6,
      regionMajorityPasses: 2
    },
    outline: {
      lineDarknessThreshold: 52,
      lineContrastThreshold: 58,
      maxLineWidth: 1
    },
    feature: {
      enableHighlightPreserve: true,
      enableSmallColorFeaturePreserve: true
    },
    detail: {
      detailEnhanceMode: "cartoon-face",
      preserveSmallDarkComponents: true,
      separateMergedDarkFeatures: true
    }
  },
  sticker: {
    mode: "sticker",
    targetGridSize: 60,
    subjectFitRatio: 0.9,
    background: {
      alphaThreshold: 18,
      bgThreshold: 30
    },
    colorQuantization: {
      clusterCount: 7,
      maxColors: 8
    },
    macro: {
      coreColorCount: 6,
      regionMajorityPasses: 2
    },
    outline: {
      lineDarknessThreshold: 50,
      lineContrastThreshold: 56,
      maxLineWidth: 1
    },
    feature: {
      enableHighlightPreserve: true,
      enableSmallColorFeaturePreserve: true
    }
  }
};

export function getPixelEngineConfigForMode(mode = DEFAULT_CONVERT_MODE) {
  return pixelEngineModePresets[mode] || pixelEngineModePresets[DEFAULT_CONVERT_MODE];
}

export function createEmptyCell(x, y) {
  return {
    x,
    y,
    code: null,
    color: EMPTY_CELL_COLOR,
    hex: null,
    rgb: null,
    isBackground: true,
    isOutline: false,
    isHighlight: false
  };
}

export function createPaletteStat(meta, count = 0) {
  return {
    code: meta.code,
    name: meta.name,
    hex: meta.hex,
    count
  };
}
