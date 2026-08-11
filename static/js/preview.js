// preview.js —— iframe 预览渲染：写入 srcdoc，含长度/内容校验
const PREVIEW_FRAME_ID = 'preview-frame';
const MAX_CODE_SIZE = 500 * 1024; // 500KB，超出截断并提示

export function getFrame() {
  return document.getElementById(PREVIEW_FRAME_ID);
}

/** 将完整 HTML 写入预览 iframe（sandbox 隔离执行） */
export function renderCode(code) {
  const frame = getFrame();
  if (!frame) return false;
  if (typeof code !== 'string' || code.trim() === '') return false;

  if (code.length > MAX_CODE_SIZE) {
    console.warn('[preview] 代码超限，已截断至 500KB');
    code = code.slice(0, MAX_CODE_SIZE);
  }
  frame.srcdoc = code;
  return true;
}

/** 清空预览并显示占位提示 */
export function clearPreview() {
  const frame = getFrame();
  if (frame) frame.srcdoc = 'about:blank';
}
