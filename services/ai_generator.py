"""AI 生成服务：调用 DeepSeek（OpenAI 兼容）流式接口，产出 SSE 事件。

职责：构造消息 → 流式调用模型 → 生成 status/token/done/error 事件。
调用方（main.py 路由层）只负责参数校验与响应组装。
"""

import asyncio
import json
import logging
import os
import re

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
    "你是一个网页生成智能体。布局稳定、多尺寸适配、渲染正常为第一优先级，其次是交互功能与美观。请根据用户需求，生成一个完整、可直接在浏览器运行的单文件 HTML 页面。\n"
    "【硬性全局规则，不可违背、不可删减】\n"
    "1. 所有 CSS 和 JavaScript 内嵌在同一个 HTML 文件中，禁止本地外部资源，CDN资源按需少量引入。\n"
    "2. HTML头部必须固定包含标准视口标签：<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">，不允许省略、修改。\n"
    "3. 全局强制设置 * { margin:0; padding:0; box-sizing: border-box; }，禁止删除该重置样式。\n"
    "4. 页面所有内容包裹在统一外层容器，设置固定最大宽度 + 水平居中，左右预留安全内边距；横向多卡片容器必须配置 flex-wrap: wrap，窗口宽度不足自动换行。\n"
    "5. 所有卡片、输入组件设置 min-width 最小宽度，避免窗口缩小时被挤压变形；禁止无限制横向铺满全屏布局。\n"
    "6. 响应式至少包含三档断点：大屏、平板、手机，覆盖全部窗口尺寸，不存在中间宽度排版崩坏；输入区域在移动端自动垂直堆叠。\n"
    "7. 简化阴影效果，仅使用单层柔和外阴影，禁止多层嵌套内外阴影、复杂厚重新拟态，防止页面渲染模糊、失真。\n"
    "8. 页面主体排版仅使用弹性flex布局，禁止用绝对定位摆放页面核心模块，绝对定位仅允许用于装饰背景、悬浮提示。\n"
    "9. 完整输出标准HTML，所有标签成对闭合，不截断DOM结构、不缺失父级容器，不存在残缺代码。\n"
    "\n"
    "【输出格式强制顺序，不得调换、增减】\n"
    "① 先输出 <analysis> 标签包裹的需求分析文字（1~3 句中文，客观解读用户页面需求）；\n"
    "② 再输出 <plan> 标签包裹的方案规划文字（1~3 句中文，说明页面容器结构、响应式方案、核心交互）；\n"
    "③ 最后输出完整HTML代码，以 <!DOCTYPE html> 开头，不要Markdown代码围栏```html，不附加任何解释、修改说明、备注文字。\n"
    "\n"
    "【页面内容约束】\n"
    "1. 页面 body 内仅存放页面业务内容、交互组件；严禁出现任何说明性文字、注释话术（如「以下是页面」「已修复布局」等）。\n"
    "2. 全站中文界面，间距、圆角统一规范，留白充足，排版不拥挤。\n"
    "3. 页面必须同时兼容两种渲染环境：本地浏览器直接打开、iframe内嵌预览，两种场景视觉效果保持一致。\n"
    "\n"
    "【增量修改规则（传入历史代码时生效）】\n"
    "1. 完整保留原有页面DOM层级、所有交互逻辑、本地存储功能，只做增量优化，不整体重写页面；\n"
    "2. 禁止删除原有核心布局容器、flex换行规则、viewport、全局盒模型重置；仅调整错乱样式、适配逻辑、视觉美化。\n"
    "3. 若原有代码存在DOM残缺、布局错位，优先修复结构问题，再优化视觉。"

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


AI_NOTE_LEADINGS = (
    "这是为您", "这是为你", "已为您", "已为你",
    "以下是为您", "以下是你", "下面是为您", "下面是你",
    "本页面由", "该页面由",
    "希望这个页面", "希望该页面",
    "如有任何问题", "如您有任何",
    "如需修改", "如需调整",
)


