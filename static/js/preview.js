// preview.js —— iframe 预览渲染：写入 srcdoc，含长度/内容校验 + 预览存储桥
const PREVIEW_FRAME_ID = 'preview-frame';
const MAX_CODE_SIZE = 500 * 1024; // 500KB，超出截断并提示

// ===== 预览存储桥 =====
// sandbox iframe 无 allow-same-origin，生成页的 localStorage 会抛 SecurityError。
// 方案：渲染时向生成页注入一段前置脚本，把 localStorage/sessionStorage 替换为内存代理；
// 代理数据按会话 ID 保存（应用自身 localStorage，key 前缀 atoms-preview:），
// 生成页内的变更通过 postMessage 回写父页面。效果：切会话/刷新预览数据不丢，且会话间互不串数据。
const STORAGE_NS = 'atoms-preview-storage';
const STORAGE_PREFIX = 'atoms-preview:';
const storageMap = new Map(); // sessionId -> { key: value }

function loadSessionStorage(sessionId) {
  if (!storageMap.has(sessionId)) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
      storageMap.set(sessionId, raw ? JSON.parse(raw) : {});
    } catch (e) {
      storageMap.set(sessionId, {});
    }
  }
  return storageMap.get(sessionId);
}

function persistSessionStorage(sessionId) {
  try {
    localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(storageMap.get(sessionId) || {}));
  } catch (e) {}
}

/** 获取某会话的预览存储（供下载时把数据烘焙进 HTML） */
export function getPreviewStorage(sessionId) {
  if (!sessionId) return {};
  return loadSessionStorage(sessionId);
}

// 注入到生成页 body 开头的存储代理脚本（__SESSION__ / __SEED__ 由注入时替换）
const STORAGE_BRIDGE_SRC =
  '(function(){' +
  'if(window.__atomsPreviewStorageBridge__)return;' +
  'window.__atomsPreviewStorageBridge__=true;' +
  'var NS="atoms-preview-storage";' +
  'var SID=__SESSION__;' +
  'var data=__SEED__;' +
  'function emit(op,key,value){try{parent.postMessage({ns:NS,sessionId:SID,op:op,key:key,value:value},"*");}catch(e){}}' +
  'var store={' +
  'getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},' +
  'setItem:function(k,v){data[k]=String(v);emit("set",k,data[k]);},' +
  'removeItem:function(k){if(Object.prototype.hasOwnProperty.call(data,k)){delete data[k];emit("remove",k);}},' +
  'clear:function(){data={};emit("clear");},' +
  'key:function(i){var ks=Object.keys(data);return i>=0&&i<ks.length?ks[i]:null;},' +
  'get length(){return Object.keys(data).length;}' +
  '};' +
  'try{' +
  'Object.defineProperty(window,"localStorage",{value:store,configurable:true});' +
  'Object.defineProperty(window,"sessionStorage",{value:store,configurable:true});' +
  '}catch(e){}' +
  '})();';

function injectStorageBridge(code, sessionId) {
  // JSON 中的 < 转义为 \u003c，避免 </script> 提前闭合注入的脚本
  const seed = JSON.stringify(loadSessionStorage(sessionId)).replace(/</g, '\\u003c');
  const sid = JSON.stringify(sessionId).replace(/</g, '\\u003c');
  const bridge = '<script>' + STORAGE_BRIDGE_SRC.replace('__SESSION__', () => sid).replace('__SEED__', () => seed) + '</script>';
  const bodyMatch = code.match(/(<body[^>]*>)/i);
  if (bodyMatch) return code.replace(/(<body[^>]*>)/i, '$1' + bridge);
  const headClose = code.match(/(<\/head>)/i);
  if (headClose) return code.replace(/(<\/head>)/i, bridge + '$1');
  return bridge + code;
}

// 接收生成页存储代理回写的变更（仅接受本预览 iframe 且带命名空间的消息）
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.ns !== STORAGE_NS) return;
  const frame = getFrame();
  if (frame && event.source !== frame.contentWindow) return;
  const { sessionId, op, key, value } = msg;
  if (!sessionId) return;
  const data = loadSessionStorage(sessionId);
  if (op === 'set') data[key] = value;
  else if (op === 'remove') delete data[key];
  else if (op === 'clear') {
    Object.keys(data).forEach((k) => delete data[k]);
  }
  persistSessionStorage(sessionId);
});

export function getFrame() {
  return document.getElementById(PREVIEW_FRAME_ID);
}

/** 将完整 HTML 写入预览 iframe（sandbox 隔离执行）；传入 sessionId 时注入存储桥 */
export function renderCode(code, sessionId) {
  const frame = getFrame();
  if (!frame) return false;
  if (typeof code !== 'string' || code.trim() === '') return false;

  if (code.length > MAX_CODE_SIZE) {
    console.warn('[preview] 代码超限，已截断至 500KB');
    code = code.slice(0, MAX_CODE_SIZE);
  }
  frame.srcdoc = sessionId ? injectStorageBridge(code, sessionId) : code;
  return true;
}

/** 清空预览并显示占位提示 */
export function clearPreview() {
  const frame = getFrame();
  if (frame) frame.srcdoc = 'about:blank';
}
