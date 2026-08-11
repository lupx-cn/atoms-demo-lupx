// app.js —— 入口与初始化：加载状态、渲染 UI、绑定事件、健康检查、SSE 生成流
import { getState, setState, resetPhase, getActiveSession, subscribe } from './state.js';
import { loadSessions, saveSessions, loadActiveSessionId, saveActiveSessionId } from './storage.js';
import { streamGenerate } from './api.js';
import { renderCode, getFrame } from './preview.js';
import { renderStatusCards } from './components/statusCard.js';
import { createMessageElement } from './components/messageItem.js';

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Atoms-Demo 预览</title></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#0f172a,#1e293b);color:#94a3b8;font-family:system-ui,sans-serif;">
  <div style="text-align:center;">
    <div style="font-size:48px;">🖥️</div>
    <p style="margin-top:12px;font-size:14px;">生成的网页将在这里实时预览</p>
  </div>
</body>
</html>`;

const els = {
  healthDot: document.getElementById('health-dot'),
  btnNewSession: document.getElementById('btn-new-session'),
  btnToggleCode: document.getElementById('btn-toggle-code'),
  sessionListWrap: document.getElementById('session-list-wrap'),
  btnCollapseSessions: document.getElementById('btn-collapse-sessions'),
  sessionList: document.getElementById('session-list'),
  messageList: document.getElementById('message-list'),
  statusCards: document.getElementById('status-cards'),
  promptInput: document.getElementById('prompt-input'),
  btnSend: document.getElementById('btn-send'),
  codePanel: document.getElementById('code-panel'),
  codeContent: document.getElementById('code-content'),
  codeSize: document.getElementById('code-size'),
  previewPlaceholder: document.getElementById('preview-placeholder'),
  toastContainer: document.getElementById('toast-container'),
};

let codePanelVisible = false;
let liveAssistantEl = null;      // 当前流式消息的 DOM 元素
let liveAssistantMsg = null;     // 当前流式消息数据对象

/* ---------- 会话工具 ---------- */

function createSession(title = '新会话') {
  return {
    id: (crypto.randomUUID && crypto.randomUUID()) || 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title,
    messages: [],
    lastCode: '',
    updatedAt: Date.now(),
  };
}

/* ---------- 渲染 ---------- */

function renderAll() {
  renderSessionList();
  renderMessages();
  renderStatusCards(els.statusCards, getState().phase);
}

function renderSessionList() {
  const { sessions, activeSessionId } = getState();
  els.sessionList.innerHTML = '';

  if (sessions.length === 0) {
    els.sessionList.innerHTML = '<li class="empty-hint">暂无会话</li>';
    return;
  }

  sessions.forEach((s) => {
    const li = document.createElement('li');
    const item = document.createElement('div');
    item.className = 'session-item' + (s.id === activeSessionId ? ' session-item--active' : '');
    item.textContent = s.title;
    item.title = s.title;
    item.addEventListener('click', () => switchSession(s.id));

    const time = document.createElement('span');
    time.className = 'text-[10px] text-slate-600';
    time.textContent = new Date(s.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

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

  session.messages.forEach((msg) => {
    els.messageList.appendChild(createMessageElement(msg));
  });
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

/* ---------- 会话操作 ---------- */

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

  setState({ activeSessionId: id });
  saveActiveSessionId(id);
  renderAll();

  if (session.lastCode) {
    renderCode(session.lastCode);
    els.previewPlaceholder.classList.add('hidden');
  } else {
    renderCode(WELCOME_HTML);
    els.previewPlaceholder.classList.remove('hidden');
  }
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
  renderCode(WELCOME_HTML);
  els.previewPlaceholder.classList.remove('hidden');
  els.promptInput.value = '';
  els.promptInput.focus();
}

/* ---------- 生成流程（M2：SSE 流式 + 打字机输出） ---------- */

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
  els.previewPlaceholder.classList.add('hidden');
  persistSessions();
  renderAll();

  // 记录流式消息对应的数据对象与 DOM 元素（打字机输出直接更新该气泡）
  liveAssistantMsg = session.messages[session.messages.length - 1];
  liveAssistantEl = els.messageList.lastElementChild;

  try {
    await streamGenerate(
      { prompt, historyCode: session.lastCode || '', sessionId: session.id },
      {
        onStatus: (phase) => setState({ phase }),
        onToken: (text) => {
          liveAssistantMsg.content += text;
          if (liveAssistantEl) {
            const bubble = liveAssistantEl.querySelector('.msg-bubble');
            if (bubble) {
              bubble.textContent = liveAssistantMsg.content;
              els.messageList.scrollTop = els.messageList.scrollHeight;
            }
          }
          setState({ currentCode: getState().currentCode + text });
        },
        onDone: (code) => {
          liveAssistantMsg.content = code;
          liveAssistantMsg.status = 'done';
          session.lastCode = code;
          session.updatedAt = Date.now();
          setState({ phase: 'done', currentCode: code });
          renderCode(code);
          syncCodePanel();
          persistSessions();
          renderAll();
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

/* ---------- 代码面板 ---------- */

function toggleCodePanel() {
  codePanelVisible = !codePanelVisible;
  els.codePanel.classList.toggle('hidden', !codePanelVisible);
  els.btnToggleCode.textContent = codePanelVisible ? '隐藏代码' : '查看代码';
  syncCodePanel();
}

function syncCodePanel() {
  if (!codePanelVisible) return;
  const code = getState().currentCode;
  els.codeContent.textContent = code || '（暂无生成代码）';
  els.codeSize.textContent = code ? (code.length / 1024).toFixed(1) + ' KB' : '';
}

/* ---------- Toast ---------- */

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast toast--' + type;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ---------- 健康检查（前后端联通验证） ---------- */

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
  els.btnToggleCode.addEventListener('click', toggleCodePanel);
  els.btnCollapseSessions.addEventListener('click', () => {
    els.sessionListWrap.classList.toggle('hidden');
    els.btnCollapseSessions.textContent = els.sessionListWrap.classList.contains('hidden') ? '展开' : '收起';
  });
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  subscribe(() => renderStatusCards(els.statusCards, getState().phase));
}

function init() {
  bindEvents();

  const sessions = loadSessions();
  let activeId = loadActiveSessionId();
  if (sessions.length === 0) {
    const first = createSession();
    sessions.push(first);
    activeId = first.id;
    saveSessions(sessions);
  }
  if (!sessions.some((s) => s.id === activeId)) {
    activeId = sessions[0].id;
  }

  setState({ sessions, activeSessionId: activeId });
  saveActiveSessionId(activeId);

  const session = getActiveSession();
  renderAll();
  if (session && session.lastCode) {
    renderCode(session.lastCode);
    els.previewPlaceholder.classList.add('hidden');
  } else {
    renderCode(WELCOME_HTML);
  }

  checkHealth();
}

init();
