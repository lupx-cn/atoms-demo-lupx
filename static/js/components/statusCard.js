// components/statusCard.js —— Agent 状态卡片序列
// 阶段顺序：需求分析 → 方案规划 → 代码生成 → 渲染预览
const PHASE_STEPS = [
  { phase: 'analyzing', label: '需求分析' },
  { phase: 'planning', label: '方案规划' },
  { phase: 'generating', label: '代码生成' },
  { phase: 'rendering', label: '渲染预览' },
];

const RANK = { idle: -1, analyzing: 0, planning: 1, generating: 2, rendering: 3, done: 4 };

export function renderStatusCards(container, phase = 'idle', errorMessage = '') {
  if (!container) return;
  container.innerHTML = '';

  const rank = RANK[phase] ?? -1;

  PHASE_STEPS.forEach((step) => {
    const card = document.createElement('div');
    card.className = 'status-card';
    card.dataset.phase = step.phase;

    const dot = document.createElement('span');
    dot.className = 'dot';

    const label = document.createElement('span');
    label.textContent = step.label;

    if (phase === 'done') {
      card.classList.add('status-card--done');
    } else if (rank >= 0) {
      const stepRank = RANK[step.phase];
      if (stepRank < rank) card.classList.add('status-card--done');
      if (stepRank === rank) card.classList.add('status-card--active');
    }

    card.append(dot, label);
    container.appendChild(card);
  });

  if (phase === 'error' && errorMessage) {
    const err = document.createElement('div');
    err.className = 'status-card status-card--error';
    err.textContent = '⚠ ' + errorMessage;
    container.appendChild(err);
  }
}
