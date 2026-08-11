// components/fileTree.js —— 轻量文件资源管理器（当前单文件 index.html，为多文件扩展预留）
export function renderFileTree(container, files) {
  if (!container) return;
  container.innerHTML = '';
  if (!files || files.length === 0) {
    container.innerHTML = '<div class="empty-hint">暂无文件</div>';
    return;
  }
  files.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'file-tree-item' + (f.active ? ' file-tree-item--active' : '');
    item.textContent = '📄 ' + f.name;
    item.title = f.path || f.name;
    item.addEventListener('click', () => { if (f.onSelect) f.onSelect(f); });
    container.appendChild(item);
  });
}