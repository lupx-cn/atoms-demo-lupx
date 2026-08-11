# Atoms-Demo 开发规范（dev_spec）

> 依据《goals.md》编制，面向 6~8 小时交付的 AI 网页生成原型系统（对标 atoms.dev）。
> 范围：技术规约、接口定义、编码约束、架构规范四大板块；所有规范以“可运行、可交互、可持久化、可公网部署”为验收前提。

---

## 1. 技术规约

### 1.1 总体技术选型

| 层级 | 选型 | 说明 |
|:---|:---|:---|
| 前端 | 原生 HTML5 + Vanilla JS + Tailwind CSS（CDN v3.x） | 0 构建依赖，浏览器直接运行 |
| 后端 | FastAPI + Python 3.10+ | 原生 SSE，全链路 async/await |
| AI 模型 | DeepSeek API（`deepseek-chat`）或兼容 OpenAI 接口模型 | 流式输出，成本可控 |
| 持久化 | 前端 LocalStorage | 会话历史与最后一次生成结果 |
| 部署 | Vercel / Render | 环境变量注入 API Key，一键部署 |

### 1.2 前端规约

| 项目 | 规约 |
|:---|:---|
| 框架 | 原生 HTML5 + Vanilla JS（ES Module），不引入 React/Vue 等框架 |
| 样式 | Tailwind CSS CDN v3.x + 少量自定义 CSS |
| 状态管理 | 单例 appState 管理运行状态，LocalStorage 负责会话持久化 |
| UI 组件 | 无第三方组件库，采用原生 HTML + JS 模块封装 |
| 代码放置 | static 目录管理，index.html 负责页面结构，JS/CSS 模块独立维护 |
| 构建工具 | 无构建流程，浏览器直接运行 |
| 双栏布局 | 左侧对话会话面板 + 右侧 iframe 实时预览 |
| 反馈机制 | 状态卡片序列模拟 Agent 工作流（需求分析→方案规划→代码生成→渲染预览） |

### 1.3 后端规约

| 项目 | 规约 |
|:---|:---|
| 语言版本 | Python 3.10+ |
| Web 框架 | FastAPI |
| 异步模式 | 全链路 async/await，SSE 采用 StreamingResponse |
| 依赖管理 | `requirements.txt`（无 poetry/pipenv，保持最小依赖） |
| 环境变量 | 使用 `python-dotenv` 加载 `.env` 文件 |
| 端口 | 默认 `8000`，允许通过环境变量 `PORT` 覆盖 |
| 日志 | Python logging，默认 INFO，支持 LOG_LEVEL 配置 |
| 静态托管 | FastAPI StaticFiles 挂载 static 目录 |

### 1.4 AI 模型规约

| 项目 | 规约 |
|:---|:---|
| 接口协议 | OpenAI Chat Completion API 兼容格式（`/v1/chat/completions`） |
| 模型 | DeepSeek Chat（`deepseek-chat`）或同规格替代模型 |
| 调用方式 | **流式**（`stream: true`），SSE 透传至前端 |
| 超时设置 | 请求超时 120s，连接超时 10s |
| 重试策略 | 网络错误自动重试 1 次（指数退避）；业务错误不重试，直接透传错误信息 |
| 提示词约束 | 强制输出完整单文件 HTML（内嵌 CSS/JS），剥离 Markdown 代码围栏 |

---

## 2. 接口定义

> 基础 URL：`http://localhost:8000`（开发）/ 部署后替换为公网地址

### 2.1 代码生成接口（核心）

**端点**：`POST /api/generate`
**请求头**：Content-Type: application/json
**请求体**：
```json
{
  "prompt": "生成一个待办事项清单网页",     // 必填，用户自然语言需求
  "history_code": "<!-- 上一轮生成的HTML代码 -->",  // 可选，用于增量迭代
  "session_id": "uuid-xxx"                 // 可选，用于前端关联会话
}
```
**响应**：`text/event-stream`（SSE）

### 2.2 SSE 事件协议

