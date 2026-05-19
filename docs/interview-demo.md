# BananaFlow Studio — 面试演示文档

## 项目背景与业务场景

电商内容团队每天需要批量产出商品图片和短视频素材，传统流程需要设计师逐帧操作 Photoshop + 视频剪辑软件，效率低且难以规模化。

BananaFlow Studio 的目标是：**通过 AI Agent 将"创意描述 → 可用素材"的链路从数小时压缩到数分钟**。用户用自然语言描述内容需求，系统自动完成分镜规划、素材匹配、图片/视频生成，并在画布上完成组合编排。

---

## 5 分钟讲解版本

### 我在这个项目里做了什么

这是一个电商 AI 视觉内容生产工具，核心是一个多步骤 Agent pipeline。我负责了：

1. **Agent v2 架构设计**：将单一 LLM 调用改造为 coordinator → dispatcher → synthesizer 三层流水线，解决了"模型什么都想做"的问题，让不同类型请求走不同的执行路径
2. **分镜设计 Agent**：基于 LangGraph 实现分镜规划，将用户的剧情描述结构化为镜头级别的分镜脚本，支持角色/场景/音色绑定
3. **异步任务系统**：图片生成是长耗时操作（30-300秒），设计了 SQLite 任务队列 + asyncio 后台任务 + 前端轮询的模式，解决了 HTTP 超时问题
4. **关键 Bug 修复**：发现并修复了同步 I/O 在 async 事件循环中的自死锁问题，彻底解决了"任务始终超时"的线上问题

### 核心技术决策

- **为什么用 SQLite 而不是 Redis？** 这是 MVP 阶段，快速落地优先。SQLite 零依赖、运维简单，任务量不大时足够。生产化升级路线已规划（Phase 2）。
- **为什么 FastAPI 单进程？** 同上，MVP 优先。单进程 + asyncio 可以处理大量 I/O 并发，瓶颈在 AI API 的等待，不在 CPU。

---

## 15 分钟深入版本

### 系统架构

见 [architecture.md](architecture.md)。

### 核心技术挑战与解决方案

#### 挑战 1：Agent 意图路由

**问题：** 单一 LLM 调用在处理"帮我生成图片"和"给这个镜头匹配角色"时，输出格式和执行路径完全不同，用一个 prompt 兜不住。

**解决：** 引入 coordinator 层专门做意图分类（分镜规划 / 工具调用 / RAG 检索 / 通用回答），各类请求进入独立的 dispatcher 分支。coordinator 本身也是 LLM，但 prompt 极简，只做分类，不做执行。

#### 挑战 2：图片生成超时（self-deadlock）

**问题：** `{"detail":"timed out"}` 错误，所有图片生成请求都在 ~20s 后失败。

**根因：** 在 `async` 路由处理函数中同步调用了 `urllib.request.urlopen(url, timeout=20)`，而 `url` 指向的是同一台服务器。uvicorn 单进程事件循环被阻塞，无法处理内部 HTTP 请求，导致自死锁 → socket.timeout。

**修复：** 移除了 async 路由中的同步 URL 下载逻辑（这部分代码实际上从未被使用——下载的文件在后续任务执行中被跳过）。

**教训：** asyncio 单进程模型下，任何同步 I/O 都会阻塞整个事件循环。需要用 `asyncio.to_thread()` 或将 I/O 移出 async 上下文。

#### 挑战 3：任务无限重试

**问题：** 后端任务在失败后会无限重试（最多 `MAX_RETRIES` 次），但每次重试间隔和全局超时没有控制，任务可能运行 30+ 分钟。

**解决：**
- 新增 `AI_CHAT_TASK_GLOBAL_TIMEOUT_SEC`（默认 1800s）作为全局 wall-clock deadline
- 每次重试前检查全局超时和 CANCELLED 状态
- 前端 cancel 操作调用 `DELETE /api/task/{id}` 写入 CANCELLED 状态，后台任务轮询后停止

#### 挑战 4：前端轮询超时设置不合理

**问题：** 前端 `timeoutMs: 120000`（2分钟），但数据库记录显示有些任务需要 248s 才完成（含重试）。

**解决：** 将前端超时调整为 300000ms（5分钟），并在 `onTaskId` 回调中保存 `task_id`，支持前端主动取消。

### 我做过的工程取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| SQLite vs Redis | SQLite | MVP 阶段零依赖优先；已规划升级路线 |
| 单进程 vs 多进程 | 单进程 asyncio | I/O 密集型，异步足够；CPU 不是瓶颈 |
| 路由单文件（4500行） | 保持单文件 | Phase 0 不做无关重构；Phase 1 拆分有完整设计 |
| 前端单文件（19k行） | 保持单文件 | 同上 |
| 不用 Celery/arq | 自制异步任务 | MVP 避免额外依赖；功能够用 |

### 面试官可能追问与回答

**Q：为什么不用 LangChain Agent 标准框架？**
A：项目启动时评估过 LangChain，但其 Agent 执行模式不够灵活——我们需要在工具调用前后插入自定义路由逻辑（coordinator）和响应归一化（synthesizer）。用 LangGraph 实现分镜规划的有向无环图更契合需求，其他部分手写 pipeline 反而更可控。

**Q：SQLite 并发写怎么处理？**
A：当前使用 SQLite WAL 模式，多个 reader + 单 writer 不会冲突。任务队列的写操作都通过单个后台 async 任务串行执行，实际并发写非常少。生产化需要迁移到 PostgreSQL，已在 Phase 2 规划中。

**Q：/readyz 的 degraded 状态怎么用？**
A：degraded 返回 HTTP 200，K8s 就绪探针不会摘掉 Pod。degraded 只作为告警信号——比如 `jwt_secret` degraded 提示"生产环境还在用开发默认密钥"，运维看到后处理，但服务不中断。真正阻断的只有 `not_ready`（SQLite 不可写）。

**Q：ComfyUI 工作流怎么集成的？**
A：通过 ComfyUI 的 `/prompt` HTTP API 提交工作流 JSON，轮询 `/history/{prompt_id}` 获取结果。工作流模板固定存储在 `workflows/` 目录，运行时只替换参数节点的值（图片 URL、提示词等），不动工作流结构。

---

## 下一步生产化路线

见 [architecture.md](architecture.md) 中"当前架构 vs 目标架构"一节。

优先级排序：
1. **Phase 1**（路由拆分）— 最低风险，最高工程价值，可并行开发
2. **Phase 3**（安全加固）— bcrypt 密码、JWT 刷新、工具风险等级
3. **Phase 2**（Redis 任务队列）— 依赖 Phase 1 完成后更容易改
4. **Phase 4**（可观测性）— run_id 追踪、Prometheus、golden set
5. **Phase 5**（前端拆分）— Workbench.jsx 模块化
