export function createImageUploader({
  sizes,
  defaultValue,
  onSizeChange,
  onFileSelect,
  onLibraryOpen
}) {
  const element = document.createElement("section");
  element.className = "top-panel";
  element.innerHTML = `
    <div class="hero-spark hero-spark-left" aria-hidden="true">+</div>
    <div class="hero-spark hero-spark-right" aria-hidden="true">+</div>
    <div class="topbar">
      <button type="button" class="pixel-action-btn upload-btn" data-action="upload-shortcut" aria-label="上传图片">
        <span class="pixel-action-icon">↑</span>
        <span class="pixel-action-text">上传图纸</span>
      </button>

      <label class="title-upload" aria-label="上传图片转换图纸">
        <input type="file" accept="image/*" hidden />
        <span class="title-spark" aria-hidden="true">♡</span>
        <div class="brand-copy">
          <h1>在线拼豆</h1>
          <p class="subcopy js-upload-copy"></p>
        </div>
        <span class="title-spark" aria-hidden="true">♡</span>
      </label>

      <button type="button" class="pixel-action-btn library-btn" data-action="open-library">
        <span class="pixel-action-icon">□</span>
        <span class="pixel-action-text">我的图纸</span>
      </button>
    </div>

    <div class="simple-size-block panel">
      <div class="size-tabs"></div>
    </div>
  `;

  const fileInput = element.querySelector("input[type='file']");
  const tabs = element.querySelector(".size-tabs");
  const uploadCopy = element.querySelector(".js-upload-copy");
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

  element.querySelector("[data-action='upload-shortcut']").addEventListener("click", () => {
    fileInput.click();
  });

  return {
    element,
    setActiveSize(nextValue) {
      activeSize = nextValue;
      tabs.querySelectorAll(".size-tab").forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.value === String(nextValue));
      });
    },
    setBusy(isBusy, label = "") {
      uploadCopy.textContent = label;
      element.classList.toggle("is-busy", isBusy);
    }
  };
}
