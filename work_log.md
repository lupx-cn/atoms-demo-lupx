# 开发工作日志（work_log）

> 用途：逐轮记录每次对话「什么时间、新增/改了哪些文件、做了什么」，仅追加、不回改，便于复盘工作过程。
> 时间格式：`YYYY-MM-DD HH:MM`（本地时区 Asia/Shanghai）；历史轮次为当天同一会话内，时间标注「约」表示估算。

---

## 2026-08-11 15:05（约）· 生成 dev_spec.md
- **新增文件**：`dev_spec.md`
- **做了什么**：依据 `goals.md` 编写开发规范文档，包含技术规约（技术选型、AI 模型规约）、接口定义（POST /api/generate SSE 协议、GET /api/health、错误约定）、编码约束（命名/安全/质量门禁）、架构规范（目录结构、数据流、状态机、LocalStorage 持久化、部署规范）。

## 2026-08-11 15:20（约）· 确认读取 goals.md
- **改动文件**：无
- **做了什么**：确认已成功读取 `goals.md`，向用户说明当前进度（文档准备阶段），未做代码改动。

## 2026-08-11 15:35（约）· 创建 README.md 里程碑规划
- **新增文件**：`README.md`
- **做了什么**：写入项目开发里程碑 M1~M4（基础骨架 / 核心生成链路 / 迭代与体验完善 / 部署与交付），每阶段含目标、建议耗时、完成标准（DoD）与工作分解清单；README 当前只含里程碑规划，简介/启动方式待 M4 补充。

## 2026-08-11 15:50（约）· 初始化项目结构
- **新增目录**：`services/`、`static/css/`、`static/js/components/`（以 `.gitkeep` 占位）
- **做了什么**：按 dev_spec 4.2 初始化后端目录 + static 前端目录骨架，未写业务代码。

## 2026-08-11 16:05（约）· 说明 ai_generator.py 状态
- **改动文件**：无
- **做了什么**：解答「为什么没看到 services/ai_generator.py」——后端骨架按 M1 顺序推进，该文件将在方案 A（M1 后端实现）中创建。

## 2026-08-11 16:25（约）· M1 后端骨架完成（方案 A）
- **新增文件**：`main.py`、`services/__init__.py`、`services/ai_generator.py`、`requirements.txt`、`.env.example`、`.gitignore`
- **做了什么**：FastAPI 入口（health / generate / 静态挂载 / CORS / 日志 / dotenv）；`ai_generator.py` 实现消息构造 → DeepSeek 流式调用 → SSE 事件（status/token/done/error），超时 10s/120s、网络错误重试 1 次；依赖安装到项目内 `.venv`。验证通过：py_compile 编译 OK；TestClient 冒烟（health 200、无 API Key 时输出 error 事件、空 prompt / 超长 history_code 返回 422）。


## 2026-08-11 16:39 · 新增 work_log + M1 后半段（前端双栏骨架）
- **新增文件**：`work_log.md`（本文件）、`static/index.html`、`static/css/style.css`、`static/js/state.js`、`static/js/storage.js`、`static/js/api.js`、`static/js/preview.js`、`static/js/app.js`、`static/js/components/statusCard.js`、`static/js/components/messageItem.js`
- **改动文件**：`README.md`（M1 清单全部勾选）
- **做了什么**：按用户要求建立逐轮工作日志（只追加）；完成 M1 后半段——前端双栏骨架：左侧会话面板（会话列表/消息区/Agent 状态卡片/输入区）+ 右侧 iframe 预览与代码折叠面板；JS 按 dev_spec 拆分模块（app/state/storage/api/preview/components），状态机卡片支持 analyzing→rendering→done/error 五态，LocalStorage key 统一 `atoms_demo_` 前缀，iframe 使用 `sandbox="allow-scripts allow-forms allow-modals allow-popups"`。`api.js` 的 `streamGenerate` 为 M2 占位。
- **验证结果**：TestClient 冒烟——首页与 8 个静态资源均 200、health 正常、无 Key 时 SSE 返回 error 事件；全部 JS 文件通过 `node --input-type=module --check` 语法校验；README M1 五项全部勾选。

## 2026-08-11 16:44 · 清理占位文件
- **删除文件**：`services/.gitkeep`、`static/css/.gitkeep`、`static/js/components/.gitkeep`
- **做了什么**：三个目录已有真实业务文件（services 有 `__init__.py`/`ai_generator.py`，static 有 css/js 模块），删除冗余 `.gitkeep` 占位。

## 2026-08-11 16:47 · 进入 M2 阶段（核心生成链路）
- **改动文件**：无（规划阶段）
- **做了什么**：启动 M2。任务拆解：① `api.js` 实现真实 SSE 流式客户端（fetch + ReadableStream 逐帧解析）；② `app.js` 打字机逐 token 输出、done 后刷新 iframe 预览并持久化到 LocalStorage；③ 验证测试用例 1「初始生成」（无真实 Key 时以 Mock SSE + 后端 error 事件验证链路）。

## 2026-08-11 16:50 · M2 核心生成链路完成（SSE 流式 + 打字机 + 持久化）
- **改动文件**：`static/js/api.js`（重写为真实 SSE 客户端）、`static/js/app.js`（接入流式生成流）、`README.md`（M2 清单前 4 项勾选）
- **做了什么**：① `api.js` 实现 `streamGenerate`：POST /api/generate → fetch + ReadableStream 逐帧解析（帧协议 `data: {"event":...,"data":...}`），支持 status/token/done/error 事件分发、HTTP 错误 detail 提取、history_code 200KB 截断、网络失败友好提示、可注入 baseUrl/signal 便于测试；② `app.js` 接入：发送后插入 assistant 占位消息，token 事件逐段追加到气泡实现打字机效果并自动滚动，done 事件刷新 iframe 预览、同步代码面板、持久化会话与 last_code，error/异常统一标记消息为失败并 Toast；生成期间锁定发送/切换/新建。
- **验证结果**：Mock SSE 服务端 5 用例全通过（正常流事件顺序与载荷、error 透传、HTTP 422 detail 提取、畸形帧跳过、连接失败友好报错）；后端 TestClient 回归全过（首页/静态/health/SSE error 事件/422 超限）；7 个 JS 文件全部通过 node 语法校验。
- **说明**：测试用例 1「初始生成」端到端验证需配置真实 `DEEPSEEK_API_KEY`，已留待真实 Key 回归（README 标注）。


