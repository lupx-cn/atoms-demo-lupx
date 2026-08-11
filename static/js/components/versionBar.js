// components/versionBar.js —— 代码版本标签栏渲染（V1/V2/...）
export function renderVersionBar(container, versions, activeIndex, opts = {}) {
  container.innerHTML = '';
  const { onSelect } = opts;
  versions.forEach((v, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'version-tab' + (i === activeIndex ? ' version-tab--active' : '');
    tab.textContent = v.label || 'V' + (i + 1);
    // tooltip 极简化：仅显示版本与时间，不展示需求摘要（避免误认为 AI 说明文字）
    tab.title = v.createdAt
      ? (v.label || 'V' + (i + 1)) + ' · ' + new Date(v.createdAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : (v.label || 'V' + (i + 1));
    tab.addEventListener('click', () => { if (onSelect) onSelect(i); });
    container.appendChild(tab);
  });
}
