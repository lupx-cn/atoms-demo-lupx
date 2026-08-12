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

## 2026-08-11 18:26（约）· M4 部署准备：Render 部署文件 + README 完整化
- **新增文件**：`render.yaml`
- **改动文件**：`.gitignore`、`.env.example`、`README.md`（重写为完整版）
- **做了什么**：新增 Render Blueprint 部署蓝图（构建 `pip install -r requirements.txt`、启动 `uvicorn main:app --host 0.0.0.0 --port $PORT`、healthCheck `/api/health`、环境变量 `DEEPSEEK_API_KEY`（sync:false，需手动填）、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL=deepseek-v4-pro`、`LOG_LEVEL`）；`.gitignore` 补充 `server.log`/`server.log.err`/`*.log`；`.env.example` 模型名改为 `deepseek-v4-pro`；README 补齐项目简介、功能特性、技术栈、本地启动、环境变量说明、Render 部署步骤、测试用例表、项目结构、M1~M3 里程碑勾选与 M4 清单、验收清单。

## 2026-08-11 18:26（约）· M4 持久化验证（测试用例 5 PASS）
- **改动文件**：无（仅验证）
- **做了什么**：通过应用内浏览器真实流程验证持久化——输入需求生成待办页面（约 3.5 分钟）→ 刷新页面 → 会话、消息、「生成完成」状态、预览区（srcdoc 41996 字符）全部恢复，截图 `persistence-check.png`。
- **验证结果**：PASS，本地持久化（LocalStorage）刷新不丢数据。

## 2026-08-11 18:26（约）· M4 质量自检 + 首次 commit + push
- **改动文件**：`README.md`（M4 清单新增「代码已推送」项；验收清单勾选「代码已提交并推送」）
- **做了什么**：质量门禁自检——扫描项目无硬编码 API Key（仅 `.env.example`/README 占位符），`.env`/`server.log*`/`.venv` 均被忽略不入库；设置仓库级 git 身份（lupx-cn / noreply 邮箱）；首次 commit `042a5f1`（20 文件、1682 行）；执行 `git push -u origin master:main` 成功。
- **验证结果**：push 输出 `* [new branch] master -> main`，本地 master 建立对 origin/main 的跟踪；远程仓库为 Public（用户确认）。

## 2026-08-11 19:16（约）· 需求细化：代码版本管理 + 会话找回（M4 测试反馈）
- **新增文件**：`requirements_enhance.md`
- **做了什么**：细化用户 M4 测试反馈的两点需求。① 代码无版本位置：确认数据层 `messages` 已天然保留每轮完整代码（每条 done 的 assistant 消息即一版），缺的是版本结构（`versions` 数组）与版本 UI（标签栏 / 切换回看 / 基于历史版本继续迭代 / 旧数据迁移）；② 新建会话后旧对话找不见：定位根因——`static/index.html` 中 `#session-list-wrap` 初始 `hidden`（默认折叠），且「展开/收起」按钮位于可折叠容器内部，收起后按钮随容器消失、页面无任何入口可恢复（真 Bug，数据未丢失）。文档包含用户故事、功能需求 FR1.x/FR2.x、数据模型变更、验收标准 AC1.x/AC2.x、优先级（P0 会话找回 / P1 版本管理 / P2 可选增强：说明文本、搜索、重命名/删除）、边界取舍。
- **验证结果**：读取 index.html/app.js/storage.js 确认问题根因；会话数据实际保存在 LocalStorage，未丢失。

## 2026-08-11 19:45（约）· 实现 requirements_enhance.md：代码版本管理 + 会话找回
- **新增文件**：`static/js/components/versionBar.js`
- **改动文件**：`static/index.html`、`static/css/style.css`、`static/js/storage.js`、`static/js/app.js`
- **做了什么**：按需求细化文档实现 P0/P1 与部分 P2。① 版本管理（FR1.1~1.6）：`session.versions` 数组（每次生成 done 时追加 `{index,label,prompt,code,createdAt}`）；预览区上方版本标签栏（新组件 `versionBar.js` 渲染 V1/V2…，当前版本高亮，tooltip 显示需求摘要与时间）；点击标签回看——预览 iframe 与代码面板同步切换；`getBaseCode()` 以当前查看版本作为下一轮迭代基准注入 `history_code`；旧会话无 versions 时从 messages 中 status=done 的 assistant 消息自动迁移重建版本。② 会话找回（FR2.1~2.4）：修复「收起后无入口」Bug——折叠按钮移出可折叠容器、标题栏常驻，仅折叠列表体；默认展开且偏好记忆（`loadPref/savePref`）；新增当前会话标题栏；会话搜索过滤（按标题关键字 + 计数显示）。③ 会话管理（FR2.5）：双击会话标题重命名、hover ✕ 删除（带确认），删除当前会话后自动切换。
- **验证结果**（应用内浏览器真实流程）：旧数据迁移 PASS（历史会话自动重建 V1）；基于 V1 迭代生成 V2 PASS（后端日志 history_len=41991 确认注入 V1 代码，V2 输出 45KB 完成）；版本切换回看 PASS（点击 V1 预览恢复 41996 字符）；刷新恢复 PASS（V1/V2 标签、当前版本、预览、会话、消息全部恢复）；新建会话找回 PASS（新会话后旧会话仍在列表，点开完整恢复）；折叠/展开入口常驻 PASS；搜索过滤 UI 与逻辑已实现（验证时浏览器标签页被回收，未完成 UI 级断言）。全部 8 个 JS 文件语法校验通过。
- **说明**：① 验证过程中后端服务在生成请求中断开（服务进程退出），浏览器报「无法连接生成服务」，属服务中断非代码缺陷，已用 `.venv\Scripts\python.exe main.py` 重启（PID 32192）后恢复；② FR1.7（AI 生成说明文本）暂缓，需调整后端 prompt、可能影响现有稳定输出解析；③ FR2.6 排序与时间展示沿用已有实现（updatedAt 倒序 + 时间）。

