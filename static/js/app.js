// app.js —— 入口与初始化：三栏布局、右栏多功能面板（预览/代码）、会话管理、SSE 生成流
import { getState, setState, resetPhase, getActiveSession, subscribe } from './state.js';
import { loadSessions, saveSessions, loadActiveSessionId, saveActiveSessionId, loadPref, savePref } from './storage.js';
import { streamGenerate } from './api.js';
import { renderCode, getFrame } from './preview.js';
import { renderStatusCards } from './components/statusCard.js';
import { createMessageElement } from './components/messageItem.js';
import { renderVersionBar } from './components/versionBar.js';
import { renderFileTree } from './components/fileTree.js';
import { downloadTextFile } from './download.js';

const PREVIEW_BASE_WIDTH = 1024; // 预览 iframe 基准渲染宽度：页面固定按此宽度渲染，再等比缩放适配窗口

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Atoms-Demo 预览</title></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#0f172a,#1e293b);color:#94a3b8;font-family:system-ui,sans-serif;">
  <div style="text-align:center;">
    <div style="font-size:48px;">🖥️</div>
    <p style="margin-top:12px;font-size:14px;">输入需求并点击「生成」，预览区将实时展示 AI 生成的网页</p>
  </div>
</body>
</html>`;

const els = {
  healthDot: document.getElementById('health-dot'),
  btnNewSession: document.getElementById('btn-new-session'),
  colLeft: document.getElementById('col-left'),
  colMid: document.getElementById('col-mid'),
  sessionListBody: document.getElementById('session-list-body'),
  btnCollapseSessions: document.getElementById('btn-collapse-sessions'),
  sessionList: document.getElementById('session-list'),
  sessionSearch: document.getElementById('session-search'),
  sessionCount: document.getElementById('session-count'),
  currentSessionTitle: document.getElementById('current-session-title'),
  // 右栏多功能面板
  tabPreview: document.getElementById('tab-preview'),
  tabCode: document.getElementById('tab-code'),
  panelPreview: document.getElementById('panel-preview'),
  panelCode: document.getElementById('panel-code'),
  btnDownload: document.getElementById('btn-download'),
  btnDownloadCode: document.getElementById('btn-download-code'),
  btnSaveCode: document.getElementById('btn-save-code'),
  codeEditor: document.getElementById('code-editor'),
  codeSize: document.getElementById('code-size'),
  fileTree: document.getElementById('file-tree'),
  previewCanvas: document.getElementById('preview-canvas'),
  browserWindow: document.getElementById('browser-window'),
  browserChrome: document.getElementById('browser-chrome'),
  browserRefresh: document.getElementById('browser-refresh'),
  browserResize: document.getElementById('browser-resize'),
  browserUrl: document.getElementById('browser-url'),
  browserFrameWrap: document.getElementById('browser-frame-wrap'),
  versionBar: document.getElementById('version-bar'),
  messageList: document.getElementById('message-list'),
  statusCards: document.getElementById('status-cards'),
  promptInput: document.getElementById('prompt-input'),
  btnSend: document.getElementById('btn-send'),
  toastContainer: document.getElementById('toast-container'),
};

let liveAssistantEl = null;      // 当前流式消息的 DOM 元素（生成中卡片）
let liveAssistantMsg = null;     // 当前流式消息数据对象
let liveAssistantSizeEl = null;  // 生成中卡片的输出大小指示
let liveAssistantStreamEl = null; // 生成中卡片的实时阶段文字区（需求分析/方案规划）
let sessionListCollapsed = false;
let sessionSearchKeyword = '';
let panelTab = 'preview';        // 右栏模式：preview | code
let browserState = null;         // 浏览器窗口 {x,y,w,h}

/* ---------- 会话工具 ---------- */

function createSession(title = '新会话') {
  return {
    id: (crypto.randomUUID && crypto.randomUUID()) || 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title,
    messages: [],
    lastCode: '',
    versions: [],
    activeVersionIndex: -1,
    updatedAt: Date.now(),
  };
}

/* ---------- 渲染 ---------- */

function renderAll() {
  renderSessionList();
  renderMessages();
  renderStatusCards(els.statusCards, getState().phase);
  renderCurrentSessionBar();
}

function renderSessionList() {
  const { sessions, activeSessionId } = getState();
  els.sessionList.innerHTML = '';

  const kw = sessionSearchKeyword;
  const filtered = kw ? sessions.filter((s) => s.title.toLowerCase().includes(kw)) : sessions;
  els.sessionCount.textContent = sessions.length > 0 ? '(' + filtered.length + '/' + sessions.length + ')' : '';

  if (filtered.length === 0) {
    els.sessionList.innerHTML = '<li class="empty-hint">' + (kw ? '无匹配会话' : '暂无会话') + '</li>';
    return;
  }

  filtered.forEach((s) => {
    const li = document.createElement('li');
    const item = document.createElement('div');
    item.className = 'session-item' + (s.id === activeSessionId ? ' session-item--active' : '');
    item.title = s.title;
    item.addEventListener('click', () => switchSession(s.id));

    const label = document.createElement('span');
    label.className = 'session-title';
    label.textContent = s.title;
    label.title = s.title + '（双击重命名）';
    label.addEventListener('dblclick', (e) => { e.stopPropagation(); renameSession(s.id); });

    const actions = document.createElement('span');
    actions.className = 'session-actions';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'session-del';
    del.textContent = '✕';
    del.title = '删除会话';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(s.id); });
    actions.appendChild(del);

    const time = document.createElement('span');
    time.className = 'text-[10px] text-slate-600';
    time.textContent = new Date(s.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    item.appendChild(label);
    item.appendChild(actions);
    item.appendChild(time);
    li.appendChild(item);
    els.sessionList.appendChild(li);
  });
}

function renderMessages() {
  const session = getActiveSession();
  els.messageList.innerHTML = '';

  if (!session || session.messages.length === 0) {
    els.messageList.innerHTML = '<div class="empty-hint">输入需求，AI 将为你生成网页</div>';
    return;
  }

  let doneCount = 0;
  session.messages.forEach((msg) => {
    if (msg.role === 'assistant' && msg.status === 'done') doneCount += 1;
    const vIndex = doneCount - 1;
    const v = (session.versions && session.versions[vIndex]) || null;
    els.messageList.appendChild(createMessageElement(msg, {
      versionIndex: vIndex,
      versionLabel: v ? v.label : null,
      prompt: v ? v.prompt : '',
      createdAt: v ? v.createdAt : null,
      process: v ? v.process : null,
      note: v ? v.note : '',
      stageText: v ? v.stageText : null,
      onPreview: (idx) => previewVersionFromCard(idx),
      onCopy: (idx) => copyCode(idx),
      onDownload: (idx) => downloadHtml(idx),
    }));
  });
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

/* ---------- 版本管理 ---------- */

/** 旧数据兼容迁移：无 versions 时从 messages 中重建（每条 done 的 assistant 消息 = 一版） */
function migrateSession(session) {
  if (!session) return;
  if (!Array.isArray(session.versions) || session.versions.length === 0) {
    const versions = [];
    const msgs = Array.isArray(session.messages) ? session.messages : [];
    let idx = 0;
    msgs.forEach((m, i) => {
      if (m && m.role === 'assistant' && m.status === 'done' && m.content && String(m.content).trim()) {
        idx += 1;
        let prompt = '';
        for (let j = i - 1; j >= 0; j--) {
          if (msgs[j] && msgs[j].role === 'user') { prompt = String(msgs[j].content || ''); break; }
        }
        versions.push({ index: idx, label: 'V' + idx, prompt, code: String(m.content), createdAt: session.updatedAt || Date.now() });
      }
    });
    if (versions.length === 0 && session.lastCode) {
      versions.push({ index: 1, label: 'V1', prompt: session.title || '', code: session.lastCode, createdAt: session.updatedAt || Date.now() });
    }
    session.versions = versions;
  }
  const last = session.versions.length - 1;
  if (typeof session.activeVersionIndex !== 'number' || session.activeVersionIndex < 0 || session.activeVersionIndex > last) {
    session.activeVersionIndex = last;
  }
}

/** 当前迭代基准代码：优先取当前查看版本，无版本时回退 lastCode */
function getBaseCode() {
  const session = getActiveSession();
  if (!session) return '';
  const v = (session.versions && session.versions.length && session.activeVersionIndex >= 0)
    ? session.versions[session.activeVersionIndex] : null;
  return (v && v.code) ? v.code : (session.lastCode || '');
}

/** 渲染版本标签栏（只影响右栏，聊天区不受影响） */
function renderVersionBarUI() {
  const session = getActiveSession();
  const versions = (session && session.versions) || [];
  if (!session || versions.length === 0) {
    els.versionBar.classList.add('hidden');
    els.versionBar.innerHTML = '';
    return;
  }
  els.versionBar.classList.remove('hidden');
  renderVersionBar(els.versionBar, versions, session.activeVersionIndex, {
    onSelect: (index) => {
      const s = getActiveSession();
      if (!s || !s.versions[index]) return;
      s.activeVersionIndex = index;
      const v = s.versions[index];
      const clean = displayCode(v.code);
      setState({ currentCode: clean });
      renderCode(clean);
      syncEditor();
      updateBrowserUrl();
      persistSessions();
      renderVersionBarUI();
    },
  });
}

/** 从消息卡片跳转到指定版本预览（切到预览 Tab，只更新右栏） */
function previewVersionFromCard(idx) {
  const s = getActiveSession();
  if (!s || !s.versions[idx]) return;
  s.activeVersionIndex = idx;
  const v = s.versions[idx];
  const clean = displayCode(v.code);
  setState({ currentCode: clean });
  renderCode(clean);
  syncEditor();
  updateBrowserUrl();
  renderVersionBarUI();
  persistSessions();
  setPanelTab('preview');
  showToast('已切换到 ' + v.label, 'info');
}

/** 复制指定版本代码到剪贴板 */
async function copyCode(idx) {
  const s = getActiveSession();
  const raw = (s && s.versions && s.versions[idx] && s.versions[idx].code) ? s.versions[idx].code : getState().currentCode;
  const code = displayCode(raw);
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('代码已复制', 'success');
  } catch (err) {
    showToast('复制失败，请手动选择代码', 'error');
  }
}

/* ---------- 会话管理 ---------- */

function renderCurrentSessionBar() {
  const session = getActiveSession();
  els.currentSessionTitle.textContent = session ? session.title : '';
}

function toggleSessionList() {
  sessionListCollapsed = !sessionListCollapsed;
  applySessionListCollapsed();
  savePref('sessionListCollapsed', sessionListCollapsed);
}

function applySessionListCollapsed() {
  els.sessionListBody.classList.toggle('hidden', sessionListCollapsed);
  els.btnCollapseSessions.textContent = sessionListCollapsed ? '展开 ▾' : '收起 ▴';
}

function renameSession(id) {
  const session = getState().sessions.find((s) => s.id === id);
  if (!session) return;
  const name = prompt('重命名会话：', session.title);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { showToast('会话名称不能为空', 'error'); return; }
  session.title = trimmed.slice(0, 50);
  session.updatedAt = Date.now();
  persistSessions();
  renderAll();
}

function deleteSession(id) {
  if (getState().isGenerating) { showToast('生成中，请稍候再删除', 'info'); return; }
  if (!confirm('确定删除该会话吗？该操作不可恢复。')) return;
  let sessions = getState().sessions.filter((s) => s.id !== id);
  let activeId = getState().activeSessionId;
  if (activeId === id) {
    activeId = sessions.length ? sessions[0].id : null;
  }
  if (sessions.length === 0) {
    const first = createSession();
    sessions = [first];
    activeId = first.id;
  }
  setState({ sessions, activeSessionId: activeId, currentCode: '' });
  saveSessions(sessions);
  saveActiveSessionId(activeId);
  renderAll();
  renderVersionBarUI();
  const code = displayCode(getBaseCode());
  if (code) {
    renderCode(code);
  } else {
    renderCode(WELCOME_HTML);
  }
  syncEditor();
  updateBrowserUrl();
}

function persistSessions() {
  saveSessions(getState().sessions);
}

function switchSession(id) {
  if (getState().isGenerating) {
    showToast('生成中，请稍候再切换会话', 'info');
    return;
  }
  const session = getState().sessions.find((s) => s.id === id);
  if (!session) return;

  migrateSession(session);
  setState({ activeSessionId: id });
  saveActiveSessionId(id);
  renderAll();
  renderVersionBarUI();

  const code = displayCode(getBaseCode());
  if (code) {
    renderCode(code);
  } else {
    renderCode(WELCOME_HTML);
  }
  setState({ currentCode: code });
  syncEditor();
  updateBrowserUrl();
}

function newSession() {
  if (getState().isGenerating) {
    showToast('生成中，请稍候再新建会话', 'info');
    return;
  }
  const session = createSession();
  setState({ sessions: [session, ...getState().sessions], activeSessionId: session.id, currentCode: '' });
  resetPhase();
  saveSessions(getState().sessions);
  saveActiveSessionId(session.id);
  renderAll();
  renderVersionBarUI();
  renderCode(WELCOME_HTML);
  syncEditor();
  updateBrowserUrl();
  els.promptInput.value = '';
  els.promptInput.focus();
}

/* ---------- 右栏：Tab / 代码编辑器 / 下载 ---------- */

function setPanelTab(tab) {
  panelTab = tab;
  els.tabPreview.classList.toggle('panel-tab--active', tab === 'preview');
  els.tabCode.classList.toggle('panel-tab--active', tab === 'code');
  els.panelPreview.classList.toggle('hidden', tab !== 'preview');
  els.panelCode.classList.toggle('hidden', tab !== 'code');
  if (tab === 'code') {
    syncEditor();
    els.codeEditor.focus();
  } else {
    applyBrowserWindow();
  }
  savePref('panelTab', tab);
}

/** 代码编辑器与当前代码同步（只读回显/编辑基础均为 currentCode） */
function syncEditor() {
  els.codeEditor.value = getState().currentCode;
  updateCodeSize();
}

function updateCodeSize() {
  const code = els.codeEditor.value;
  els.codeSize.textContent = code ? (code.length / 1024).toFixed(1) + ' KB' : '';
}

/** 保存编辑内容：更新当前版本代码 → 刷新预览 → 持久化 */
function saveCode() {
  const session = getActiveSession();
  const code = els.codeEditor.value;
  if (!session) return;
  if (!code.trim()) { showToast('代码为空，未保存', 'error'); return; }

  if (!session.versions.length) {
    session.versions.push({ index: 1, label: 'V1', prompt: session.title || '', code, createdAt: Date.now() });
    session.activeVersionIndex = 0;
  } else {
    const idx = session.activeVersionIndex >= 0 ? session.activeVersionIndex : session.versions.length - 1;
    session.versions[idx] = { ...session.versions[idx], code };
    session.activeVersionIndex = idx;
  }
  session.lastCode = code;
  session.updatedAt = Date.now();
  setState({ currentCode: code });
  renderCode(code);
  updateBrowserUrl();
  persistSessions();
  renderVersionBarUI();
  updateCodeSize();
  showToast('已保存并刷新预览', 'success');
}

/** 下载当前/指定版本 HTML：文件名 = 会话项目名-V{n}.html */
function downloadHtml(idx) {
  const session = getActiveSession();
  if (!session) return;
  const activeIdx = session.activeVersionIndex >= 0 ? session.activeVersionIndex : 0;
  const target = (idx != null && idx >= 0) ? idx : activeIdx;
  const v = session.versions && session.versions[target] ? session.versions[target] : null;
  const code = displayCode(v ? v.code : getState().currentCode);
  if (!code) { showToast('暂无生成内容', 'error'); return; }

  const label = v ? v.label : 'V' + (target + 1);
  const base = (session.title || 'atoms-demo').replace(/[\\/:*?"<>|]/g, '_').trim() || 'atoms-demo';
  const filename = base + '-' + label + '.html';
  downloadTextFile(code, filename);
  showToast('已下载 ' + filename, 'success');
}

function updateBrowserUrl() {
  const code = getState().currentCode;
  const session = getActiveSession();
  els.browserUrl.textContent = code ? ('本地预览 · ' + (session ? session.title : '')) : 'about:blank';
}

/* ---------- 三栏拖拽调宽 ---------- */

function applyColWidths() {
  const w = loadPref('colWidths', null);
  if (w && w.left) els.colLeft.style.width = w.left + 'px';
  if (w && w.mid) els.colMid.style.width = w.mid + 'px';
}

function initResizers() {
  document.querySelectorAll('.col-resizer').forEach((rz) => {
    rz.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const col = rz.dataset.col;
      const startX = e.clientX;
      const startW = col === 'left' ? els.colLeft.offsetWidth : els.colMid.offsetWidth;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        if (col === 'left') {
          els.colLeft.style.width = Math.min(420, Math.max(200, startW + dx)) + 'px';
        } else {
          els.colMid.style.width = Math.min(560, Math.max(300, startW + dx)) + 'px';
        }
      };
      const up = () => {
        savePref('colWidths', { left: els.colLeft.offsetWidth, mid: els.colMid.offsetWidth });
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

/* ---------- 浏览器窗口（拖拽位置 / 右手柄缩放） ---------- */

function initBrowserWindow() {
  browserState = loadPref('browserWindow', null);
  applyBrowserWindow();

  els.browserChrome.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#browser-refresh')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = browserState.x, oy = browserState.y;
    const move = (ev) => {
      browserState.x = ox + (ev.clientX - sx);
      browserState.y = oy + (ev.clientY - sy);
      applyBrowserWindow();
    };
    const up = () => {
      persistBrowser();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  els.browserResize.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const ow = browserState.w, oh = browserState.h;
    const move = (ev) => {
      browserState.w = ow + (ev.clientX - sx);
      browserState.h = oh + (ev.clientY - sy);
      applyBrowserWindow();
    };
    const up = () => {
      persistBrowser();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // 四边缩放手柄（上/下/左/右，与右下角手柄并存）
  document.querySelectorAll('.browser-edge').forEach((edge) => {
    edge.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const side = edge.dataset.edge;
      const sx = e.clientX, sy = e.clientY;
      const ox = browserState.x, oy = browserState.y, ow = browserState.w, oh = browserState.h;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (side === 'top') { browserState.y = oy + dy; browserState.h = oh - dy; }
        else if (side === 'bottom') { browserState.h = oh + dy; }
        else if (side === 'left') { browserState.x = ox + dx; browserState.w = ow - dx; }
        else if (side === 'right') { browserState.w = ow + dx; }
        applyBrowserWindow();
      };
      const up = () => {
        persistBrowser();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });

  els.browserRefresh.addEventListener('click', () => {
    const code = getState().currentCode;
    if (code) { renderCode(code); showToast('预览已刷新', 'info'); }
  });

  window.addEventListener('resize', () => { if (panelTab === 'preview') applyBrowserWindow(); });
}

function applyBrowserWindow() {
  const canvas = els.previewCanvas;
  if (!browserState) {
    const cw = canvas.clientWidth || 800;
    const ch = canvas.clientHeight || 600;
    browserState = {
      x: Math.round(cw * 0.06), y: Math.round(ch * 0.05),
      w: Math.max(360, Math.min(Math.round(cw * 0.88), PREVIEW_BASE_WIDTH + 16)),
      h: Math.max(280, Math.round(ch * 0.88)),
    };
  }
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (cw > 0 && ch > 0) {
    browserState.w = Math.min(Math.max(browserState.w, 320), cw);
    browserState.h = Math.min(Math.max(browserState.h, 220), ch);
    browserState.x = Math.min(Math.max(browserState.x, 0), Math.max(0, cw - browserState.w));
    browserState.y = Math.min(Math.max(browserState.y, 0), Math.max(0, ch - browserState.h));
  }
  els.browserWindow.style.left = browserState.x + 'px';
  els.browserWindow.style.top = browserState.y + 'px';
  els.browserWindow.style.width = browserState.w + 'px';
  els.browserWindow.style.height = browserState.h + 'px';

  // 等比缩放适配：页面固定按基准宽度渲染，整体缩放填充窗口内容区，避免拉伸变形/截断
  const frameWrap = els.browserFrameWrap;
  const frame = getFrame();
  if (frameWrap && frame) {
    const chromeH = els.browserChrome ? (els.browserChrome.offsetHeight || 36) : 36;
    const availW = Math.max(120, browserState.w - 2);
    const availH = Math.max(120, browserState.h - chromeH - 2);
    const scale = Math.min(1, availW / PREVIEW_BASE_WIDTH);
    frame.style.width = PREVIEW_BASE_WIDTH + 'px';
    frame.style.height = Math.round(availH / scale) + 'px';
    frame.style.transform = 'scale(' + scale + ')';
  }
}

function persistBrowser() {
  savePref('browserWindow', browserState);
}

/* ---------- 生成 HTML 净化（剥离 AI 内嵌说明文字） ---------- */

/** 展示用净化：所有预览/代码/下载/复制入口统一剥离历史版本中可能残留的 AI 说明文字 */
function displayCode(raw) {
  return sanitizeCode(raw).code;
}

/** AI 说明段开头的常见客套语（保守匹配，仅用于整段剥离，避免误删页面真实内容） */
const AI_NOTE_LEADINGS = [
  '这是为您', '这是为你', '已为您', '已为你',
  '以下是为您', '以下是你', '下面是为您', '下面是你',
  '本页面由', '该页面由',
  '希望这个页面', '希望该页面',
  '如有任何问题', '如您有任何',
  '如需修改', '如需调整',
];

/** AI 页面说明区块标题：以这些词开头的整块描述文字（描述页面自身而非真实功能），剥离时不受长度/嵌套限制 */
const AI_SECTION_HEADINGS = [
  '页面特点说明', '页面功能说明', '页面功能介绍', '功能特点说明',
  '页面特点', '页面介绍', '页面说明', '页面亮点',
];

/** 是否为 AI 页面说明区块：剥离标签后以说明标题开头，且不含交互元素（避免误删真实页面功能） */
function isSectionNote(rawBlock) {
  if (!rawBlock) return false;
  if (/<(button|input|form|select|textarea|a|iframe)\b[^>]*>/i.test(rawBlock)) return false;
  if (/\sonclick\s*=/i.test(rawBlock)) return false;
  const text = rawBlock.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 0 && AI_SECTION_HEADINGS.some((h) => text.startsWith(h));
}

/** 裸文本行是否为 AI 页面说明区块行（用于 body 开头/结尾逐行剥离） */
function isSectionLine(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 0 && AI_SECTION_HEADINGS.some((h) => t.startsWith(h));
}

/**
 * 保守剥离生成 HTML 内嵌的 AI 说明文字。
 * 仅处理「HTML 注释」与「无嵌套的块级元素（p/div/section/blockquote）」中以客套语开头的段落，
 * 提取到 note 供消息卡片展开展示；预览/下载/复制均使用剥离后的代码。
 * @param {string} raw 原始生成 HTML
 * @returns {{ code: string, note: string }}
 */
function sanitizeCode(raw) {
  if (!raw || typeof raw !== 'string') return { code: raw || '', note: '' };
  let code = raw;
  const notes = [];
  const isNote = (text) => {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    return t.length > 0 && t.length <= 300 && AI_NOTE_LEADINGS.some((k) => t.startsWith(k));
  };

  // ⓪ 文档前导说明 + Markdown 代码围栏：<html>/<!DOCTYPE 之前的所有内容视为说明文字剥离；
  //    若整段输出被 ```html ... ``` 包裹，则提取围栏内部 HTML。
  const docMatch = code.match(/<!DOCTYPE|<!doctype|<html/i);
  const docStart = docMatch ? docMatch.index : -1;
  if (docStart > 0) {
    const head = code.slice(0, docStart).replace(/```(?:html)?/gi, '').trim();
    if (head) notes.push(head);
    code = code.slice(docStart);
  } else if (docStart === -1) {
    const fence = code.match(/```(?:html)?\s*\r?\n?([\s\S]*?)```/i);
    if (fence && fence[1] && fence[1].trim()) {
      const before = code.slice(0, fence.index).replace(/```(?:html)?/gi, '').trim();
      if (before) notes.push(before);
      code = fence[1].trim();
    }
  }
  // 清理残留的独立代码围栏标记行（```html / ```）
  code = code.replace(/^\s*```(?:html)?\s*$/gim, '').replace(/```\s*$/, '');

  // ⓪.5 截断到文档末尾：</html> 闭合标签之后追加的说明文字一律丢弃
  //     （浏览器 HTML5 解析会把 </html> 之后的文本重新并入 body 渲染）
  const htmlCloses = Array.from(code.matchAll(/<\/html\s*>/gi));
  if (htmlCloses.length) {
    const lastClose = htmlCloses[htmlCloses.length - 1];
    code = code.slice(0, lastClose.index + lastClose[0].length);
  } else {
    const bodyClose = code.match(/<\/body\s*>/i);
    if (bodyClose) code = code.slice(0, bodyClose.index + bodyClose[0].length);
  }

  // ① HTML 注释中的说明段（整段注释移除）
  code = code.replace(/<!--[\s\S]*?-->/g, (whole) => {
    const inner = whole.slice(4, -3).replace(/<[^>]*>/g, '');
    if (isNote(inner)) { notes.push(inner.trim()); return ''; }
    return whole;
  });

  // ①.5 AI 页面说明区块：以「页面特点说明」等标题开头的描述容器（允许嵌套 h2/p/ul）整体剥离；
  //     仅剥离不含交互元素的纯说明容器，避免误删真实页面功能。
  code = code.replace(/<(p|div|section|blockquote|article|main|ul)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (whole, tag) => {
    const innerStart = whole.indexOf('>') + 1;
    const innerEnd = whole.lastIndexOf('</');
    if (innerEnd <= innerStart) return whole;
    if (new RegExp('<' + tag + '\\b', 'i').test(whole.slice(innerStart, innerEnd))) return whole; // 嵌套同类块，跳过
    if (isSectionNote(whole)) {
      notes.push(whole.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
      return '';
    }
    return whole;
  });

  // ② 无嵌套块级元素包裹的说明段
  code = code.replace(/<(p|div|section|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (whole, tag) => {
    const innerStart = whole.indexOf('>') + 1;
    const innerEnd = whole.lastIndexOf('</');
    if (innerEnd <= innerStart) return whole;
    if (/<(p|div|section|blockquote)\b/i.test(whole.slice(innerStart, innerEnd))) return whole; // 含嵌套块，跳过
    const inner = whole.replace(/<[^>]*>/g, '');
    if (isNote(inner)) { notes.push(inner.trim()); return ''; }
    return whole;
  });

  // ③ body 开头/结尾的裸文本说明段（客套语 + AI 页面说明区块 + 区块续行的裸文本）
  code = code.replace(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i, (whole, open, body, close) => {
    const lines = body.split(/\r?\n/);
    let inDescRun = false;
    while (lines.length) {
      const raw = lines[0];
      const first = raw.replace(/<[^>]*>/g, '').trim();
      if (!first) { lines.shift(); continue; }
      if (first && (isNote(first) || isSectionLine(first))) {
        notes.push(first);
        if (isSectionLine(first)) inDescRun = true;
        lines.shift();
        continue;
      }
      if (inDescRun && !/<[^>]*>/.test(raw)) { notes.push(first); lines.shift(); continue; }
      break;
    }
    inDescRun = false;
    while (lines.length) {
      const raw = lines[lines.length - 1];
      const last = raw.replace(/<[^>]*>/g, '').trim();
      if (!last) { lines.pop(); continue; }
      if (last && (isNote(last) || isSectionLine(last))) {
        notes.push(last);
        if (isSectionLine(last)) inDescRun = true;
        lines.pop();
        continue;
      }
      if (inDescRun && !/<[^>]*>/.test(raw)) { notes.push(last); lines.pop(); continue; }
      break;
    }
    return open + lines.join('\n') + close;
  });

  // ④ 清理剥离后残留的空块级标签
  code = code.replace(/<(p|div|section|blockquote)\b[^>]*>\s*<\/\1\s*>/gi, '');

  return { code, note: notes.filter(Boolean).join('\n') };
}

/* ---------- 生成流程（SSE 流式 + 卡片化输出） ---------- */

async function handleSend() {
  const prompt = els.promptInput.value.trim();
  if (!prompt) return;
  if (getState().isGenerating) {
    showToast('正在生成中，请稍候…', 'info');
    return;
  }

  const session = getActiveSession() || createSession();
  if (!getState().sessions.some((s) => s.id === session.id)) {
    setState({ sessions: [session, ...getState().sessions], activeSessionId: session.id });
  }

  session.title = prompt.length > 20 ? prompt.slice(0, 20) + '…' : prompt;
  session.updatedAt = Date.now();
  session.messages.push({ role: 'user', content: prompt });
  session.messages.push({ role: 'assistant', content: '', status: 'generating' });

  setState({ isGenerating: true, phase: 'analyzing', currentCode: '' });
  els.promptInput.value = '';
  els.btnSend.disabled = true;
  persistSessions();
  renderAll();

  // 生成中卡片：只显示状态与输出大小，不把代码/说明文字铺进聊天区
  liveAssistantMsg = session.messages[session.messages.length - 1];
  liveAssistantEl = els.messageList.lastElementChild;
  liveAssistantSizeEl = liveAssistantEl ? liveAssistantEl.querySelector('.msg-card-size') : null;
  liveAssistantStreamEl = liveAssistantEl ? liveAssistantEl.querySelector('.msg-card-stream') : null;

  const procTimeline = {}; // 各生成阶段开始时间（持久化到版本 process 字段）
  const stageTexts = { analyzing: '', planning: '' }; // 各阶段文字（持久化到版本 stageText 字段）

  try {
    await streamGenerate(
      { prompt, historyCode: getBaseCode(), sessionId: session.id },
      {
        onStatus: (phase) => {
          if (phase && !(phase in procTimeline)) procTimeline[phase] = Date.now();
          setState({ phase });
          if (phase === 'generating' && liveAssistantStreamEl) {
            liveAssistantStreamEl.classList.add('hidden');
            if (liveAssistantSizeEl) liveAssistantSizeEl.classList.remove('hidden');
          }
        },
        onStageText: (stage, text) => {
          if (!(stage in stageTexts)) stageTexts[stage] = '';
          stageTexts[stage] += text;
          updateLiveStream(stage, stageTexts[stage]);
        },
        onToken: (text) => {
          liveAssistantMsg.content += text;
          if (liveAssistantSizeEl) {
            liveAssistantSizeEl.textContent = '已输出 ' + (liveAssistantMsg.content.length / 1024).toFixed(1) + ' KB';
          }
          setState({ currentCode: getState().currentCode + text });
        },
        onDone: (rawCode) => {
          const clean = sanitizeCode(rawCode);
          liveAssistantMsg.content = clean.code;
          liveAssistantMsg.status = 'done';
          const vIndex = session.versions.length + 1;
          session.versions.push({
            index: vIndex, label: 'V' + vIndex, prompt,
            code: clean.code, note: clean.note || '',
            process: { ...procTimeline },
            stageText: { analyzing: stageTexts.analyzing || '', planning: stageTexts.planning || '' },
            createdAt: Date.now(),
          });
          session.lastCode = clean.code;
          session.activeVersionIndex = session.versions.length - 1;
          session.updatedAt = Date.now();
          setState({ phase: 'done', currentCode: clean.code });
          renderCode(clean.code);
          updateBrowserUrl();
          syncEditor();
          persistSessions();
          renderAll();
          renderVersionBarUI();
        },
        onError: (message) => failGeneration(message),
      }
    );
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    failGeneration(err.message || '生成失败');
  } finally {
    setState({ isGenerating: false });
    els.btnSend.disabled = false;
    els.promptInput.focus();
  }
}

/** 生成中卡片：实时显示当前阶段文字（需求分析/方案规划） */
function updateLiveStream(stage, text) {
  if (!liveAssistantStreamEl) return;
  const labelEl = liveAssistantStreamEl.querySelector('.msg-card-stream-label');
  const textEl = liveAssistantStreamEl.querySelector('.msg-card-stream-text');
  if (!labelEl || !textEl) return;
  labelEl.textContent = stage === 'planning' ? '方案规划' : '需求分析';
  textEl.textContent = text;
  liveAssistantStreamEl.classList.remove('hidden');
  if (liveAssistantSizeEl) liveAssistantSizeEl.classList.add('hidden');
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

/** 生成失败统一处理：标记消息、持久化、更新状态卡片、Toast */
function failGeneration(message) {
  if (liveAssistantMsg) {
    if (!liveAssistantMsg.content) {
      liveAssistantMsg.content = '生成失败：' + message;
    } else {
      liveAssistantMsg.content += '\n\n[生成中断] ' + message;
    }
    liveAssistantMsg.status = 'error';
    const session = getActiveSession();
    if (session) {
      session.updatedAt = Date.now();
      persistSessions();
    }
  }
  setState({ phase: 'error' });
  renderAll();
  showToast(message, 'error');
}

/* ---------- Toast ---------- */

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast toast--' + type;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ---------- 健康检查 ---------- */

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const ok = res.ok && (await res.json()).status === 'ok';
    els.healthDot.className = 'w-2 h-2 rounded-full ' + (ok ? 'bg-emerald-400' : 'bg-red-400');
    els.healthDot.title = ok ? '后端连接正常' : '后端健康检查异常';
  } catch (err) {
    els.healthDot.className = 'w-2 h-2 rounded-full bg-red-400';
    els.healthDot.title = '后端未连接';
    console.warn('[app] 健康检查失败', err);
  }
}

/* ---------- 事件绑定与初始化 ---------- */

function bindEvents() {
  els.btnSend.addEventListener('click', handleSend);
  els.btnNewSession.addEventListener('click', newSession);
  els.btnCollapseSessions.addEventListener('click', toggleSessionList);
  els.sessionSearch.addEventListener('input', (e) => {
    sessionSearchKeyword = e.target.value.trim().toLowerCase();
    renderSessionList();
  });
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 右栏 Tab
  [els.tabPreview, els.tabCode].forEach((tab) => {
    tab.addEventListener('click', () => setPanelTab(tab.dataset.panel));
  });
  els.btnDownload.addEventListener('click', () => downloadHtml());
  els.btnDownloadCode.addEventListener('click', () => downloadHtml());
  els.btnSaveCode.addEventListener('click', saveCode);
  els.codeEditor.addEventListener('input', updateCodeSize);

  subscribe(() => renderStatusCards(els.statusCards, getState().phase));
}

function init() {
  bindEvents();

  // 布局：三栏宽度 + 右栏模式 + 浏览器窗口 + 文件树
  applyColWidths();
  initResizers();
  initBrowserWindow();
  renderFileTree(els.fileTree, [{ name: 'index.html', path: '/index.html', active: true }]);

  const savedTab = loadPref('panelTab', 'preview');
  setPanelTab(savedTab === 'code' ? 'code' : 'preview');

  const sessions = loadSessions();
  sessions.forEach(migrateSession);
  let activeId = loadActiveSessionId();
  if (sessions.length === 0) {
    const first = createSession();
    sessions.push(first);
    activeId = first.id;
  }
  if (!sessions.some((s) => s.id === activeId)) {
    activeId = sessions[0].id;
  }
  saveSessions(sessions);
  saveActiveSessionId(activeId);
  setState({ sessions, activeSessionId: activeId });

  sessionListCollapsed = loadPref('sessionListCollapsed', false);
  applySessionListCollapsed();

  const code = displayCode(getBaseCode());
  setState({ currentCode: code });
  renderAll();
  renderVersionBarUI();
  updateBrowserUrl();
  if (code) {
    renderCode(code);
  } else {
    renderCode(WELCOME_HTML);
  }
  syncEditor();

  checkHealth();
}

init();