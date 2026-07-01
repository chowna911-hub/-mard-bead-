export function createConvertSettingsPanel({ onModeChange }) {
  const element = document.createElement("section");
  element.className = "panel stats-panel";
  element.innerHTML = `
    <div class="stats-head">
      <div>
        <h2>转换设置</h2>
        <p>模式会影响色号数量、轮廓强度和小特征保护策略，但不会写死任何样例对象规则。</p>
      </div>
    </div>
    <div class="settings-grid">
      <label class="setting-card">
        <span>转换模式</span>
        <select>
          <option value="cartoon">cartoon</option>
          <option value="icon">icon</option>
          <option value="portrait">portrait</option>
          <option value="sticker">sticker</option>
        </select>
      </label>
    </div>
  `;

  const select = element.querySelector("select");
  select.addEventListener("change", () => onModeChange(select.value));

  return { element };
}
