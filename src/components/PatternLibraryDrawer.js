function formatTime(value) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch (error) {
    return "";
  }
}

export function createPatternLibraryDrawer({
  onLoad,
  onDelete
}) {
  const element = document.createElement("section");
  element.className = "drawer-shell is-hidden";
  element.innerHTML = `
    <div class="drawer-backdrop" data-action="close"></div>
    <div class="drawer-panel">
      <div class="drawer-head">
        <div>
          <h2>我的图纸</h2>
          <p>这里会保留最近做过的图纸，点开就能继续。</p>
        </div>
        <button type="button" class="secondary-btn" data-action="close">关闭</button>
      </div>
      <div class="drawer-list"></div>
    </div>
  `;

  const list = element.querySelector(".drawer-list");

  element.querySelectorAll("[data-action='close']").forEach((node) => {
    node.addEventListener("click", () => {
      element.classList.add("is-hidden");
    });
  });

  return {
    element,
    open() {
      element.classList.remove("is-hidden");
    },
    close() {
      element.classList.add("is-hidden");
    },
    render(items) {
      list.innerHTML = "";
      if (!items.length) {
        list.innerHTML = `
          <div class="drawer-empty">
            <strong>还没有保存过图纸</strong>
            <span>上传一张图开始制作，系统会自动帮你留住最近的进度。</span>
          </div>
        `;
        return;
      }

      items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "library-card";
        card.innerHTML = `
          <button type="button" class="library-main" data-action="load">
            <div class="library-thumb-wrap">
              ${item.thumbnail ? `<img src="${item.thumbnail}" alt="${item.name}" class="library-thumb" />` : '<div class="library-thumb is-placeholder">图纸</div>'}
            </div>
            <div class="library-copy">
              <strong>${item.name}</strong>
              <span>${item.sizeLabel}</span>
              <em>${formatTime(item.updatedAt)} · ${item.progressPercent}%</em>
            </div>
          </button>
          <button type="button" class="library-delete" data-action="delete">删除</button>
        `;
        card.querySelector("[data-action='load']").addEventListener("click", () => onLoad(item));
        card.querySelector("[data-action='delete']").addEventListener("click", () => onDelete(item));
        list.appendChild(card);
      });
    }
  };
}