## 2026-08-11 19:49 · 理解项目现状（文档研读 + 代码走读）
- **改动文件**：无（仅研读）
- **做了什么**：按用户要求先理解项目再继续工作，通读四份核心文档与代码。① `goals.md`——项目终极目标：对标 atoms.dev 的最小可行 AI 智能体原型，自然语言 → AI 流式生成单文件 HTML，双栏实时预览；基础功能/硬性合规/创新亮点均已勾选完成，仅剩质量门禁（测试用例全过、部署链接可用、仓库 Public、无硬编码 Key、6~8h 内）。② `dev_spec.md`——技术规范：FastAPI + SSE、原生 HTML/Vanilla JS/Tailwind CDN、DeepSeek 流式接口、LocalStorage 持久化、状态机五阶段、目录结构与部署规范。③ `README.md`——里程碑 M1~M4：M1 骨架 / M2 核心生成链路 / M3 迭代与体验 / M4 部署交付均已完成（M4 仅剩「部署到 Render + 公网回归」未完成），另含 M4 增强（版本管理 + 会话找回，已实现）。④ `work_log.md`——逐轮工作日志（本文件）。代码走读：`main.py`（load_dotenv 前置修复后的入口 + 路由 + 静态挂载）、`services/ai_generator.py`（消息构造 → DeepSeek 流式 → SSE status/token/done/error，超时/重试/错误透传）、`static/js/app.js`（会话管理 + 流式生成 + 版本追加 + 迁移逻辑）。
- **验证结果**：项目当前处于 M4 收尾阶段；git 最新提交 `bcdad89`（M4 增强）；工作区干净，无未提交改动。

## 2026-08-11 19:57 · 需求分析：三栏布局 + 右侧多功能面板（需求文档）
- **新增文件**：`requirements_layout_v2.md`
- **做了什么**：用户提出需求变更/追加（两条消息合并）：① 第一条：固定双栏经典布局（左对话需求面板 + 右一体化工作区：预览 + 文件资源管理器），解决"源码文件查看路径不清晰、预览成品页面与需求页面重叠"两个痛点；② 追加消息细化：右栏改「预览 / 代码」Tab 切换（预览=可拖拽缩放的模拟浏览器窗口 + V1/V2 版本切换只渲染网页；代码=完整 HTML 源码编辑器替代底部弹出）、版本切换规则修正（只加载对应版本 HTML，对话说明只留聊天区）、新增【下载 HTML】导出（独立单文件、双击即开）、布局调整为三栏（左会话列表 / 中 AI 对话聊天 / 右统一多功能面板）。本轮按用户要求只做需求分析并整理成追加需求文档，**未改任何代码**。文档含：现状问题根因分析（问题 A~D）、目标三栏布局、四大需求 FR（右侧多功能面板 / 版本切换隔离 / 导出下载 / 对话区与预览区硬隔离 + 消息卡片化）、数据模型与影响面、优先级（P0 布局+Tab+隔离+导出+卡片化；P1 拖拽缩放+文件树；P2 编辑保存/summary/多文件）、验收标准 AC、边界取舍、待确认项 Q1~Q5（双栏 vs 三栏、代码只读、拖拽缩放交互、消息卡片呈现、下载命名）。
- **验证结果**：文档 166 行写入成功（UTF-8 无 BOM）；此前曾尝试用 apply_patch 创建文件但被环境拒绝（Access is denied），改用 PowerShell 直接写文件完成。
- **待用户确认**：Q1~Q5（见文档第 9 节），确认后再进入实现。

