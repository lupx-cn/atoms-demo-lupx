// components/versionBar.js —— 代码版本标签栏渲染（V1/V2/...）
export function renderVersionBar(container, versions, activeIndex, opts = {}) {
  container.innerHTML = '';
  const { onSelect } = opts;
  versions.forEach((v, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'version-tab' + (i === activeIndex ? ' version-tab--active' : '');
    tab.textContent = v.label || 'V' + (i + 1);
    const tip = [];
    if (v.prompt) tip.push('需求：' + v.prompt.slice(0, 60));
    if (v.createdAt) tip.push(new Date(v.createdAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    tab.title = tip.join(' · ');
    tab.addEventListener('click', () => { if (onSelect) onSelect(i); });
    container.appendChild(tab);
  });
}