## 2026-08-11 17:05 · 排查并修复「.env 配置了 API Key 仍报服务端未配置 DEEPSEEK_API_KEY」
- **问题现象**：用户已在项目根目录 `.env` 配置 `DEEPSEEK_API_KEY`（sk- 开头，35 位）与 `DEEPSEEK_MODEL=deepseek-v4-pro`，但页面输入需求后始终返回「生成失败：服务端未配置 DEEPSEEK_API_KEY」。
- **排查过程**：
  1. 检查 `.env`：文件存在、Key/模型/BASE_URL 均已填写，但**第 1 行注释写成了 `c DeepSeek API 配置（必填）`（以字母 c 开头而非 #）**，导致 python-dotenv 报「could not parse statement starting at line 1」告警。
  2. 检查服务进程：监听 :8000 的进程 PID 19332（系统 Python `C:\Python314`）启动于 **16:57:51**，而 `.env` 最后修改时间为 **17:03:01**——初步怀疑是「服务启动早于 .env 更新，进程不热加载新配置」。
  3. 验证 Key 有效性：用 `.env` 中的 Key 调用 DeepSeek 官方 `GET /models`，返回 HTTP 200，可用模型为 `["deepseek-v4-flash", "deepseek-v4-pro"]`——**Key 有效、模型名有效**，排除 Key/模型配置错误。
  4. 修正 `.env` 第 1 行注释为 `#`，并把 `main.py` 的 `load_dotenv()` 改为显式路径（`os.path.join(os.path.dirname(__file__), ".env")`，不依赖启动目录）。
  5. 停止旧进程（19332、304）并用项目 `.venv` 重启服务，**问题依旧**（仍返回未配置）——说明不是单纯进程过期。
  6. 逐步导入测试定位根因：**`main.py` 的 import 顺序 bug**。原代码先 `from services.ai_generator import stream_generate`，后 `load_dotenv(...)`。而 `ai_generator.py` 在模块顶层执行 `API_KEY = os.getenv("DEEPSEEK_API_KEY", "")`——当它被 import 时 .env 还没加载，**API_KEY 被固定为空字符串**；之后即便 `load_dotenv()` 把 Key 写入环境变量，模块级变量也不会再更新。独立测试（先 load_dotenv 再 import）都能读到 Key，正是这个时序差异造成的假象。
- **修复内容**：
  - `main.py`：将 `load_dotenv()` 调用**提前到 `from services.ai_generator import ...` 之前**（紧跟 dotenv import 之后），并加注释说明「必须在导入 services 之前加载 .env，否则 ai_generator 模块级 API_KEY 读到空值」。
  - `.env`：第 1 行注释 `c ...` → `# ...`。
  - 服务进程：停止旧服务（16092/23432），用 `.venv\Scripts\python.exe main.py` 重启（新 PID 4680）。
- **验证结果**：全新进程直接 `import main` 后 `services.ai_generator.API_KEY` 有值（FIX VERIFIED OK）；真实调用 `POST /api/generate`（prompt=hello world 测试页）返回完整 SSE 流：`status(analyzing) → status(planning) → status(generating) → token×6325 → status(rendering) → done`，HTTP 200，**API Key 生效、端到端生成链路打通**。
- **经验教训**：模块级 `os.getenv` 读取的环境变量必须在模块被 import 前就绪；FastAPI 入口文件中 `load_dotenv()` 必须位于所有依赖该变量的业务模块 import 之前。

## 2026-08-11 18:01（约）· M3 迭代与体验完善（端到端验收通过）
- **改动文件**：`README.md`（M2「验证测试用例 1」勾选；M3 清单 4 项全部勾选）
- **做了什么**：进入 M3 并完成验收。核对代码：多轮迭代（app.js 以 `session.lastCode` 作为 `history_code` 注入下一轮）、状态机反馈 UI（statusCard.js 四阶段卡片）、错误处理与重试提示（api.js 网络/HTTP 错误友好提示；后端 401/429/超时/网络重试）在 M1/M2 已实现，本轮用真实 `DEEPSEEK_API_KEY` 端到端回归测试用例 1~4。
- **验证结果**：4 个用例全部 PASS——用例1 待办清单（关键词 5/5）、用例2 深色模式+删除已完成事项（基于上一版增量修改）、用例3 全新计算器（新会话生成）、用例4 计算器圆角+点击动画（二次增量修改）；SSE 状态序列 `analyzing → planning → generating → rendering → done` 均正常、HTTP 200；空 prompt / 超长 history_code 返回 422 校验正常。
- **说明**：首轮验收脚本因 PowerShell 管道中文编码问题，case1 误生成「神秘问号页」而非待办清单（仅影响验收脚本、不影响项目代码），已通过 `PYTHONUTF8=1` 修正并重跑通过；单轮真实生成耗时 90~190s（deepseek-v4-pro 输出 22K~40K 字符 HTML），非服务卡死，属模型输出规模正常现象。验收脚本位于系统临时目录（未入库），生成结果已保存供复核。