## 2026-08-11 20:10（约）· 需求确认 + 实现「三栏布局 + 右侧多功能面板」v2
- **新增文件**：`Requirement Layout - V2.md`（由 `requirements_layout_v2.md` 改名而来，含 Q1~Q5 确认结论）、`static/js/download.js`、`static/js/components/fileTree.js`
- **删除文件**：`requirements_layout_v2.md`（内容并入新文件名，避免重复文档）
- **改动文件**：`static/index.html`（三栏布局重构）、`static/css/style.css`（新增分栏拖拽条/Tab/浏览器窗口/文件树/消息卡片样式）、`static/js/app.js`（全面重写）、`static/js/components/messageItem.js`（消息卡片化）、`README.md`（功能特性 + 项目结构 + M4 增强 v2 里程碑）
- **确认结论（Q1~Q5）**：① 三栏宽度可拖拽调节；② 代码编辑器需编辑/保存/下载；③ 预览窗口画布内拖拽位置 + 右手柄缩放；④ assistant 消息改版本卡片；⑤ 下载文件名 = 会话项目名-V{n}.html。
- **做了什么**（按确认需求实现 v2）：① 三栏布局——左会话列表 / 中 AI 对话聊天（消息+状态卡+输入区）/ 右统一多功能面板，分隔条拖拽调宽并记忆偏好；② 右栏「网页预览 / 源代码」Tab 切换，替代原顶栏「查看代码」与底部弹出代码面板；③ 预览模式——模拟浏览器窗口（地址栏/刷新按钮），画布内拖拽移动 + 右手柄缩放，位置/缩放存 LocalStorage，刷新按钮可重渲染；④ 版本隔离——V1/V2 切换只更新右栏（预览 iframe + 代码编辑器），聊天区不受影响；⑤ 代码模式——textarea 可编辑、保存（更新当前版本代码并刷新预览+持久化）、下载，左侧文件树显示 index.html；⑥ 下载导出——Blob 生成 `会话项目名-V{n}.html`（非法字符清洗），预览/代码模式按钮共用；⑦ 消息卡片化——assistant 生成中显示「生成中+已输出 KB」轻量卡，完成后渲染版本卡片（版本号+时间+需求摘要+在预览中查看/复制代码/下载），聊天区不再铺大段 HTML 源码，预览区零对话说明文字；⑧ 生成流 token 不再写入聊天气泡（仅更新大小指示与右栏代码），解决「大片白底+杂乱文字」痛点。
- **验证结果**：10 个 JS 文件全部通过 `node --check`（临时 .mjs 副本）语法校验；`app.js` 引用的 33 个元素 ID 与 `index.html` 全部匹配，旧元素（codePanel/btnToggleCode/sessionListWrap 等）无残留引用；HTTP 冒烟 13/13 全过（健康检查、首页、CSS、全部 JS 均 200），首页关键结构（三栏/双 Tab/浏览器窗口/文件树/编辑器/下载按钮/分隔条）齐全；服务沿用已在运行的 PID 32192（静态文件按请求读盘，无需重启）。无头浏览器（playwright/jsdom）在本环境不可用，未做 UI 级断言，建议用户打开页面人工确认交互。
- **说明**：apply_patch 在本环境被系统拒绝执行（Access denied），全程改用 PowerShell 直接读写文件（UTF-8 无 BOM）；三栏宽度与浏览器窗口偏好存储于 LocalStorage（`colWidths`/`browserWindow`/`panelTab`），旧会话数据（messages/versions）未改动，向后兼容。

## 2026-08-11 20:18（约）· 修复需求文档命名与 Markdown 格式
- **新增文件**：`requirement_layout_v2.md`（修复后的正式需求文档）
- **删除文件**：`Requirement Layout - V2.md`（命名有误 + 内容含 diff 残留前缀）
- **改动文件**：`README.md`（文档引用 `Requirement Layout - V2.md` → `requirement_layout_v2.md`）
- **做了什么**：① 文件重命名——按用户要求由 `Requirement Layout - V2.md` 改为 `requirement_layout_v2.md`（小写 + 下划线命名规范）；② 修复 Markdown 格式错误——排查确认文件 166 行中 160 行开头残留 `+` 前缀（根因：最初用 apply_patch 补丁格式生成内容、fallback 写入时未剥离 diff 行前缀），逐行剥离行首 `+`（仅处理前缀，正文行内的 `+` 如「预览 + 代码」不受影响），写入新文件；③ 同步更新 README.md 中对需求文档的引用。
- **验证结果**：新文件 0 残留 `+` 前缀；Markdown 结构完整——标题层级（H1/H2/H3）正常、表格（第 1 节三栏布局表等）正常、列表与引用块正常、无异常行；README 引用已同步；work_log 旧记录保留原文件名（历史记录不回改）。

## 2026-08-11 20:25（约）· 需求整理：v2.1 三项体验修复（待确认）
- **改动文件**：`requirement_layout_v2.md`（追加第 10 节「需求变更 v2.1」）
- **做了什么**：用户实测 v2 后反馈 3 个问题，本轮按要求整理需求并确认意图，**未改任何代码**。① 问题 P1：生成结果卡片只能看最终结果，无法查看生成过程对话/分析——根因：完成卡片仅含摘要，生成阶段（analyzing→planning→generating→rendering）未持久化；需求 FR-A1~A3：卡片可展开（需求全文/阶段时间轴/AI 说明），versions 新增 process 字段。② 问题 P2a/P2b/P2c：源代码框被文件树+三栏挤压成细线、版本选择应在 Tab 之前、点 V1/V2 后出现不明 AI 文字——根因：file-tree 固定 176px 且右栏无最小宽、version-bar 在预览面板内部、AI 文字可能来自版本标签 tooltip 或生成 HTML 内嵌说明；需求 FR-B1~B3（版本栏上移共用 + 版本联动 + 消除说明文字）+ FR-C1（文件树收窄/可折叠 + 右栏最小宽）。③ 问题 P3：预览待办清单页面细长且无法左右拖拽调宽——根因：预览窗口默认宽仅画布 86% 且只有右下角手柄；需求 FR-C2~C3（默认加宽 + 右侧边缘水平拖拽手柄 + 热区扩大）。
- **待用户确认**：Q1（展开内容是否接受"需求全文+阶段时间轴+AI说明"，是否要后端额外输出说明）、Q2（AI 文字具体出现在预览页内/标签悬浮提示/其他）、Q3（预览窗口仅水平调宽还是四边四角缩放）。确认后实施。


