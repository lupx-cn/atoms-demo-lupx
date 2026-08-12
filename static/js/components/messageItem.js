// components/messageItem.js —— 消息渲染：user 气泡；assistant 生成结果卡片（v2.1 可展开）
// opts: { versionIndex, versionLabel, prompt, createdAt, process, note, onPreview(idx), onCopy(code), onDownload(idx) }

/** 生成过程阶段（与状态机 phase 对齐） */
const PROCESS_STEPS = [
  { key: 'analyzing', label: '需求分析' },
  { key: 'planning', label: '方案规划' },
  { key: 'generating', label: '代码生成' },
  { key: 'rendering', label: '渲染预览' },
];

/** 生成中卡片状态文案（随状态机 phase 切换） */
export const PHASE_ACTIVE_LABEL = {
  analyzing: '需求分析中…',
  planning: '方案规划中…',
  generating: '正在生成代码…',
  rendering: '渲染预览中…',
};

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDur(a, b) {
  if (!a || !b || b <= a) return '';
  const s = (b - a) / 1000;
  return (s >= 60 ? (s / 60).toFixed(1) + ' min' : s.toFixed(1) + ' s');
}

export function createMessageElement(msg, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (msg.role === 'user' ? 'msg--user' : 'msg--assistant');

  if (msg.role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.content;
    wrap.appendChild(bubble);
    return wrap;
  }

  // assistant：生成中 → 轻量状态卡；完成 → 版本卡片；失败 → 错误气泡
  if (msg.status === 'generating') {
    const card = document.createElement('div');
    card.className = 'msg-card';
    const head = document.createElement('div');
    head.className = 'msg-card-head';
    const badge = document.createElement('span');
    badge.className = 'msg-card-badge';
    badge.textContent = '生成中';
    const info = document.createElement('span');
    info.className = 'msg-card-info';
    info.textContent = PHASE_ACTIVE_LABEL[opts.phase] || '正在生成代码…';
    head.append(badge, info);
    const size = document.createElement('div');
    size.className = 'msg-card-size msg-card-info';
    size.textContent = '';
    const stream = document.createElement('div');
    stream.className = 'msg-card-stream hidden';
    card.append(head, size, stream);
    wrap.appendChild(card);
    return wrap;
  }

  if (msg.status === 'done' && msg.content) {
    const card = document.createElement('div');
    card.className = 'msg-card';
    const head = document.createElement('div');
    head.className = 'msg-card-head';
    const badge = document.createElement('span');
    badge.className = 'msg-card-badge';
    badge.textContent = opts.versionLabel || 'V' + ((opts.versionIndex ?? 0) + 1);
    const info = document.createElement('span');
    info.className = 'msg-card-info';
    info.textContent = opts.prompt ? opts.prompt.slice(0, 60) : '已生成';
    info.title = opts.prompt || '';
    const time = document.createElement('span');
    time.className = 'msg-card-time';
    time.textContent = opts.createdAt
      ? new Date(opts.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : '';
    head.append(badge, info, time);

    // 详情区：需求全文 / 阶段时间轴 / AI 说明
    const detail = document.createElement('div');
    detail.className = 'msg-card-detail';
    detail.classList.add('hidden');
    let hasDetail = false;

    if (opts.prompt) {
      const t = document.createElement('div');
      t.className = 'd-title';
      t.textContent = '需求';
      const txt = document.createElement('div');
      txt.className = 'd-text';
      txt.textContent = opts.prompt;
      detail.append(t, txt);
      hasDetail = true;
    }

    if (opts.process && typeof opts.process === 'object') {
      const t = document.createElement('div');
      t.className = 'd-title';
      t.textContent = '生成过程';
      const proc = document.createElement('div');
      proc.className = 'msg-card-process';
      const times = PROCESS_STEPS.map((s) => ({ step: s, ts: opts.process[s.key] }));
      times.forEach(({ step, ts }, i) => {
        const el = document.createElement('span');
        el.className = 'step';
        if (ts) {
          const b = document.createElement('b');
          b.textContent = step.label + ' ' + fmtTime(ts);
          el.appendChild(b);
          const next = times[i + 1];
          const dur = next && next.ts ? fmtDur(ts, next.ts) : '';
          if (dur) el.append(' · ' + dur);
        } else {
          el.textContent = step.label + ' —';
        }
        proc.appendChild(el);
      });
      detail.append(t, proc);
      hasDetail = true;
    }

    if (opts.stageText && typeof opts.stageText === 'object') {
      const stageBlocks = ['analyzing', 'planning']
        .map((key) => {
          const step = PROCESS_STEPS.find((s) => s.key === key);
          return { label: step ? step.label : key, text: opts.stageText[key] };
        })
        .filter((s) => s.text && String(s.text).trim());
      if (stageBlocks.length) {
        const t = document.createElement('div');
        t.className = 'd-title';
        t.textContent = '阶段内容';
        detail.append(t);
        stageBlocks.forEach((s) => {
          const block = document.createElement('div');
          block.className = 'd-stage';
          const b = document.createElement('b');
          b.textContent = s.label;
          const txt = document.createElement('div');
          txt.className = 'd-text';
          txt.textContent = s.text;
          block.append(b, txt);
          detail.append(block);
        });
        hasDetail = true;
      }
    }

    if (opts.note) {
      const t = document.createElement('div');
      t.className = 'd-title';
      t.textContent = 'AI 说明';
      const txt = document.createElement('div');
      txt.className = 'd-text';
      txt.textContent = opts.note;
      detail.append(t, txt);
      hasDetail = true;
    }

    const actions = document.createElement('div');
    actions.className = 'msg-card-actions';
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg-card-btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };

    if (hasDetail) {
      const toggle = mkBtn('▸ 展开详情', () => {
        const expanded = !detail.classList.contains('hidden');
        detail.classList.toggle('hidden', expanded);
        toggle.textContent = expanded ? '▸ 展开详情' : '▾ 收起详情';
      });
      actions.appendChild(toggle);
    }
    actions.appendChild(mkBtn('在预览中查看', () => opts.onPreview && opts.onPreview(opts.versionIndex)));
    actions.appendChild(mkBtn('复制代码', () => opts.onCopy && opts.onCopy(msg.content)));
    actions.appendChild(mkBtn('下载', () => opts.onDownload && opts.onDownload(opts.versionIndex)));
    card.append(head, actions, detail);
    wrap.appendChild(card);
    return wrap;
  }

  // error / 其他状态
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.content || '生成失败';
  wrap.appendChild(bubble);
  if (msg.status === 'error') {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = '生成失败';
    wrap.appendChild(meta);
  }
  return wrap;
}