| 事件类型 | 触发时机 | data 字段示例 | 前端行为 |
|:---|:---|:---|:---|
| status | 开始生成时 | `{"phase": "analyzing", "message": "正在分析需求..."}` | 更新状态机卡片 |
| status | 规划阶段 | `{"phase": "planning", "message": "正在规划页面结构..."}` | 更新状态机卡片 |
| status | 生成阶段 | `{"phase": "generating", "message": "正在生成代码..."}` | 更新状态机卡片 |
| token | 代码生成过程中 | `"<!DOCTYPE html>..."`（流式片段） | 追加到代码编辑器 |
| status | 准备预览 | `{"phase": "rendering", "message": "准备渲染预览..."}` | 更新状态机卡片 |
| done | 生成完成 | `{"full_code": "<!DOCTYPE html>..."}` | 更新预览区，持久化存储 |
| error | 发生错误 | `{"message": "API Key 无效"}` | 显示错误 Toast |

**SSE 数据格式规范**：
```
data: {"event": "status", "data": {"phase": "analyzing", "message": "正在分析需求..."}}

data: {"event": "token", "data": "<!DOCTYPE html>"}

data: {"event": "done", "data": {"full_code": "<!DOCTYPE html>..."}}
```
**消息包装**：每帧为单行 JSON，格式 `{"event": "<type>", "data": <payload>}`，以 `data: ` 前缀 + 空行结尾；服务端需设置 `Cache-Control: no-cache` 与 `Connection: keep-alive`。

### 2.3 健康检查接口

**端点**：`GET /api/health`
**响应**：`{"status": "ok"}`（200）
用途：部署平台探活与本地联调排障。

### 2.4 错误处理约定

| HTTP 状态码 | 场景 | 说明 |
|:---|:---|:---|
| 400 | prompt 缺失或为空 | 返回 JSON 错误，不进入 SSE |
| 422 | 请求体格式非法 | FastAPI 默认校验响应 |
| 502 | 上游 AI 服务不可用 | SSE 内发送 error 事件后关闭 |
| 504 | 超时（120s） | SSE 内发送 error 事件后关闭 |

SSE 流内错误一律通过 `error` 事件透传，流结束后前端恢复可提交状态。

---

## 3. 编码约束

### 3.1 通用约束

- 所有源码文件使用 **UTF-8（无 BOM）** 编码，换行符 LF。
- 标识符命名：后端 `snake_case`；前端 JS 变量/函数 `camelCase`，常量 `UPPER_SNAKE_CASE`，CSS 类名 `kebab-case`。
- 不提交 `.env`、API Key 等敏感信息；新增密钥必须通过环境变量注入。
- 不引入硬编码的密钥、URL、内网地址。
- 提交前保证无语法错误；运行期错误必须有日志与前端提示。

### 3.2 前端编码约束

- 模块按职责拆分（app / state / storage / api / preview / components），每个模块单一职责。
- 状态变更统一走 appState，UI 渲染由状态驱动，禁止散落的全局变量。
- LocalStorage 读写封装为独立 storage 模块，key 统一前缀 `atoms_demo_`，写入前 `JSON.stringify`，读取时容错（try/catch + 默认值）。
- SSE 采用 `fetch` + 流式读取（POST 场景），连接中断需提示并支持重试。
- iframe 预览必须设置 `sandbox="allow-scripts allow-forms allow-modals allow-popups"`，不授予 `allow-same-origin`（防逃逸）。
- 生成代码注入预览前做长度/内容校验，超限（如 > 500KB）截断并提示。

### 3.3 后端编码约束

- 路由层只做参数校验与响应组装，AI 调用与 SSE 拼接逻辑收敛到 service 层。
- 全链路 async/await，禁止在线程池或阻塞调用中执行 HTTP 请求。
- 外部依赖调用设置超时（连接 10s / 请求 120s），并捕获超时与网络异常。
- 日志分级：请求入口 INFO、错误 ERROR，禁止打印完整 API Key 或请求体中的敏感内容。
- `requirements.txt` 固定主版本，不锁定无关传递依赖。

### 3.4 安全约束

- 环境变量清单：`DEEPSEEK_API_KEY`（必填）、`DEEPSEEK_BASE_URL`（可选，默认 `https://api.deepseek.com`）、`PORT`、`LOG_LEVEL`。
- `.env` 加入 `.gitignore`，仓库仅提交 `.env.example`。
- 生成代码仅在前端 iframe 沙箱内执行；生产环境建议补充 CSP 与 DOM 净化策略（文档标注）。
- 服务端对 prompt 与 history_code 做长度上限校验（如 prompt ≤ 4000 字符，history_code ≤ 200KB），防滥用。

### 3.5 质量门禁