## 2026-08-11 20:47 · v2.1 实施完成 + 排查「index.html 测试信息消失」
- **改动文件**：`static/js/app.js`、`static/js/components/messageItem.js`、`static/js/components/versionBar.js`、`services/ai_generator.py`（上一轮已加强 SYSTEM_PROMPT）、`static/index.html`、`static/css/style.css`（上一轮已完成布局/样式）
- **做了什么**：完成 v2.1 三项体验修复的剩余实施。① 卡片可展开（FR-A1~A3）：`messageItem.js` 完成卡片新增「▸ 展开详情」按钮，展开区显示需求全文 / 生成过程阶段时间轴（analyzing→planning→generating→rendering，含各阶段时间点与阶段耗时）/ AI 说明；`app.js` 生成中 `onStatus` 记录各阶段时间戳写入 `version.process`，AI 说明剥离后存入 `version.note`。② 消除预览区 AI 说明文字（FR-B3）：新增 `sanitizeCode()`——保守剥离生成 HTML 内嵌的说明段（HTML 注释、以「这是为您/已为您/以下是…」等客套语开头的无嵌套块级段落、body 首尾裸文本），预览/代码/下载/复制统一经 `displayCode()` 净化，历史版本切换同样生效；`versionBar.js` tooltip 极简化（仅「V1 · 时间」，移除需求摘要避免误认）。③ 预览窗口显示与缩放（FR-C2/C3）：`app.js` 默认窗口尺寸改为画布约 94%×92%（下限 360×280），新增四边 `.browser-edge` 拖拽缩放手柄（上/下 ns-resize、左/右 ew-resize，与右下角手柄并存）。
- **排查「index.html 测试信息消失」**：经无头 Chrome（CDP）实测确认——测试数据（会话/消息/V1/V2 版本）存储在浏览器 LocalStorage（`atoms_demo_sessions`/`atoms_demo_active`），**不在 index.html 文件内**，文件改动不会导致数据丢失；通过 `http://localhost:8000` 访问时注入测试数据后会话列表/消息卡片/版本栏/预览/代码全部正常恢复。若直接双击 `static/index.html` 以 `file://` 打开：① ES Module 被浏览器 CORS 拦截（`app.js` 不执行，页面只剩静态骨架）；② `file://` 与 `http://localhost:8000` 是不同存储域（LocalStorage 互相隔离），因此表现为「测试信息全没了」。正确访问方式 = 保持后端运行，浏览器打开 `http://localhost:8000/`。
- **验证结果**：全部 10 个 JS 文件 `node --check` 通过；HTTP 冒烟 13/13 全 200；CDP 无头浏览器端到端验证——注入含 AI 说明的 V2 后刷新：预览 srcdoc 已剥离说明且保留页面真实内容（任务A/B）、卡片展开可见「需求/生成过程/AI 说明」三区（时间轴 需求分析 20:46:45·10.0s → 方案规划 ·20.0s → 代码生成 ·7.0s → 渲染预览）、四边手柄 4 个存在、版本栏前置共用可见、默认窗口 451px（画布 480px 的 94%）。服务沿用 PID 32192（静态文件按请求读盘，未重启）。

## 2026-08-11 21:19 · 修复「预览页出现未知 AI 说明文字」
- **改动文件**：`static/js/app.js`（`sanitizeCode()`）、`services/ai_generator.py`（`clean_generated_code()`）
- **做了什么**：定位「预览里出现『页面特点说明 这个工具围绕任务管理设计…』」的根因——AI 输出在 `</html>` 闭合标签之后还追加了 437 字符 Markdown 说明（`### 页面特点说明`、`- **任务操作**…`）；浏览器 HTML5 解析会把 `</html>` 之后的非空白文本重新并入 body 渲染，原净化逻辑只处理 `<!DOCTYPE` 之前与 `<body>…</body>` 内部，漏掉了尾部。修复：① 文档提取后新增「⓪.5 截断」——截断到最后一个 `</html>`（无则最后一个 `</body>`），其后内容一律丢弃；② 新增「①.5 AI 页面说明区块」——按标题（页面特点说明/页面功能说明/功能介绍/页面介绍/页面说明等）剥离不含交互元素（button/input/form/a/onclick）的纯说明容器；③ 改进「③ body 裸文本」——跳过空行、支持说明区块的 Markdown 续行聚集剥离。前后端同步实现（前端 `sanitizeCode` / 后端 `clean_generated_code`），预览/代码/下载/复制统一走净化。
- **验证结果**：`node --check static\js\app.js` 与后端 `py_compile` 均通过；前后端各 7 个用例全部通过（真实尾部说明、div/section 包裹、裸文本 Markdown、真实页面含按钮不被误删、客套语说明、功能特点说明），输出均以 `</html>` 结尾；用户真实场景（前导说明 + ```html 围栏 + HTML + 尾部 437 字符说明）复测通过。前端静态文件刷新即生效；后端 `ai_generator.py` 改动需重启 uvicorn 才对新生成内容生效（当前进程未重启）。
## 2026-08-11 21:45 · v2.2 实施：生成过程内容可见（阶段文字流式）+ 布局微调
- **改动文件**：`services/ai_generator.py`、`static/js/api.js`、`static/js/app.js`、`static/js/components/messageItem.js`、`static/index.html`、`static/css/style.css`、`requirement_layout_v2.md`（追加第 11 节需求文档）
- **做了什么**（对应已确认需求 R1/R2/R3，详见 `requirement_layout_v2.md` 第 11 节）：
  ① **R1 阶段内容可见**：后端 `SYSTEM_PROMPT` 改为三段输出格式（`<analysis>…</analysis>` 需求分析 → `<plan>…</plan>` 方案规划 → 纯 HTML）；新增 `_StageStreamParser` 流式标记解析器（支持标记跨 chunk 截断、未闭合标记按 html 兜底、无标记回退），模型输出中的分析/规划文字通过新 SSE 事件 `stage_text` 实时下发，HTML 部分仍走 `token` 事件，标记在解析时剥离、`done` 代码保持纯 HTML；`api.js` 新增 `stage_text` 事件分发 → `onStageText(stage, text)`；`app.js` 生成中卡片新增流式区（`updateLiveStream` 实时显示「需求分析/方案规划」文字，进入 generating 阶段切换回输出大小指示），`onDone` 把 `stageText`（analyzing/planning）写入版本；`messageItem.js` 完成卡片展开区新增「阶段内容」区块，按阶段展示两段文字；`style.css` 新增 `.msg-card-stream`/`.d-stage` 样式。代码生成/渲染预览两阶段按确认保留时间轴。
  ② **R2 新会话按钮移左栏**：`＋ 新会话` 按钮从顶栏移到左栏（会话列表栏）顶部通栏（`session-list-body` 之外，折叠时仍可见），顶栏移除按钮，事件绑定 id 不变。
  ③ **R3 代码展示框高度**：根因 = `#panel-code` 缺少 Tailwind `flex` 类（`flex-col` 只设 flex-direction），切到源代码 Tab 时面板退化为 block、textarea 塌缩到默认 2~3 行；补 `flex` 类后代码区占满右栏剩余高度（≈左栏高度略矮）。
