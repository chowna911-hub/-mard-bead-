export function createImageUploader({
  sizes,
  defaultValue,
  onSizeChange,
  onFileSelect,
  onLibraryOpen
}) {
  const element = document.createElement("section");
  element.className = "panel top-panel";
  element.innerHTML = `
    <div class="topbar">
      <div class="brand-copy">
        <p class="eyebrow">赛博拼豆助手</p>
        <h1>轻松把图片变成拼豆图纸</h1>
        <p class="subcopy">上传图片，选一个常用尺寸，就可以开始拼豆。</p>
      </div>
      <div class="topbar-actions">
        <label class="primary-btn upload-entry">
          <input type="file" accept="image/*" hidden />
          <span>转换图纸</span>
        </label>
        <button type="button" class="secondary-btn" data-action="open-library">我的图纸</button>
      </div>
    </div>
    <div class="simple-size-block">
      <div class="section-title">
        <strong>图纸尺寸</strong>
        <span>默认 64×64，适合大部分卡通和头像。</span>
      </div>
      <div class="size-tabs"></div>
    </div>
  `;

  const fileInput = element.querySelector("input[type='file']");
  const tabs = element.querySelector(".size-tabs");
  let activeSize = defaultValue ?? sizes[0].value;

  sizes.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = String(item.value);
    button.className = `size-tab${item.value === activeSize ? " is-active" : ""}`;
    button.innerHTML = `<strong>${item.label}</strong><span>${item.desc}</span>`;
    button.addEventListener("click", () => {
      activeSize = item.value;
      tabs.querySelectorAll(".size-tab").forEach((tab) => {
        tab.classList.toggle("is-active", tab === button);
      });
      onSizeChange(item.value);
    });
    tabs.appendChild(button);
  });

  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files || [];
    if (file) {
      onFileSelect(file);
      fileInput.value = "";
    }
  });

  element.querySelector("[data-action='open-library']").addEventListener("click", () => {
    onLibraryOpen?.();
  });

  return {
    element,
    setActiveSize(nextValue) {
      activeSize = nextValue;
      tabs.querySelectorAll(".size-tab").forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.value === String(nextValue));
      });
    },
    setBusy(isBusy, label = "转换图纸") {
      const entry = element.querySelector(".upload-entry");
      entry.querySelector("span").textContent = label;
      entry.classList.toggle("is-busy", isBusy);
    }
  };
}
