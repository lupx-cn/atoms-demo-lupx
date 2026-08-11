// components/messageItem.js —— 消息气泡组件（user / assistant）
export function createMessageElement(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (msg.role === 'user' ? 'msg--user' : 'msg--assistant');

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.content;
  wrap.appendChild(bubble);

  if (msg.role === 'assistant' && msg.status) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = msg.status === 'done' ? '生成完成' : '生成中…';
    wrap.appendChild(meta);
  }
  return wrap;
}