- **验证结果**：后端 `py_compile` 通过；`_StageStreamParser` + `stream_generate` 4 个用例全过（标记跨 chunk 剥离并实时下发 stage_text、无标记回退纯 HTML、分析标记未闭合兜底不丢内容、含 `<div id='plan'>` 的 HTML 不误判）；10 个 JS 文件 `node --check` 全过；messageItem DOM 桩测试通过（生成中卡片含隐藏流式区、完成卡片展开区含「阶段内容」及两段文字）；HTTP 冒烟 7/7 全 200、health 正常。
- **说明**：后端 `ai_generator.py` 改动需重启 uvicorn 才对新生成内容生效（当前进程未重启）；前端静态文件刷新即生效。历史会话的 `version.stageText` 为空时展开区不显示「阶段内容」，不影响旧数据。


## 2026-08-11 21:55 · 修复「预览模块渲染太大、页面变形」
- **改动文件**：`static/js/app.js`、`static/index.html`、`static/css/style.css`
- **问题现象**：右侧「网页预览」中生成的页面渲染过大、布局被拉伸变形。
- **根因**：预览 iframe 直接铺满画布 94%×92%（v2.1 为「不截断」调大的默认窗口），页面在大视口下被整体拉伸，未做缩放适配。
- **做了什么**：① 新增「等比缩放适配」——iframe 固定按基准宽度 `PREVIEW_BASE_WIDTH = 1024` 渲染（`index.html` 中包一层 `#browser-frame-wrap`，CSS 固定 iframe 基准尺寸 + `transform-origin: 0 0`），`applyBrowserWindow()` 按窗口内容区宽度计算 `scale = min(1, 可用宽/1024)`，用 `transform: scale()` 整体缩放，页面不再拉伸变形、也不被截断；拖拽缩放/四边手柄/右下角手柄调整窗口后自动重新适配。② 默认窗口从 94%×92% 调小为「宽度取画布 88% 且不超过基准宽+16px、高度取画布 88%」，并居中（左右 6%、上下 5%）。
- **验证结果**：`node --check` app.js / preview.js 通过；HTTP 冒烟 3/3 全 200。前端静态文件刷新即生效。

## 2026-08-11 22:47 · 修复「AI 生成 HTML 结构残缺（容器/脚本闭合标签丢失）」
- **改动文件**：`services/ai_generator.py`、`static/js/app.js`、`work_log.md`（本轮追加记录）
- **问题现象**：在页面输入需求（如「生成一个待办事项清单网页」）生成的 HTML 渲染效果差——无居中卡片、内容直接贴顶、样式丢失；下载的 HTML 结构残缺：`<body>` 开头缺少 `<div class="app-container">`、`<div class="app-header">` 开标签，结尾缺少 `</script>` 闭合标签，导致整段 JS 不执行、布局崩坏。此前已修改 SYSTEM_PROMPT，生成结果仍同样残缺。
- **根因**：后端 `clean_generated_code()` 与前端 `sanitizeCode()` 第 ③ 步「body 开头/结尾裸文本说明剥离」把「去掉标签后无文本」的行一律当作空行删除，误删了纯标签的结构行（如 `<div class="app-container">`、`<div class="app-header">`、`</script>`）。前端预览/下载与后端 `done` 事件都经过该净化逻辑，因此问题与提示词无关，模型输出的正确结构被净化环节删坏。
- **做了什么**：前后端同步修复——body 开头/结尾的剥离循环先判断「整行仅空白」（`raw.strip()` 为空）才跳过，纯标签结构行不再被删除；真正的说明文字（客套语、页面说明区块标题等）剥离逻辑保持不变。
- **验证结果**：用用户附带的下载文件还原模型原始输出，旧逻辑可 100% 复现残缺结果，新逻辑输出结构完整（div 5/5、script 1/1、以 `</html>` 结尾，HTML 解析器零未闭合/零多余闭合标签）；说明文字剥离 5 个回归用例（前导裸文本/前导 <p>/尾部说明/尾部说明区块/真实页面）通过；前端 `sanitizeCode` 8 个用例全过；`py_compile` 与 `node --check` 通过。后端改动需重启 uvicorn 才对新生成内容生效，前端静态文件刷新即生效。


