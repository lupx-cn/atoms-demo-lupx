// api.js —— SSE 请求封装（fetch + ReadableStream 流式读取）
// 帧协议（见 dev_spec 2.2）：data: {"event": "status|token|done|error", "data": <payload>}\n\n

const API_BASE = ''; // 同源部署：页面由 FastAPI 托管，接口与页面同源
const MAX_HISTORY_CODE = 200_000; // 与后端上限一致

/**
 * 流式调用代码生成接口。
 * @param {object} payload { prompt, historyCode, sessionId }
 * @param {object} handlers { onStatus(phase, message), onToken(text), onDone(code), onError(message) }
 * @param {object} [opts] { baseUrl, signal } 测试/高级用途可覆盖 baseUrl
 * @returns {Promise<void>} 流结束后 resolve；网络/HTTP 错误 reject(Error)
 */
export async function streamGenerate(payload, handlers = {}, opts = {}) {
  const baseUrl = opts.baseUrl ?? API_BASE;

  let historyCode = payload.historyCode || '';
  if (historyCode.length > MAX_HISTORY_CODE) {
    console.warn('[api] history_code 超限，已截断至 200KB');
    historyCode = historyCode.slice(0, MAX_HISTORY_CODE);
  }

  let res;
  try {
    res = await fetch(baseUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: payload.prompt,
        history_code: historyCode || null,
        session_id: payload.sessionId || null,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new Error('无法连接生成服务，请确认后端已启动');
  }

  if (!res.ok) {
    let message = '请求失败（HTTP ' + res.status + '）';
    try {
      const data = await res.json();
      if (data && data.detail) {
        message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch (err) {
      /* 保留默认消息 */
    }
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    throw new Error('响应格式异常：非 SSE 流');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const rawFrame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (buffer.startsWith('\r\n')) buffer = buffer.slice(2);
      dispatchFrame(rawFrame, handlers);
    }
  }

  if (buffer.trim()) dispatchFrame(buffer, handlers);
}

/** 解析单帧 SSE 文本（可能含多行 data:），按事件类型分发 */
function dispatchFrame(rawFrame, handlers) {
  const dataLines = rawFrame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  for (const line of dataLines) {
    if (!line) continue;

    let frame;
    try {
      frame = JSON.parse(line);
    } catch (err) {
      console.warn('[api] 跳过无法解析的 SSE 帧', line.slice(0, 120));
      continue;
    }

    const type = frame.event;
    const data = frame.data;

    if (type === 'status' && data && data.phase) {
      if (handlers.onStatus) handlers.onStatus(data.phase, data.message);
    } else if (type === 'token') {
      if (handlers.onToken) handlers.onToken(String(data));
    } else if (type === 'done' && data && data.full_code) {
      if (handlers.onDone) handlers.onDone(data.full_code);
    } else if (type === 'error') {
      if (handlers.onError) handlers.onError((data && data.message) || '生成失败');
    }
  }
}
