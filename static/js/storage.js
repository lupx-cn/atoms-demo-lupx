// storage.js —— LocalStorage 封装：key 统一前缀 atoms_demo_，读写容错
const PREFIX = 'atoms_demo_';

export const KEYS = {
  sessions: PREFIX + 'sessions',
  active: PREFIX + 'active',
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('[storage] 读取失败', key, err);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('[storage] 写入失败（可能超出配额）', key, err);
    return false;
  }
}

export function loadSessions() {
  const list = readJson(KEYS.sessions, []);
  return Array.isArray(list) ? list : [];
}

export function saveSessions(sessions) {
  return writeJson(KEYS.sessions, sessions);
}

export function loadActiveSessionId() {
  const id = readJson(KEYS.active, null);
  return typeof id === 'string' ? id : null;
}

export function saveActiveSessionId(id) {
  return writeJson(KEYS.active, id);
}
/** 读取 UI 偏好（折叠状态等），容错返回 fallback */
export function loadPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + 'ui_' + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn('[storage] 偏好读取失败', key, err);
    return fallback;
  }
}

/** 保存 UI 偏好 */
export function savePref(key, value) {
  try {
    localStorage.setItem(PREFIX + 'ui_' + key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('[storage] 偏好写入失败', key, err);
    return false;
  }
}

