"""Atoms-Demo FastAPI 入口：路由层、静态挂载、CORS。

职责边界：本文件只做参数校验与响应组装，
AI 调用与 SSE 事件拼接逻辑收敛在 services/ai_generator.py。
"""

import logging
import os

from dotenv import load_dotenv

# 必须在导入 services 之前加载 .env，否则 ai_generator 模块级 API_KEY 读到空值
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from services.ai_generator import stream_generate

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("atoms_demo")

app = FastAPI(title="Atoms-Demo API", version="0.1.0")

# CORS：开发环境放开任意来源；生产环境应收紧为部署域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000, description="用户自然语言需求")
    history_code: str | None = Field(None, max_length=200_000, description="上一轮生成的 HTML，用于增量迭代")
    session_id: str | None = Field(None, max_length=128, description="前端会话标识")


@app.get("/api/health")
async def health() -> dict:
    """健康检查：部署平台探活与本地联调。"""
    return {"status": "ok"}


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    """SSE 流式生成网页代码。"""
    logger.info(
        "generate request session=%s prompt_len=%d history_len=%d",
        req.session_id,
        len(req.prompt),
        len(req.history_code or ""),
    )
    headers = {"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    return StreamingResponse(
        stream_generate(req.prompt, req.history_code),
        media_type="text/event-stream",
        headers=headers,
    )


# 静态资源：前端页面（显式路由优先于挂载，不影响 /api/*）
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