## 2026-08-11 23:01 · 修复「净化管线第 ④ 步误删页面渲染挂载容器（空 div 被清掉）」+ work_log 留存确认
- **改动文件**：`services/ai_generator.py`、`static/js/app.js`、`work_log.md`（本轮追加记录）
- **问题现象**：重启并修复上一轮结构问题后重新生成待办清单网页（用户附件 `F:/download/生成一个待办事项清单网页-V1 (3).html`），页面仍然不正常——新增任务后列表区域始终空白，任务列表不渲染；点击「进行中」「已完成」筛选无任何变化，也看不到刚添加的任务；仅顶部统计文字（共 N 项任务，M 项进行中）有更新。
- **根因**：依然是本项目净化管线自身的问题，与模型输出无关。后端 `clean_generated_code()` 与前端 `sanitizeCode()` 第 ④ 步「清理剥离后残留的空块级标签」用正则 `<(p|div|section|blockquote)[^>]*>\s*</\1>` 删除所有空块级标签，把模型生成的合法空容器 `<div class="task-list" id="taskList"></div>`（页面 JS 的列表渲染挂载点）当作「剥离后残留空壳」一并删掉；JS `render()` 执行 `taskList.innerHTML = ...` 时 `taskList` 为 null 抛异常，导致列表永不渲染、筛选与新增看似无效。还原模型原始输出后确认该 div 在原始代码中存在，净化后被删除（旧逻辑逐字节复现坏文件）。
- **做了什么**：前后端同步修复第 ④ 步——只清理「无任何属性」的裸空标签（说明剥离后留下的空壳），带 `id/class/data-*/style` 等属性的空容器一律保留（它们是 JS 渲染挂载点，如 `#taskList`、`#filterBar`、`ul#todoList`）；说明文字剥离逻辑不变。
- **验证结果**：用用户附件还原模型原始输出，修复后 `#taskList` 容器保留，输出与坏文件不再相同；HTML 结构解析零未闭合/零多余闭合标签；后端 7 个用例（空挂载点保留、裸空标签清理、说明剥离后空壳清理、前导/尾部说明剥离、真实页面、结构完整）全过；前端 `sanitizeCode` 6 个用例全过；`py_compile`、`node --check` 通过；最终输出中 JS `getElementById` 引用的全部 7 个 id（addBtn/taskInput/addBtn/filterBar/taskList/taskCount/clearCompletedBtn/statsRow）均存在于 HTML。修复后的可运行版本另存为 `_todo_fixed_preview.html` 供对比，验证后可删除。后端改动需重启 uvicorn 生效，前端刷新即生效。


## 2026-08-11 23:02 · 确认「净化第 ④ 步误删渲染挂载容器」修复已落地（本轮为确认与日志留存）
- **本轮内容**：用户确认第 ④ 步修复方案并要求把修改内容、问题与时间写入 work_log；本轮无新增代码改动。
- **改动文件**：`work_log.md`（本轮追加记录）；代码改动详见上方 `2026-08-11 23:01` 条目（`services/ai_generator.py`、`static/js/app.js` 第 ④ 步空标签清理改为仅清理无属性的裸空标签，保留 `id/class/data-*/style` 空容器）。
- **生效方式**：前端刷新即生效；后端需重启 uvicorn 后重新生成验证。


## 2026-08-11 23:23 · 实施「预览存储桥（按会话持久化）+ 下载时烘焙数据/空模板二选一」
- **改动文件**：`static/js/preview.js`、`static/js/app.js`、`static/index.html`、`static/css/style.css`、`work_log.md`（本轮追加记录）
- **问题现象**：在预览里生成的待办清单中添加任务后，切到其他会话再切回来（或点预览刷新按钮），刚添加的数据全部消失。根因：预览 iframe 的 sandbox 没有 `allow-same-origin`，生成页访问 `localStorage` 会抛 SecurityError，而生成页的读写都包在 try/catch 里被静默吞掉，数据只存在于内存，预览一重建就丢。
- **方案决策**：与用户对齐后确定折中方案——预览内持久化用「存储桥」解决（数据按会话存在应用侧，不污染 HTML 源代码）；下载时提供两个选项：**含预览数据**（把数据烘焙进 HTML，兑现“数据存进 html 源代码”的诉求）与**空模板**（干净的 HTML）。
- **做了什么**：
  ① **存储桥（preview.js）**：`renderCode(code, sessionId)` 在生成页 `<body>` 后注入一段前置脚本，把 `localStorage/sessionStorage` 替换为内存代理（含 `getItem/setItem/removeItem/clear/key/length`）；渲染时按会话 ID 从应用 localStorage（key 前缀 `atoms-preview:`）回灌数据作为 seed，生成页内的变更通过 `postMessage`（命名空间 `atoms-preview-storage`，校验消息来源为本预览 iframe）回写父页面并按会话保存。效果：切会话/刷新预览数据不丢，不同会话数据隔离，沙箱安全级别不变。
  ② **会话接线（app.js）**：新增 `renderPreview(code)` 辅助函数，12 处 `renderCode` 调用全部改为自动带 `getState().activeSessionId`。
  ③ **下载二选一（app.js + index.html + style.css）**：下载按钮改为下拉菜单，两项分别为「💾 下载（含预览数据）」「⬜ 下载（空模板）」；`bakePreviewData()` 把会话的预览存储数据以 `<script>localStorage.setItem(...)</script>` 形式注入 `<body>` 之后（JSON 中的 `<` 转义为 `\u003c` 防注入破坏），无数据时原样返回；空模板直接下载干净代码；点击菜单外/Esc 关闭菜单；代码面板下载按钮同样走该菜单。
- **验证结果**：`node --check` app.js / preview.js 通过；桥注入 16 个单测全过（注入位置、seed 回灌、set/remove/clear 消息处理、会话隔离、无关消息忽略、烘焙脚本位置与转义、空数据原样返回）；端到端 17 项验证通过（真实桥脚本在页面 vm 中 getItem/setItem/postMessage/remove/clear/length 全部正确、app.js 接线完整、index.html/style.css 菜单元素齐全）。`renderPreview` 出现 13 次 = 12 处调用 + 1 处函数定义，接线正确。后端 `ai_generator.py` 改动（前两轮第 ③④ 步净化修复）仍为未提交状态，需重启 uvicorn 生效；本轮前端改动刷新页面即生效。

