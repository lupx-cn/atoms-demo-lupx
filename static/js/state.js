// state.js —— appState 单例：集中管理运行状态，UI 渲染由状态驱动
// 状态机 phase 取值：idle / analyzing / planning / generating / rendering / done / error

export const PHASES = ['analyzing', 'planning', 'generating', 'rendering', 'done', 'error'];

const state = {
  phase: 'idle',
  isGenerating: false,
  sessions: [],           // 会话列表（持久化）
  activeSessionId: null,  // 当前会话 id
  currentCode: '',        // 最近一次完整生成代码
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error('[state] 监听器执行失败', err);
    }
  });
}

/** 订阅状态变更，返回取消订阅函数 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveSession() {
  return state.sessions.find((s) => s.id === state.activeSessionId) || null;
}

export function resetPhase() {
  setState({ phase: 'idle', isGenerating: false });
}
