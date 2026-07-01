import { MARD_PALETTE } from "../modules/image/mardPalette.js";

function formatCount(progressStats, code) {
  const item = progressStats?.perColor?.[code];
  if (!item) return "";
  return `${item.placedCount}/${item.targetCount}`;
}

export function createPaletteStatsPanel({ onSelectCode }) {
  const element = document.createElement("section");
  element.className = "panel stats-panel";
  element.innerHTML = `
    <div class="stats-head compact-stats-head">
      <div>
        <h2>颜色豆盒</h2>
        <p>点一下色号选画笔，底稿里对应位置会高亮出来。</p>
      </div>
      <button type="button" class="secondary-btn" data-action="clear-focus">清空选择</button>
    </div>
    <div class="palette-summary"></div>
    <div class="palette-grid"></div>
  `;

  const summary = element.querySelector(".palette-summary");
  const grid = element.querySelector(".palette-grid");

  element.querySelector("[data-action='clear-focus']").addEventListener("click", () => onSelectCode(null, null));

  return {
    element,
    render(gridData, paletteMapper, activeCode, progressStats = null) {
      const totalColors = MARD_PALETTE.length;
      const usedColors = gridData ? Object.keys(gridData.paletteStats || {}).length : 0;
      const placedCells = progressStats?.placedCells ?? 0;
      const totalCells = progressStats?.totalTargetCells ?? 0;

      summary.innerHTML = `
        <div class="summary-pill">
          <strong>${totalColors}</strong>
          <span>全部色号</span>
        </div>
        <div class="summary-pill">
          <strong>${usedColors}</strong>
          <span>本图使用</span>
        </div>
        <div class="summary-pill">
          <strong>${placedCells}/${totalCells}</strong>
          <span>当前进度</span>
        </div>
      `;

      grid.innerHTML = "";
      MARD_PALETTE.forEach((entry) => {
        const card = document.createElement("button");
        const swatchTextColor = getContrastText(entry.hex);
        const countText = formatCount(progressStats, entry.code);
        const isUsed = Boolean(gridData?.paletteStats?.[entry.code]);

        card.type = "button";
        card.className = `palette-card${activeCode === entry.code ? " is-active" : ""}${isUsed ? " is-used" : ""}`;
        card.innerHTML = `
          <span class="palette-swatch" style="background:${entry.hex}; color:${swatchTextColor}">${entry.code}</span>
          <strong>${entry.code}</strong>
          <span class="palette-name">${entry.name}</span>
          <em>${countText || "未使用"}</em>
        `;
        card.addEventListener("click", () => {
          onSelectCode(entry.code, {
            ...entry,
            rgb: paletteMapper.getByCode(entry.code)?.rgb || null
          });
        });
        grid.appendChild(card);
      });
    }
  };
}

function getContrastText(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 168 ? "#344054" : "#ffffff";
}
