"""AI 生成服务：调用 DeepSeek（OpenAI 兼容）流式接口，产出 SSE 事件。

职责：构造消息 → 流式调用模型 → 生成 status/token/done/error 事件。
调用方（main.py 路由层）只负责参数校验与响应组装。
"""

import asyncio
import json
import logging
import os

import httpx

logger = logging.getLogger(__name__)

# 环境变量配置（模块加载时读取，.env 由入口脚本负责加载）
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

CHAT_COMPLETIONS_URL = f"{BASE_URL}/v1/chat/completions"

# 超时：连接 10s，请求（read）120s
TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)

# 网络错误自动重试 1 次（指数退避）；业务错误不重试，直接透传
RETRY_COUNT = 1
RETRY_BACKOFF_SECONDS = 1.0

SYSTEM_PROMPT = (
    "你是一个网页生成智能体。请根据用户需求，生成一个完整、可直接在浏览器运行的单文件 HTML 页面。\n"
    "要求：\n"
    "1. 所有 CSS 和 JavaScript 内嵌在同一个 HTML 文件中，不依赖外部资源（除 CDN 外）。\n"
    "2. 输出必须是纯 HTML 代码，不要用 Markdown 代码围栏包裹，不要附加额外说明文字。\n"
    "3. 页面应美观、交互合理，使用中文界面。\n"
    "4. 如果提供了上一版代码，请在保留其结构与功能的基础上进行增量修改，而不是重新生成。"
)


def build_messages(prompt: str, history_code: str | None) -> list[dict]:
    """按「系统提示 → 上一版代码 → 用户新需求」组织消息。"""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history_code:
        messages.append(
            {
                "role": "user",
                "content": (
                    "以下是我当前页面的完整代码，请基于它进行增量修改，保持现有功能不变：\n"
                    f"```html\n{history_code}\n```"
                ),
            }
        )
    messages.append({"role": "user", "content": prompt})
    return messages


def _sse_frame(event: str, data) -> str:
    """将事件包装为单行 SSE 帧：data: {...}\n\n"""
    payload = json.dumps({"event": event, "data": data}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _status(phase: str, message: str) -> str:
    return _sse_frame("status", {"phase": phase, "message": message})


class AiGenerationError(Exception):
    """AI 调用业务错误（不重试），message 透传给前端。"""


async def _request_chat_stream(prompt: str, history_code: str | None):
    """流式请求模型，逐段产出文本增量。"""
    payload = {
        "model": MODEL,
        "messages": build_messages(prompt, history_code),
        "stream": True,
        "temperature": 0.4,
    }
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        async with client.stream("POST", CHAT_COMPLETIONS_URL, json=payload, headers=headers) as response:
            if response.status_code == 401:
                raise AiGenerationError("API Key 无效")
            if response.status_code == 429:
                raise AiGenerationError("请求过于频繁，请稍后重试")
            if response.status_code != 200:
                body = (await response.aread()).decode("utf-8", errors="replace")
                raise AiGenerationError(f"模型服务返回 {response.status_code}: {body[:200]}")
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0]["delta"].get("content")
                except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                    logger.warning("跳过无法解析的流式分片: %s", data[:100])
                    continue
                if delta:
                    yield delta


async def stream_generate(prompt: str, history_code: str | None = None):
    """生成 SSE 事件流：status* → token* → status(rendering) → done/error。

    以异步生成器逐帧产出 SSE 文本，供 StreamingResponse 直接输出。
    """
    if not API_KEY:
        yield _sse_frame("error", {"message": "服务端未配置 DEEPSEEK_API_KEY"})
        return

    yield _status("analyzing", "正在分析需求...")
    await asyncio.sleep(0.2)  # 让状态卡片可感知，模拟思考过程
    yield _status("planning", "正在规划页面结构...")
    await asyncio.sleep(0.2)
    yield _status("generating", "正在生成代码...")

    full_code: list[str] = []
    last_error: Exception | None = None

    for attempt in range(RETRY_COUNT + 1):
        try:
            async for delta in _request_chat_stream(prompt, history_code):
                full_code.append(delta)
                yield _sse_frame("token", delta)
            break
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_error = exc
            logger.warning("网络错误（第 %s 次尝试）: %s", attempt + 1, exc)
            if attempt < RETRY_COUNT:
                await asyncio.sleep(RETRY_BACKOFF_SECONDS * (2**attempt))
        except AiGenerationError as exc:
            yield _sse_frame("error", {"message": str(exc)})
            return

    if last_error is not None:
        yield _sse_frame("error", {"message": "模型服务网络异常，请稍后重试"})
        return

    code = "".join(full_code).strip()
    if not code:
        yield _sse_frame("error", {"message": "模型未返回有效内容"})
        return

    yield _status("rendering", "准备渲染预览...")
    yield _sse_frame("done", {"full_code": code})