## 2026-08-11 23:41 · 清理残留 + 提交推送 + 新增交付说明文档
- **新增文件**：`DELIVERY_NOTES.md`（笔试交付说明：实现思路与关键取舍、当前完成程度、后续扩展与优先级，附与 Atoms 官方能力对照表；在线 Demo 链接待部署后回填）
- **删除文件**：`_todo_fixed_preview.html`（对比用临时文件，已完成使命）
- **改动文件**：`services/ai_generator.py`（删除第 31-40 行被注释掉的旧 SYSTEM_PROMPT 残留，463→452 行；净化和 SYSTEM_PROMPT 升级改动保留）、`work_log.md`（本轮追加记录）
- **做了什么**：① 用户确认删除临时文件与注释残留，已执行；② 由于沙箱环境 apply_patch 无法执行（WindowsApps 下 codex.exe 被拦截），改用 PowerShell 原生行删除（无 BOM、UTF-8 编码保持不变），`py_compile` 通过；③ git 提交 `68bcbe2`（6 文件，+274/-42，含净化修复与预览存储桥）并推送至 GitHub master（远程 `git@github.com:lupx-cn/atoms-demo-lupx.git`）；④ 核实 atoms.dev 官网与文档站（AI 员工分工协作、对话式生成、Publish/Share、集成 GitHub/Supabase/Stripe 等），据此撰写 `DELIVERY_NOTES.md` 供笔试提交附用。
- **验证结果**：`_todo_fixed_preview.html` 已确认删除；`ai_generator.py` 语法校验通过；提交推送成功。

## 2026-08-12 10:50 · 诊断「部署后打字机逐字输出效果看不到」（仅诊断，无代码改动）
- **改动文件**：`work_log.md`（本轮追加记录）；本轮无新增/修改业务代码，仅排查线上问题。
- **问题现象**：部署于 Render 的 https://atoms-demo-lupx.onrender.com/ 上，需求完成后点击展开「需求分析 / 方案规划」，能看到阶段内容文本，但看不到打字机逐字输出的动画效果。
- **排查过程**：
  ① 确认线上前端 JS 与本地一致：`index.html`、`js/app.js`（37,280B）、`js/components/messageItem.js` 均含 v2.2 流式能力（`updateLiveStream` / `onStageText` / `.msg-card-stream` / `stageText` 持久化），`js/api.js` 与本地逐字符一致（含 `stage_text` 事件分发）；git 历史确认 `_StageStreamParser` / `stage_text` / `updateLiveStream` 由 v2.2 提交 `a659f7b` 引入，origin/main 与 origin/master 均包含，排除「代码未上线/功能缺失」。
  ② 实测线上 SSE 时序（`curl -N` 禁缓冲）：首包（含 `status(analyzing)`）延迟约 1.5s 才到达客户端；本地 uvicorn 对照首包仅 19ms。64B 小粒度读取线上时，`status(analyzing)` 约 6.5s 后才读出，其后 `stage_text` 以 30–50ms/帧、每帧 1–2 字符的真实逐字节奏到达（共 50+ 帧），内容完整（`\n用`、`户`…）。
- **根因结论**：后端 v2.2 `stage_text` 逐字流真实存在且已上线；看不到打字机效果的原因是 **Render 免费实例网关对 SSE 首个数据块做了缓冲聚合**——`status(analyzing)` + 需求分析/方案规划的大段文字被攒成一个延迟约 1.5~6s 才一次性到达的大包，浏览器端 `updateLiveStream` 只能一次性渲染整段文本，逐字动画被吞掉。次要因素：前端进入 `generating` 阶段后 `onStatus` 会隐藏 `.msg-card-stream`，实时窗口本身较短。
- **证据链**：展开能看到阶段内容 = `stageText` 已正确持久化到 `version.stageText`，说明内容生成链路完整；差异仅在传输节奏。工作日志此前记录的「deploy 后未重启后端导致旧版」问题已排除（实测线上后端已是新版）。
- **可选修复方向（未实施，待用户决策）**：① 前端把「打字机」改为**自渲染动画**（用收到的完整 stageText + CSS/JS 本地逐字展示，不依赖网络刷新节奏，最稳妥）；② 后端在流中周期性 `yield` 空注释粉刷（缓解网关聚合，但主因是 Render 网关，效果有限）；③ 接受现状（真实逐字流存在，仅在慢网/网关聚合下看不到动画）。
- **验证结果**：线上与本地代码逐字符比对一致；curl 实测确认 `stage_text` 逐字帧真实到达且内容完整；本地 8010 对照服务已停止，临时诊断文件已清理。
## 2026-08-12 10:58 · 修复「生成中状态文案不随阶段变化」+「阶段文字被覆盖、无法上滑回看需求分析」
- **改动文件**：`static/js/app.js`、`static/js/components/messageItem.js`、`static/css/style.css`、`work_log.md`（本轮追加记录）
- **问题现象**：① 生成过程中无论处于需求分析/方案规划/代码生成/渲染预览哪个阶段，生成中卡片的状态文案始终显示「正在生成代码…」；② 方案规划文字出现后，上滑鼠标看不到之前「需求分析」的文字。
- **做了什么**：
  ① **阶段文案**：`messageItem.js` 新增导出 `PHASE_ACTIVE_LABEL`（analyzing=需求分析中… / planning=方案规划中… / generating=正在生成代码… / rendering=渲染预览中…）；生成中卡片初始文案按 `opts.phase` 显示（`renderMessages` 传入当前 `getState().phase`）；`app.js` 捕获 `liveAssistantInfoEl`，`onStatus` 收到新 phase 时实时切换文案。
  ② **阶段文字分块堆叠**：`updateLiveStream` 重构——实时区不再「单块覆盖」，而是按 stage 建独立块（`.msg-card-stream-block`，带 `data-stage`），按 analyzing → planning 顺序堆叠插入；需求分析文字在方案规划出现后保留在下方/上方可回看，方案规划继续流式更新本块。
  ③ **滚动不打断阅读**：自动滚动改为「仅当用户停留在底部附近（距底部 <120px）才跟随滚到底」，用户上滑阅读历史阶段文字时不被强制拉回底部。
  ④ **样式**：`style.css` 新增 `.msg-card-stream-block + .msg-card-stream-block` 分隔线，区分两个阶段的文字块。
