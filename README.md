# Atoms-Demo

> 对标 [atoms.dev](https://atoms.dev/) 的最小可行 AI 智能体原型：用户输入自然语言需求，AI 流式生成单文件 HTML，双栏实时预览。
> 开发约束：6~8 小时交付**可运行、可交互、可持久化、可公网部署**的 Demo。

---

## 项目简介

Atoms-Demo 是一个「自然语言 → 网页」的 AI 智能体原型系统。用户在左侧输入需求（如"生成一个待办事项清单网页"），后端调用 DeepSeek 流式生成完整单文件 HTML，右侧 iframe 实时预览；多轮对话中自动把上一版代码作为上下文注入，实现基于现有页面的增量修改，而非每次重新生成。

## 功能特性

- **双栏可视化交互**：左侧对话会话面板，右侧 iframe 实时预览
- **SSE 流式输出**：打字机效果逐 token 展示生成过程
- **Agent 过程反馈**：需求分析 → 方案规划 → 代码生成 → 渲染预览 状态卡片
- **多轮迭代**：上一轮完整 HTML 作为 `history_code` 注入下一轮，增量修改而非重新生成
- **会话持久化**：LocalStorage 保存会话列表与最后生成结果，刷新不丢失
- **代码版本管理**：每次生成为一版（V1/V2…），标签栏回看任意版本，并支持基于历史版本继续迭代
- **会话找回与管理**：会话列表入口常驻、默认展开，支持搜索、重命名、删除，新建会话不丢历史
- **错误处理**：API Key 无效、限流、超时、网络异常均有友好提示

## 技术栈

| 层级 | 选型 |
|:---|:---|
| 前端 | 原生 HTML5 + Vanilla JS（ES Module）+ Tailwind CSS（CDN v3.x） |
| 后端 | FastAPI + Python 3.10+（SSE 流式接口） |
| AI 模型 | DeepSeek API（OpenAI 兼容接口，`stream: true`） |
| 持久化 | 前端 LocalStorage |
| 部署 | Render（Web Service，见 `render.yaml`） |

## 快速开始（本地运行）

### 1. 准备环境

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入 `DEEPSEEK_API_KEY`（DeepSeek 开放平台获取）：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-v4-pro
```

> `.env` 已被 `.gitignore` 忽略，禁止提交；仓库仅保留 `.env.example` 模板。

### 3. 启动服务

```bash
python main.py
# 或 uvicorn main:app --host 0.0.0.0 --port 8000
```

浏览器访问 <http://localhost:8000>。

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `DEEPSEEK_API_KEY` | ✅ | 无 | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | OpenAI 兼容接口基址 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-chat` | 模型名（本账号已验证 `deepseek-v4-pro`） |
| `PORT` | 否 | `8000` | 服务端口（Render 部署时由平台注入 `$PORT`） |
| `LOG_LEVEL` | 否 | `INFO` | 日志级别 |

## 部署到 Render

1. 将本项目 push 到 GitHub（Public 仓库）。
2. 登录 [Render](https://render.com)，点击 **New → Blueprint**。
3. 选择本仓库，Render 自动读取 `render.yaml` 创建 Web Service。
4. 在服务 **Environment** 中手动填入 `DEEPSEEK_API_KEY`（render.yaml 中标记 `sync: false`，需手动设置）。
5. 等待构建完成，访问 Render 提供的公网 URL。

`render.yaml` 已配置：构建命令 `pip install -r requirements.txt`、启动命令 `uvicorn main:app --host 0.0.0.0 --port $PORT`、健康检查 `/api/health`、环境变量（`DEEPSEEK_API_KEY` 手动、`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`/`LOG_LEVEL` 预置）。

## 测试用例（验收清单）

| # | 用例 | 操作 | 预期 |
|:---|:---|:---|:---|
| 1 | 初始生成 | 输入"生成一个待办事项清单网页" | 左侧流式输出代码、右侧预览正常 |
| 2 | 迭代修改 | 输入"把待办清单的背景色改成深色模式，并增加删除已完成事项的功能" | 在前一版基础上正确更新 |
| 3 | 全新生成 | 输入"制作一个简易计算器，支持加减乘除运算" | 生成全新页面，历史记录保留 |
| 4 | 二次迭代 | 输入"在计算器基础上，将按钮改为圆角并增加点击动画" | 增量修改生效 |
| 5 | 持久化验证 | 刷新浏览器 | 历史对话自动加载，预览区恢复最后一次生成结果 |

## 项目结构

```
atoms-demo/
├── main.py              # FastAPI 入口：路由、静态挂载、CORS
├── services/
│   └── ai_generator.py  # AI 调用与 SSE 事件生成
├── static/
│   ├── index.html       # 双栏页面骨架
│   ├── css/style.css    # 自定义样式
│   └── js/              # app/state/storage/api/preview/components
├── render.yaml          # Render 部署蓝图
├── requirements.txt
├── .env.example         # 环境变量模板
└── README.md
```

---

## 开发里程碑

整个开发周期划分为 **4 个阶段（M1 ~ M4）**，按顺序推进，每阶段有明确的交付物与完成标准。

| 里程碑 | 阶段主题 | 建议耗时 | 核心目标 | 完成标准（DoD） |
|:---|:---|:---|:---|:---|
| M1 | 基础骨架搭建 | 第 1-2 小时 | 前后端跑通 | 后端服务可启动，前端双栏页面可访问 |
| M2 | 核心生成链路 | 第 3-4 小时 | 流式生成打通 | 初始生成用例通过：输入需求 → 流式输出 → 预览刷新 |
| M3 | 迭代与体验完善 | 第 5-6 小时 | 多轮迭代 + 过程反馈 | 迭代修改 / 全新生成 / 二次迭代用例通过 |
| M4 | 部署与交付 | 第 7-8 小时 | 公网可访问 | 部署链接可用，质量门禁全部通过 |

## 阶段工作分解

### M1 · 基础骨架搭建（✅ 已完成）
- [x] 初始化项目结构（后端目录 + static 前端目录）
- [x] 搭建 FastAPI 后端：入口 main.py、环境变量加载、日志配置
- [x] 实现 SSE 生成接口骨架 POST /api/generate（先返回固定流，验证链路）
- [x] 搭建前端双栏布局：左侧会话面板 + 右侧 iframe 预览区
- [x] 后端挂载 static 静态资源，前后端联通

### M2 · 核心生成链路（✅ 已完成）
- [x] 接入 DeepSeek API（OpenAI 兼容接口，stream: true）
- [x] 前端 SSE 流式请求与逐 token 输出（打字机效果）
- [x] iframe 预览区实时刷新生成结果
- [x] LocalStorage 会话持久化：会话列表 + 最后生成结果
- [x] 验证测试用例 1「初始生成」（已用真实 DEEPSEEK_API_KEY 回归通过）

### M3 · 迭代与体验完善（✅ 已完成）
- [x] 多轮迭代逻辑：上一轮完整 HTML 作为 history_code 注入下一轮
- [x] 状态机反馈 UI：需求分析 → 方案规划 → 代码生成 → 渲染预览 状态卡片
- [x] 错误处理与重试提示（网络异常、API Key 无效、超时）
- [x] 验证测试用例 2「迭代修改」、3「全新生成」、4「二次迭代」

### M4 · 部署与交付（进行中）
- [x] 撰写 README 完整内容（项目简介、启动方式、环境变量说明）
- [x] 本地验证测试用例 5「持久化验证」（刷新页面数据不丢失）
- [x] 质量门禁自检：无硬编码 Key、功能完整
- [x] 首次 commit 并推送代码至 GitHub（master → main，仓库 Public）
- [ ] 部署到 Render 并配置环境变量（API Key）（代码已推送至 GitHub，待 Render 控制台创建服务并填入 Key）
- [ ] 公网链接回归测试用例 1~5

### M4 增强 · 代码版本管理 + 会话找回（✅ 已实现）

> 依据 `requirements_enhance.md` 实现，完整需求与验收标准见该文档。

- [x] 版本化存储：`session.versions` 数组，每次生成自动追加新版本（V1/V2…）
- [x] 版本标签栏：右侧预览区上方展示，当前版本高亮，tooltip 显示需求与时间
- [x] 版本切换回看：点击标签切换预览 iframe 与代码面板
- [x] 基于历史版本迭代：选中某版本后发送新需求，`history_code` 使用该版本代码
- [x] 旧数据兼容迁移：无 `versions` 的旧会话从历史消息自动重建版本
- [x] 会话找回：修复「收起后无入口」Bug，列表入口常驻、默认展开、偏好记忆
- [x] 会话搜索 / 重命名（双击）/ 删除（hover ✕ + 确认）
- [ ] AI 生成说明文本（FR1.7，P2 暂缓：需调整后端 prompt）

---

## 验收清单（交付前）

- [x] 测试用例 1~4 全部通过（真实 API 回归）
- [x] 本地持久化验证通过（测试用例 5）
- [ ] 部署链接可正常访问，功能完整
- [x] GitHub 仓库为 Public，README 包含项目简介、启动方式、环境变量说明
- [x] 代码中无硬编码 API Key（已使用环境变量）
- [x] 代码已提交并推送至 GitHub（首次 commit 042a5f1）
- [x] 版本管理与会话找回本地验证通过（V1/V2 切换回看、刷新恢复、会话找回、入口常驻）
- [ ] 整体开发耗时控制在 6~8 小时内

> 技术细节见 dev_spec.md，项目目标见 goals.md，逐轮工作记录见 work_log.md。