# AI 页面说明区块标题：以这些词开头的整块描述文字（描述页面自身而非真实功能），剥离时不受长度/嵌套限制
AI_SECTION_HEADINGS = (
    "页面特点说明", "页面功能说明", "页面功能介绍", "功能特点说明",
    "页面特点", "页面介绍", "页面说明", "页面亮点",
)


def _is_section_note(raw_block: str) -> bool:
    """AI 页面说明区块判定：剥离标签后以说明标题开头，且不含交互元素（避免误删真实页面功能）。"""
    if not raw_block:
        return False
    if re.search(r"<(button|input|form|select|textarea|a|iframe)\b", raw_block, re.I):
        return False
    if re.search(r"\sonclick\s*=", raw_block, re.I):
        return False
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]*>", "", raw_block)).strip()
    return bool(t) and t.startswith(AI_SECTION_HEADINGS)


def _is_section_line(text: str) -> bool:
    """裸文本行是否为 AI 页面说明区块行（用于 body 开头/结尾逐行剥离）。"""
    t = re.sub(r"\s+", " ", text or "").strip()
    return bool(t) and t.startswith(AI_SECTION_HEADINGS)


def _is_note(text: str) -> bool:
    """说明段判定：压缩空白后以客套语开头、长度 ≤300。"""
    t = re.sub(r"\s+", " ", text or "").strip()
    return 0 < len(t) <= 300 and t.startswith(AI_NOTE_LEADINGS)


