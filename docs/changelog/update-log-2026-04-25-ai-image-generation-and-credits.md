# PicSpeak Update Log

日期：2026-04-25

## 概览

这次更新把 PicSpeak 从“上传照片后获得点评”扩展到“先生成视觉参考，再回到摄影工作流复拍和复盘”。用户现在可以在独立 AI 创作页生成图片，也可以从点评详情里根据原图建议生成下一次拍摄参考；同时新增生图额度、额度包购买、兑换码和后台任务处理链路，保证生成结果可排队、可追踪、可下载、可复用。

- 新增 `/generate` AI 创作页，支持模板、提示词、画幅、质量和风格选择
- 点评详情页新增“参考图生成”模块，可根据原评图建议生成复拍、构图、光线或色彩参考
- 新增生成任务页、生成详情页和账户内生成历史页，覆盖排队、结果查看、下载、复制提示词、再次生成和回到工作台
- 后端新增生图任务、生成图片数据表、OpenAI 兼容生图客户端、对象存储保存、失败重试和生成额度扣减
- 计费链路新增 AI 生图额度快照、30 点兑换码、300 点额度包结账和中文一次性 Pro 购买支持
- 首页、Header、Usage、Pro 卡片、Blog、Gallery 等入口同步露出 AI 创作和生图额度信息

## AI 创作与复拍参考

- `frontend/src/app/generate/page.tsx` 提供独立 AI 创作页，用户可选择摄影灵感、社媒配图、人像头像、产品场景、空间氛围和色彩 moodboard 等模板
- 创作页会从后端拉取真实 credits table，前端不再硬编码各质量和画幅的点数
- 生成任务提交后跳转 `/generation-tasks/{taskId}` 轮询状态，成功后自动进入 `/generations/{generationId}`
- 生成详情页支持下载、复制提示词、再次生成，并可将生成图作为复拍灵感带回 `/workspace`
- `frontend/src/features/reviews/components/ReviewReferenceGenerationPanel.tsx` 接入点评详情页，让用户按复拍、构图、光线和色彩意图生成下一轮拍摄参考
- Blog、Gallery 和首页入口会带上来源参数进入 AI 创作页，便于后续分析内容入口转化

## 生图后端、额度与任务处理

- 新增 `/generations/templates`、`/generations`、`/generation-tasks/{taskId}`、`/generations/{generationId}`、`/me/generations`、下载、删除和 reuse 等 API
- `image_generation_tasks` 记录排队、运行、重试、进度、错误和来源点评；`generated_images` 记录对象存储位置、模型、质量、画幅、成本和点数
- Worker 会在处理评图任务之外并发提交生图任务，避免长时间生图请求阻塞评图主循环
- OpenAI 兼容客户端支持普通生成、参考图编辑、APIMart 任务轮询、base64 响应解析和生成图下载
- 生图点数按质量与画幅计价，参考图额外加点；成功保存后写入 `usage_ledger`，失败不扣点
- `/me/usage` 现在返回 `generation_credits`，Usage 页面展示本月总量、已用和剩余点数

## 计费、兑换码与本地化入口

- 新增 `PICSPEAKART` 兑换码，可为已登录用户发放 30 个 AI 生图点数，并防止同用户重复兑换
- 新增 300 点生图额度包 checkout API，Lemon Squeezy webhook 会按订单幂等发放点数
- 中文 Pro checkout 支持一次性 30 天 Pro 购买，通过签名 token 在 webhook 中校验并开通
- Header、MarketingHeader、首页 Pro 卡、HomeCheckoutButton、Usage 页面和 ProPromoCard 同步更新 AI 创作、额度和购买文案
- `frontend/src/lib/i18n-zh.ts`、`i18n-en.ts`、`i18n-ja.ts` 新增三语 AI 创作、生成任务、生成详情、额度包和兑换码文案

## 首页更新记录同步

- `/updates` 最新一条记录同步为本次“AI 创作、生图额度与复拍参考”更新
- 首页底部“更新记录”提示文案同步指向 AI 创作和生图额度更新
- 当前首页更新提示由 `frontend/src/app/page.tsx` 读取三语 i18n 的 `updates_hint_latest`，所以实际文案更新落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

## README 同步

- `README.md` 和 `README.zh-CN.md` 功能列表新增 AI Create、复拍参考、生成历史与 AI 生图额度
- 文档区的 Changelog 链接更新到本次 changelog
- 快速开始说明补充 OpenAI 兼容生图 API、Lemon Squeezy 和 AI 生图相关配置

## 影响文件

### 后端

- `backend/.env.example`
- `backend/app/api/router.py`
- `backend/app/api/routers/billing.py`
- `backend/app/api/routers/generations.py`
- `backend/app/core/config.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/main.py`
- `backend/app/schemas.py`
- `backend/app/services/image_generation.py`
- `backend/app/services/image_generation_pricing.py`
- `backend/app/services/image_generation_prompt.py`
- `backend/app/services/image_generation_task_processor.py`
- `backend/app/services/lemonsqueezy.py`
- `backend/app/services/lemonsqueezy_webhooks.py`
- `backend/app/services/product_analytics.py`
- `backend/app/services/worker.py`
- `create_schema.sql`

### 前端

- `frontend/next.config.js`
- `frontend/src/app/generate/page.tsx`
- `frontend/src/app/generation-tasks/[taskId]/page.tsx`
- `frontend/src/app/generations/[generationId]/page.tsx`
- `frontend/src/app/account/generations/page.tsx`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/tasks/[taskId]/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/components/home/HomeCheckoutButton.tsx`
- `frontend/src/components/home/HomeImageCreditRedeem.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/MarketingHeader.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/features/generations/generation-config.ts`
- `frontend/src/features/generations/generation-contracts.test.ts`
- `frontend/src/features/reviews/components/ReviewReferenceGenerationPanel.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/external-checkout-window.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/llms.ts`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/lib/product-analytics.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/updates-data.ts`

### 测试与文档

- `backend/tests/test_api_surface_regressions.py`
- `backend/tests/test_billing_portal_selection.py`
- `backend/tests/test_image_generation_pricing.py`
- `backend/tests/test_image_generation_prompt.py`
- `backend/tests/test_image_generation_routes.py`
- `backend/tests/test_image_generation_service.py`
- `backend/tests/test_image_generation_task_processor.py`
- `backend/tests/test_lemonsqueezy_credit_pack_webhooks.py`
- `backend/tests/test_product_analytics_service.py`
- `backend/tests/test_settings_defaults.py`
- `docs/changelog/update-log-2026-04-25-ai-image-generation-and-credits.md`
- `README.md`
- `README.zh-CN.md`

## 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_image_generation_*.py"`
- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_lemonsqueezy_credit_pack_webhooks backend.tests.test_billing_portal_selection backend.tests.test_settings_defaults backend.tests.test_product_analytics_service backend.tests.test_api_surface_regressions`
- `cd frontend && node --test src/features/generations/generation-contracts.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