- 测试用例 1~5（初始生成 / 迭代修改 / 全新生成 / 二次迭代 / 持久化验证）全部通过。
- 部署链接可访问且功能完整；README 含简介、启动方式、环境变量说明。
- 代码中无硬编码 API Key；整体开发耗时控制在 6~8 小时内。

---

## 4. 架构规范

### 4.1 整体架构

前后端分离 + SSE 单向流式推送：

```
浏览器前端 (static/)
  ├─ 左侧：会话面板（消息列表 + 输入框 + 状态卡片）
  ├─ 右侧：iframe 预览区 + 代码编辑器（可选折叠）
  └─ appState + storage(LocalStorage)
        │  POST /api/generate（JSON）
        ▼
FastAPI 后端
  ├─ main.py 路由层（校验 + 组装）
  ├─ service 层（构造 prompt → 调用 DeepSeek 流式 → SSE 事件）
  └─ 环境变量配置（API Key / 模型 / 超时）
        │  OpenAI 兼容接口（stream: true）
        ▼
DeepSeek API
```

### 4.2 目录结构

```
atoms-demo/
├── main.py              # FastAPI 入口：路由、静态挂载、CORS
├── services/
│   └── ai_generator.py  # AI 调用与 SSE 事件生成
├── requirements.txt
├── .env.example         # 环境变量模板
├── .gitignore
├── static/
│   ├── index.html       # 双栏页面骨架
│   ├── css/style.css    # 自定义样式
│   └── js/
│       ├── app.js       # 入口与初始化
│       ├── state.js     # appState 单例
│       ├── storage.js   # LocalStorage 封装
│       ├── api.js       # SSE 请求封装
│       ├── preview.js   # iframe 预览渲染
│       └── components/  # 消息、状态卡片等 UI 模块
└── README.md
```
（实际以落地为准，允许按需增删，但前后端模块边界保持不变。）

### 4.3 核心数据流（单次生成）

1. 用户输入 prompt，前端写入会话记录（pending 状态）。
2. 前端调用 `POST /api/generate`（携带 prompt / history_code / session_id）。
3. 后端按顺序推送 status(analyzing) → status(planning) → status(generating) → token* → status(rendering) → done。
4. 前端逐 token 追加到代码区，收到 done 后更新 iframe 预览，并将完整 HTML 持久化到 LocalStorage。

### 4.4 Agent 状态机规范

| 阶段 | phase 值 | 前端状态卡片 |
|:---|:---|:---|
| 需求分析 | `analyzing` | 分析中（激活） |
| 方案规划 | `planning` | 规划中（激活） |
| 代码生成 | `generating` | 生成中（激活） |
| 渲染预览 | `rendering` | 渲染中（激活） |
| 完成 | `done` | 全部完成（对勾） |
| 失败 | `error` | 失败（红色） |

前端状态机仅接受以上 phase 迁移，非法 phase 忽略并记录告警日志。

### 4.5 持久化规范（LocalStorage）

- key：`atoms_demo_sessions`（会话列表）+ `atoms_demo_active`（当前会话 id）。
- 会话结构：
```json
{
  "id": "uuid-xxx",
  "title": "待办事项清单网页",
  "messages": [
    {"role": "user", "content": "生成一个待办事项清单网页"},
    {"role": "assistant", "content": "<!DOCTYPE html>...", "status": "done"}
  ],
  "last_code": "<!DOCTYPE html>...",
  "updated_at": 1720000000000
}
```
- 刷新页面时：加载会话列表 → 恢复选中会话 → 用 last_code 重建预览区。
- 容量策略：单会话保留最近 N 条（如 50 条）消息；写入失败（配额满）时提示用户清理。

### 4.6 多轮迭代规范

- 每次 done 后，将最新完整 HTML 作为下一轮的 `history_code`。
- 后端构造 prompt 时按「系统提示（单文件 HTML 约束）→ history_code（上一版）→ 用户新需求」顺序组织消息。
- 判定规则：携带非空 history_code 时要求模型“基于现有代码增量修改”；为空时“从零生成”。

### 4.7 部署规范

- Render / Vercel 配置启动命令 `uvicorn main:app --host 0.0.0.0 --port $PORT`。
- 平台环境变量：`DEEPSEEK_API_KEY`（必填）、`DEEPSEEK_BASE_URL`、`LOG_LEVEL`。
- CORS：开发环境放开 localhost 任意端口；生产环境仅允许部署域名。
- 部署后须回归测试用例 1~5，确认 SSE 流式与预览功能正常。