def clean_generated_code(raw: str) -> str:
    """清洗模型输出：剥离文档前导说明、Markdown 代码围栏与内嵌说明段。

    与前端 app.js 的 sanitizeCode 保持相同策略，保证存库/预览/下载都是干净 HTML。
    """
    if not raw or not isinstance(raw, str):
        return raw or ""
    code = raw.strip()

    # ⓪ 文档前导说明 + Markdown 围栏：<html>/<!DOCTYPE 之前的内容全部视为说明剥离
    doc_match = re.search(r"<!DOCTYPE|<!doctype|<html", code, re.I)
    doc_start = doc_match.start() if doc_match else -1
    if doc_start > 0:
        code = code[doc_start:]
    elif doc_start == -1:
        fence = re.search(r"```(?:html)?\s*\r?\n?([\s\S]*?)```", code, re.I)
        if fence and fence.group(1).strip():
            code = fence.group(1).strip()
    # 清理残留的独立代码围栏标记行
    code = re.sub(r"^\s*```(?:html)?\s*$", "", code, flags=re.M | re.I).rstrip()
    code = re.sub(r"```\s*$", "", code).rstrip()

    # ⓪.5 截断到文档末尾：</html> 闭合标签之后追加的说明文字一律丢弃
    #     （浏览器 HTML5 解析会把 </html> 之后的文本重新并入 body 渲染）
    html_closes = list(re.finditer(r"</html\s*>", code, re.I))
    if html_closes:
        code = code[: html_closes[-1].end()]
    else:
        body_close = re.search(r"</body\s*>", code, re.I)
        if body_close:
            code = code[: body_close.end()]

    # ① HTML 注释中的说明段（整段注释移除）
    def strip_comment(m: re.Match) -> str:
        inner = re.sub(r"<[^>]*>", "", m.group(1))
        if _is_note(inner):
            return ""
        return m.group(0)

    code = re.sub(r"<!--([\s\S]*?)-->", strip_comment, code)

    # ①.5 AI 页面说明区块：以「页面特点说明」等标题开头的描述容器（允许嵌套 h2/p/ul）整体剥离；
    #     仅剥离不含交互元素的纯说明容器，避免误删真实页面功能。
    def strip_section_block(m: re.Match) -> str:
        whole = m.group(0)
        tag = m.group(1)
        inner_start = whole.find(">") + 1
        inner_end = whole.rfind("</")
        if inner_end <= inner_start:
            return whole
        if re.search(r"<" + re.escape(tag) + r"\b", whole[inner_start:inner_end], re.I):
            return whole  # 嵌套同类块，跳过
        if _is_section_note(whole):
            return ""
        return whole

    code = re.sub(
        r"<(p|div|section|blockquote|article|main|ul)\b[^>]*>[\s\S]*?<\/\1\s*>",
        strip_section_block,
        code,
        flags=re.I,
    )

    # ② 无嵌套块级元素包裹的说明段
    def strip_block(m: re.Match) -> str:
        whole = m.group(0)
        tag = m.group(1)
        inner_start = whole.find(">") + 1
        inner_end = whole.rfind("</")
        if inner_end <= inner_start:
            return whole
        if re.search(r"<(p|div|section|blockquote)\b", whole[inner_start:inner_end], re.I):
            return whole
        inner = re.sub(r"<[^>]*>", "", whole)
        if _is_note(inner):
            return ""
        return whole

    code = re.sub(
        r"<(p|div|section|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>",
        strip_block,
        code,
        flags=re.I,
    )

    # ③ body 开头/结尾的裸文本说明段（客套语 + AI 页面说明区块 + 区块续行的裸文本）
    def strip_body(m: re.Match) -> str:
        open_tag, body, close_tag = m.group(1), m.group(2), m.group(3)
        lines = body.split("\n")

        in_desc_run = False
        while lines:
            raw = lines[0]
            if not raw.strip():
                lines.pop(0)
                continue
            first = re.sub(r"<[^>]*>", "", raw).strip()
            if first and (_is_note(first) or _is_section_line(first)):
                if _is_section_line(first):
                    in_desc_run = True
                lines.pop(0)
                continue
            if in_desc_run and not re.search(r"<[^>]*>", raw):
                lines.pop(0)
                continue
            break

        in_desc_run = False
        while lines:
            raw = lines[-1]
            if not raw.strip():
                lines.pop()
                continue
            last = re.sub(r"<[^>]*>", "", raw).strip()
            if last and (_is_note(last) or _is_section_line(last)):
                if _is_section_line(last):
                    in_desc_run = True
                lines.pop()
                continue
            if in_desc_run and not re.search(r"<[^>]*>", raw):
                lines.pop()
                continue
            break

        return open_tag + "\n".join(lines) + close_tag

    code = re.sub(r"(<body[^>]*>)([\s\S]*?)(</body>)", strip_body, code, flags=re.I)

    # ④ 清理剥离后残留的空块级标签
    #     仅清理「无任何属性」的裸空标签（说明剥离后留下的空壳）；
    #     带 id/class/data-*/style 等属性的空容器是页面 JS 的渲染挂载点（如 <div id="taskList"></div>），必须保留
    def strip_empty_block(m: re.Match) -> str:
        open_tag = m.group(0)[: m.group(0).find(">") + 1]
        if re.search(r"\s(?:id|class|data-|style)\s*=", open_tag, re.I):
            return m.group(0)
        return ""

    code = re.sub(
        r"<(p|div|section|blockquote)\b[^>]*>\s*<\/\1\s*>",
        strip_empty_block,
        code,
        flags=re.I,
    )

    return code.strip()


# 阶段标记：模型输出流中 <analysis>…</analysis> 与 <plan>…</plan> 包裹分析/规划文字
_STAGE_MARKERS = (
    ("analyzing", "<analysis>", "</analysis>"),
    ("planning", "<plan>", "</plan>"),
)
_TAIL_KEEP = 32  # 流式缓冲尾部长度：大于最长标记，防止标记跨 chunk 被截断