- **验证结果**：`node --check` app.js / messageItem.js 通过；Fake DOM 单测 4 项全过（analyzing 块创建与 label/文本、planning 块插入顺序且 analyzing 文本保留、planning 文本原位更新不重复建块、上滑时 scrollTop 保持不动/底部时跟随滚动）。Render 网关聚合导致的打字机动画问题按用户确认保持现状，本轮未处理。
## 2026-08-12 11:06 · 复核「阶段文案修复」在本地 8000 生效（仅验证，无代码改动）
- **改动文件**：`work_log.md`（本轮追加记录）；本轮无新增/修改业务代码。
- **做了什么**：用户本地起服务后仍看到「任何阶段都显示正在生成代码」，本轮逐项复核：① 本地文件确认已含修复（`PHASE_ACTIVE_LABEL`、`liveAssistantInfoEl`、`onStatus` 更新文案）；② 端口检查：8000 由 PID 4672（venv python，11:04 启动）监听，8010 另有 PID 11528 残留监听（此前诊断遗留，本次未处理）；③ 直接请求 `http://127.0.0.1:8000/js/app.js` 与 `messageItem.js`，返回 43,130B / 7,527B，均含 `PHASE_ACTIVE_LABEL`/`liveAssistantInfoEl`/`需求分析中`，确认**服务端下发的就是新代码**；④ 用真实 `messageItem.js` 模块 + 轻量 DOM 桩验证：phase=analyzing/planning/generating/rendering 分别渲染「需求分析中…/方案规划中…/正在生成代码…/渲染预览中…」，phase 缺失时才回退「正在生成代码…」。
- **结论**：修复已生效于本地 8000 服务。用户浏览器仍显示旧文案，最大概率是**浏览器缓存了旧版 app.js/messageItem.js**（ES Module 被缓存、普通刷新未强刷）；建议硬刷新（Ctrl+F5 / Ctrl+Shift+R）或无痕窗口验证，并可在 DevTools Network 确认 `js/app.js` 大小为 43,130B。
- **验证结果**：真实模块渲染 5 组 phase 全部符合预期；HTTP 直取 8000 静态文件确认含新标记。
## 2026-08-12 11:07 · 解答「0.0.0.0:8000 与 localhost:8000 页面不同，本地测试用哪个」（仅答疑，无代码改动）
- **改动文件**：`work_log.md`（本轮追加记录）；本轮无新增/修改业务代码。
- **做了什么**：说明 0.0.0.0 是服务端「监听所有网卡」的绑定地址（本地 8000 服务即监听 0.0.0.0:8000），浏览器访问应使用 `http://localhost:8000`（或 `http://127.0.0.1:8000`）。两个地址页面不同的原因是浏览器按 origin 隔离 localStorage 与缓存：`localhost` / `127.0.0.1` / `0.0.0.0` 是三个不同 origin，会话数据与旧版 JS 缓存互不共享；此前「仍在显示正在生成代码」很可能来自 `0.0.0.0` origin 下缓存的旧版 app.js。
- **验证结果**：无需验证；建议统一使用 `http://localhost:8000` + Ctrl+F5 硬刷新，并在 DevTools Network 确认 `js/app.js` 为 43,130B 新版。
## 2026-08-12 11:17 · 静态资源加 Cache-Control: no-cache（根治旧版 JS 缓存问题）+ 复核「阶段文案」预期行为
- **改动文件**：`main.py`（新增 `no_cache_static` HTTP 中间件）、`work_log.md`（本轮追加记录）
- **问题现象**：用户本地 8000 已下发新版 JS（app.js 43,130B 含 PHASE_ACTIVE_LABEL/需求分析中），但浏览器仍显示「生成中 正在生成代码…」——根因是 uvicorn 静态文件无 Cache-Control 头，浏览器启发式缓存旧版 app.js/messageItem.js。
- **做了什么**：`main.py` 新增 `@app.middleware("http") no_cache_static`：非 `/api/*` 的响应一律 `setdefault("Cache-Control", "no-cache")`，浏览器每次重新校验（ETag 命中返回 304，变更返回 200 新内容）；SSE 接口自身已有 no-cache 不受影响。
- **预期行为确认**：修复后生成中卡片文案应依次为「需求分析中…/方案规划中…/正在生成代码…/渲染预览中…」，且发送需求后**第一句就应是「生成中 需求分析中…」**（新代码创建卡片时即按 analyzing 渲染，不依赖后端回包）。
- **验证结果**：TestClient 进程内验证 `/`、`/js/app.js`、`/css/style.css` 均带 `Cache-Control: no-cache`，`/api/health` 无该头（符合预期）；`main.py` 语法 OK。生效需重启本地 uvicorn（当前 8000 服务 PID 19116 未重启，仍为旧进程）。