# PicSpeak Update Log

日期：2026-04-19

## 概览

这次更新集中收口了认证链路、任务重试与前端请求稳定性，目标是让游客登录、配额检查、异步任务状态和跨域请求在异常场景下更可控，也避免把内部错误细节直接暴露给用户。

- 后端收紧了 CORS 方法与请求头白名单，并补回前端真实使用的 `X-Device-Id`
- guest cookie 的 SameSite 策略改成按环境显式配置，避免跨域策略和 Secure 组合不一致
- Clerk webhook 的重复事件与鉴权失败现在返回不同状态码，不再把真实失败误报成成功
- 激活码兑换接口新增按用户限速，异步评图的配额检查前移到 AI 调用之前
- 前端请求层补上 AbortController 取消链路，任务页与详情页的轮询/加载中断后不再继续落状态

## 认证与接口安全

- `backend/app/main.py` 不再对 CORS 使用 `*`，而是显式限制为 `GET/POST/PUT/PATCH/DELETE/OPTIONS`，并只开放站点真实依赖的请求头
- `backend/app/api/deps.py` 和 `backend/app/core/config.py` 把 guest token cookie 的 SameSite 策略改成配置驱动：
  - 开发环境固定回落到 `lax`
  - 非开发环境允许 `none`，但会自动要求 `secure`
- `backend/app/api/routers/auth.py` 修正了 Clerk webhook 的错误响应：
  - `409` 冲突视为幂等重复事件，返回 200
  - `401/403` 处理失败改为返回 400，避免被上游当成成功吞掉
- `backend/app/api/routers/billing.py` 和 `backend/app/services/guard.py` 为激活码兑换增加用户级限速，阻断高频猜码

## 任务稳定性与错误边界

- `backend/app/services/clerk_auth.py` 为 JWKS 缓存刷新加锁，避免并发请求同时击穿 Clerk 上游
- `backend/app/services/review_task_processor.py` 调整了评图任务的失败语义：
  - 领取任务时就消耗一次 attempt，避免边界条件下的无限重试
  - AI 与 worker 失败消息对外统一做脱敏，用户侧只看到可恢复的通用提示
  - 配额检查前移到 `run_ai_review()` 之前，避免无额度时仍触发模型调用
- `backend/app/api/routers/tasks.py` 和 `backend/app/api/routers/realtime.py` 统一输出脱敏后的任务错误与事件消息
- `backend/app/api/routers/review_create.py` 的同步评图失败也不再直接返回上游异常原文
- `backend/app/services/ai.py` 删除了 `run_ai_review()` 返回后的整段不可达旧实现，减少维护噪音

## 前端请求稳定性

- `frontend/src/lib/api.ts` 为通用请求层补上 `AbortSignal` 透传与 `AbortError` 识别
- GET 请求不再默认附带 `Content-Type`，减少不必要的预检请求
- `frontend/src/features/workspace/hooks/useWorkspaceUsage.ts`
- `frontend/src/features/workspace/hooks/useReplayContext.ts`
- `frontend/src/features/reviews/hooks/useReviewDetail.ts`
- `frontend/src/features/reviews/hooks/useReviewUsage.ts`
- `frontend/src/app/tasks/[taskId]/page.tsx`

上面这些调用点现在都能在组件卸载或轮询切换时正确取消请求，避免：

- 已离开页面后继续覆盖状态
- 任务页并发轮询叠加
- 被取消的请求继续打印误导性错误

## 首页更新记录同步

- 新增 `/updates` 记录数据到 `frontend/src/lib/updates-data.ts`
- 首页底部“更新记录”入口仍由 `frontend/src/app/page.tsx` 使用 `updates_hint_latest` 渲染
- 因为当前首页提示来自翻译字典而不是页面内硬编码常量，所以本次同步落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

## 影响文件

### 后端

- `backend/.env.example`
- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/api/deps.py`
- `backend/app/api/routers/auth.py`
- `backend/app/api/routers/auth_support.py`
- `backend/app/api/routers/billing.py`
- `backend/app/api/routers/tasks.py`
- `backend/app/api/routers/realtime.py`
- `backend/app/api/routers/review_create.py`
- `backend/app/services/clerk_auth.py`
- `backend/app/services/guard.py`
- `backend/app/services/review_task_processor.py`
- `backend/app/services/ai.py`

### 前端

- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/features/workspace/hooks/useWorkspaceUsage.ts`
- `frontend/src/features/workspace/hooks/useReplayContext.ts`
- `frontend/src/features/reviews/hooks/useReviewDetail.ts`
- `frontend/src/features/reviews/hooks/useReviewUsage.ts`
- `frontend/src/app/tasks/[taskId]/page.tsx`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

### 测试与文档

- `backend/tests/test_clerk_auth.py`
- `backend/tests/test_review_task_processor.py`
- `backend/tests/test_auth_transaction_helpers.py`
- `backend/tests/test_api_surface_regressions.py`
- `docs/changelog/update-log-2026-04-19-auth-hardening-and-request-stability.md`

## 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -q`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