class _StageStreamParser:
    """把模型输出流按 <analysis>/<plan> 标记切成 (kind, text) 片段。

    kind: "html" | "analyzing" | "planning"。标记本身不进入任何片段；
    未闭合标记（模型不遵守格式）按 html 兜底，避免丢内容。
    """

    def __init__(self) -> None:
        self._buf = ""
        self._stage: str | None = None  # None=html 区；否则为当前标记阶段

    def feed(self, chunk: str) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        self._buf += chunk
        while True:
            if self._stage is None:
                best = None
                for key, open_m, _close_m in _STAGE_MARKERS:
                    idx = self._buf.lower().find(open_m)
                    if idx != -1 and (best is None or idx < best[0]):
                        best = (idx, key, open_m)
                if best is None:
                    # 未发现标记：保留尾部，其余立即按 html 输出（保证流式）
                    if len(self._buf) > _TAIL_KEEP:
                        out.append(("html", self._buf[:-_TAIL_KEEP]))
                        self._buf = self._buf[-_TAIL_KEEP:]
                    break
                idx, key, open_m = best
                if idx > 0:
                    out.append(("html", self._buf[:idx]))
                self._buf = self._buf[idx + len(open_m):]
                self._stage = key
                continue
            close_m = next(m for k, _o, m in _STAGE_MARKERS if k == self._stage)
            idx = self._buf.lower().find(close_m)
            if idx == -1:
                # 文本区未闭合：保留尾部，其余按当前阶段文字输出（保证实时流式）
                if len(self._buf) > _TAIL_KEEP:
                    out.append((self._stage, self._buf[:-_TAIL_KEEP]))
                    self._buf = self._buf[-_TAIL_KEEP:]
                break
            if idx > 0:
                out.append((self._stage, self._buf[:idx]))
            self._buf = self._buf[idx + len(close_m):]
            self._stage = None
        return out

    def finish(self) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        if self._buf:
            out.append(("html", self._buf))
            self._buf = ""
        self._stage = None
        return out


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
    """生成 SSE 事件流：status* → stage_text*/token* → status(rendering) → done/error。

    模型输出 <analysis>/<plan> 标记段作为阶段文字（stage_text 事件实时下发），
    HTML 部分作为 token 事件下发；标记在解析时剥离，代码保持纯 HTML。
    """
    if not API_KEY:
        yield _sse_frame("error", {"message": "服务端未配置 DEEPSEEK_API_KEY"})
        return

    yield _status("analyzing", "正在分析需求...")

    parser = _StageStreamParser()
    full_code: list[str] = []
    stage_texts: dict[str, list[str]] = {"analyzing": [], "planning": []}
    sent_planning = False
    sent_generating = False
    last_error: Exception | None = None

    def emit(kind: str, text: str) -> list[str]:
        nonlocal sent_planning, sent_generating
        frames: list[str] = []
        if kind == "html" and not sent_planning:
            sent_planning = True
            frames.append(_status("planning", "正在规划页面结构..."))
        if kind == "html" and not sent_generating:
            sent_generating = True
            frames.append(_status("generating", "正在生成代码..."))
        if kind == "planning" and not sent_planning:
            sent_planning = True
            frames.append(_status("planning", "正在规划页面结构..."))
        if text:
            if kind == "html":
                full_code.append(text)
                frames.append(_sse_frame("token", text))
            else:
                stage_texts[kind].append(text)
                frames.append(_sse_frame("stage_text", {"stage": kind, "text": text}))
        return frames

    for attempt in range(RETRY_COUNT + 1):
        try:
            async for delta in _request_chat_stream(prompt, history_code):
                for kind, text in parser.feed(delta):
                    for frame in emit(kind, text):
                        yield frame
            break
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_error = exc
            logger.warning("网络错误（第 %s 次尝试）: %s", attempt + 1, exc)
            if attempt < RETRY_COUNT:
                await asyncio.sleep(RETRY_BACKOFF_SECONDS * (2**attempt))
        except AiGenerationError as exc:
            yield _sse_frame("error", {"message": str(exc)})
            return

    # 流结束：残留缓冲按 html 兜底（保证代码完整，标记已剥离）
    for kind, text in parser.finish():
        for frame in emit(kind, text):
            yield frame

    if last_error is not None:
        yield _sse_frame("error", {"message": "模型服务网络异常，请稍后重试"})
        return

    code = "".join(full_code).strip()
    if not code:
        yield _sse_frame("error", {"message": "模型未返回有效内容"})
        return

    code = clean_generated_code(code)
    yield _status("rendering", "准备渲染预览...")
    yield _sse_frame("done", {"full_code": code})
