# PicSpeak Changelog

本文件汇总了原 `docs/changelog/update-log-*.md` 的全部更新记录。新增 release 请追加到顶部，并为每条记录保留稳定锚点，供 `/updates` 的 `docPath` 和 README 链接定位。

<a id="2026-05-06-ai-create-checkout-analytics"></a>

## 2026-05-06 - ai create checkout analytics

日期：2026-05-06

### 概览

这次更新把 AI Create 的“案例发现 -> 一键套用 -> 生成 -> 额度承接 -> 复盘分析”链路接得更紧：用户从提示词库进入生成页时会自动带入案例 prompt 和推荐参数，额度不足时可以就地购买 credit pack 或对比 Pro，支付成功后也能回到刚才的任务或页面；运营侧则能拆出 Prompt Library 案例应用、复用生成、credits 耗尽承接和单位经济模型。

- Prompt Library 首页和案例详情页现在会带 `source`、`entrypoint` 与 `prompt_example_id` 跳转到 `/generate`，生成页会自动应用对应案例、模板、风格和尺寸
- AI Create 请求、任务 payload 和生成记录 metadata 会保留 `prompt_example_id` 与 `prompt_example_category`，便于追踪案例应用后的生成表现
- 生成页、生成任务失败页和点评详情里的参考图生成面板增加 credits 耗尽后的 credit pack checkout 入口，并记录 checkout 来源
- Pro checkout 与 credit pack checkout 会记住当前相对路径，支付成功页新增“回到刚才的位置”入口，减少购买后丢失上下文
- 产品分析新增 AI Create 入口拆分、Prompt example 应用漏斗、credit exhausted 承接、生成复用事件和 AI Create 单位经济模型

### AI Create 案例带入

- `/generate/prompts` 的主 CTA 会带 `source=prompt_library` 与 `entrypoint=prompt_library_home`
- `/generate/prompts/[id]` 的主 CTA 会携带对应 `prompt_example_id`，进入 `/generate` 后自动填入本地化 prompt、推荐 template、style 和 size
- 用户手动套用案例或通过 URL 预填案例时，前端统一记录 `generation_prompt_example_applied`，并附带案例分类、模板、触发方式和来源
- 切换模板时会清空已应用案例状态，避免用户改成普通模板后仍被误计为案例生成
- 发起生成和 credits 耗尽埋点会携带案例、模板、质量、尺寸和来源上下文

### 额度耗尽与 checkout 回流

- 生成页在 credits 耗尽时保留 credit pack CTA，并为 Free 用户补充 Pro 对比入口；质量门槛点击也会记录 `generation_upgrade_clicked`
- `/generation-tasks/[taskId]` 在 `IMAGE_GENERATION_CREDITS_EXHAUSTED` 失败状态下显示 credit pack checkout，用户无需回到额度页再补购
- `ReviewReferenceGenerationPanel` 捕获参考图生成里的额度耗尽错误，展示 credit pack checkout，并记录来自点评详情的承接来源
- `checkout-return` helper 用 sessionStorage 保存安全的相对返回路径，Pro checkout 和 credit pack checkout 都会在跳转前记录当前位置
- `/payment-success` 会消费返回路径并显示返回按钮；存在返回路径时，额度页入口降级为次要按钮

### 产品分析与单位经济模型

- 后端事件目录新增 `generation_prompt_example_applied` 和 `generation_reuse_clicked`，AI Create funnel 覆盖案例应用、结果复用、credit pack checkout 和 Pro 点击
- generation worker 在任务成功时记录 `generation_succeeded`，包含生成 ID、credits、成本、质量、尺寸、模板、案例和来源点评；失败时记录 `generation_failed` 与 failure stage
- LemonSqueezy credit pack 支付成功事件增加 `revenue_usd`，用于周报里的 revenue proxy
- `build_stage_a_snapshot()` 新增 `generation_unit_economics`，按质量/尺寸汇总成功生图、credits、成本、credit pack 订单、revenue proxy 和 gross margin proxy
- markdown 周报新增 AI Create 入口拆分、Prompt example 应用漏斗、Credit exhausted 承接和 AI Create 单位经济模型表格
- 产品分析测试覆盖新增事件目录、Prompt Library 应用、credit pack 承接、单位经济模型和 markdown 输出章节

### 首页更新记录同步

- `/updates` 三语 JSON 新增本次更新记录，并指向本 changelog
- 首页底部“更新记录”入口三语 hint 改为 AI Create 案例、checkout 回流与分析更新主题
- README 与中文 README 的最新 changelog 链接更新到本次锚点
- CLAUDE 项目说明保留 changelog、`/updates` docPath 和外部 Update Logs 镜像同步要求

### 影响文件

#### 后端

- `backend/app/api/routers/generations.py`
- `backend/app/schemas.py`
- `backend/app/services/image_generation_task_processor.py`
- `backend/app/services/lemonsqueezy_webhooks.py`
- `backend/app/services/product_analytics.py`
- `backend/tests/test_product_analytics_service.py`

#### 前端

- `frontend/src/app/generate/page.tsx`
- `frontend/src/app/generate/prompts/PromptLibraryContent.tsx`
- `frontend/src/app/generate/prompts/[id]/PromptExampleContent.tsx`
- `frontend/src/app/generation-tasks/[taskId]/page.tsx`
- `frontend/src/app/generations/[generationId]/page.tsx`
- `frontend/src/app/payment-success/page.tsx`
- `frontend/src/features/reviews/components/ReviewReferenceGenerationPanel.tsx`
- `frontend/src/lib/checkout-return.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/lib/product-analytics.ts`
- `frontend/src/lib/types.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-05-06-ai-create-checkout-analytics`
- `docs/changelog/CHANGELOG_WORKFLOW.md`
- `CLAUDE.md`
- `README.md`
- `README.zh-CN.md`

### 验证

- `node -e "for (const f of ['zh','en','ja']) JSON.parse(require('fs').readFileSync(`frontend/src/content/updates/${f}.json`, 'utf8'));"`
- `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_product_analytics_service.py`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `Get-FileHash` 对比仓库 changelog / workflow 与外部 Update Logs 副本 SHA256 一致

---

<a id="2026-05-04-analytics-retake-waiting-reader"></a>

## 2026-05-04 - analytics retake waiting reader

日期：2026-05-04

### 概览

这次更新把 PicSpeak 的“拍后反馈 -> 下一轮行动 -> 数据复盘”链路补得更完整：用户在点评结果里可以把具体改进动作带回工作台，等待 AI 点评或 AI 生图时可以直接在右侧窗口阅读全文；运营侧则能在产品分析周报里看到 AI Create、Prompt Library、复拍贡献、locale 和数据健康拆分。

- 评图和生图任务等待页新增右侧 Blog 阅读窗口，窗口内可切换推荐文章并阅读全文，不再需要跳转离开等待页
- 点评详情页的下一轮拍摄清单现在会识别构图、光线、色彩、感染力或技术维度，并把选中的动作带回工作台
- 工作台支持携带来源点评、复拍意图、下一轮动作、维度和来源生成图信息，后续评图事件会写入这些上下文
- 评图历史页新增“下一轮练习”主题，Free 使用最近窗口，Pro 使用已加载的长周期记录
- 产品分析后端新增 AI Create 漏斗、Prompt Library 来源、复拍贡献、locale 拆分和数据健康检查，并提供产品经营周报导出脚本

### 等待页内嵌阅读

- 新增 `WaitingBlogWindow` 组件，复用现有三语 Blog bundle，在任务等待侧栏中渲染文章切换按钮、文章 intro、核心结论、章节正文和 bullet 列表
- `/tasks/[taskId]` 和 `/generation-tasks/[taskId]` 在非失败、无错误的等待状态下使用双栏布局：左侧保留原有进度和等待提示，右侧显示内嵌阅读器
- 等待阅读窗口针对评图与生图分别挑选不同文章主题，让评图等待更偏构图/光线/色彩检查，让生图等待更偏复拍计划和 prompt 方向整理
- 补充中英日等待阅读文案，并移除跳转式“打开文章 / 查看全部”交互，避免用户等待过程中离开任务页

### 复拍与成长闭环

- `buildNextShootChecklist()` 会为每条建议推断关联维度，优先从建议文本里的关键词识别，无法识别时回落到当前评分最低的维度
- 点评详情的成长面板新增“带到工作台”按钮；点击后会携带来源点评、复拍意图、动作文本和维度进入 `/workspace`
- “上传新照片再评一次”会默认带入第一条下一轮动作，并记录 `next_shoot_action_clicked` 事件，区分 checklist 触发和新照片面板触发
- 工作台新增复拍目标提示卡，展示来源点评、重点维度和本轮要验证的动作；发起评图时同步写入来源点评、复拍意图、动作、维度和来源生成图上下文
- 同图重跑会标记为 `same_photo_fix`，新照片复拍会标记为 `new_photo_retake`，便于后端周报区分复拍贡献
- 点评详情页在存在 `source_review_id` 时显示来源点评上下文，并提供回到来源点评的对照入口
- 评图历史页新增下一轮练习主题：根据趋势决定 recover / stabilize / extend，并在没有反复低于 7 分的弱项时使用平均最低维度作为练习候选

### 产品分析与周报

- 产品分析事件目录新增 `prompt_library_viewed` 与 `next_shoot_action_clicked`，并把 `prompt_library` 纳入来源归因和内容转化周报
- `build_stage_a_snapshot()` 现在输出 AI Create 漏斗、locale 拆分、复拍贡献和数据健康检查，markdown 渲染同步增加对应章节
- AI Create 漏斗覆盖 page view、Prompt Library、模板选择、prompt 打开、生成请求、成功、失败、下载、复拍使用、额度耗尽和 credit pack checkout
- 复拍贡献拆分会统计整体评图、复拍/再分析评图、生成图用于复拍，以及 same-photo fix / new-photo retake 的下一轮动作点击
- locale 拆分按 zh / en / ja / unknown 统计活跃用户、工作台进入、评图、生图和 checkout
- 新增 `backend/scripts/export_product_analytics_weekly_report.py`，用于从数据库导出产品经营周报；数据库不可用时会生成带说明的空窗口回退报告

### 首页更新记录同步

- `/updates` 三语 JSON 新增本次更新记录，并指向本 changelog
- 首页底部“更新记录”入口三语 hint 改为产品分析、复拍练习和等待阅读窗口主题
- README 与 Claude 项目说明同步补充本次新增的产品经营周报脚本、复拍目标回流、等待页内嵌阅读和最新 changelog 链接

### 影响文件

#### 后端

- `backend/app/services/product_analytics.py`
- `backend/scripts/export_product_analytics_weekly_report.py`
- `backend/tests/test_product_analytics_service.py`

#### 前端

- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/generation-tasks/[taskId]/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/tasks/[taskId]/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/components/blog/WaitingBlogWindow.tsx`
- `frontend/src/features/reviews/components/ReviewGrowthLoopPanel.tsx`
- `frontend/src/features/reviews/hooks/useReviewActions.ts`
- `frontend/src/features/workspace/components/ModePicker.tsx`
- `frontend/src/features/workspace/components/ReplayBanner.tsx`
- `frontend/src/features/workspace/hooks/useReplayContext.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/product-analytics.ts`
- `frontend/src/lib/review-growth.ts`
- `frontend/src/lib/types.ts`

#### 测试与文档

- `frontend/test/review-growth.test.ts`
- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `docs/changelog/CHANGELOG.md#2026-05-04-analytics-retake-waiting-reader`
- `CLAUDE.md`
- `README.md`
- `README.zh-CN.md`

### 验证

- `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_product_analytics_service.py`
- `cd frontend && node --test .\test\*.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `Get-FileHash` 对比仓库 changelog 与外部归档副本 SHA256 一致

---

<a id="2026-05-01-seo-og-gallery-prompt-library"></a>

## 2026-05-01 - seo og gallery prompt library

日期：2026-05-01

### 概览

这次更新围绕 PicSpeak 的公开内容可索引性和 AI 搜索可见性展开：在完成全量 SEO / GEO 审计后，把 AI 摄影点评、AI Create 生图和公开长廊三条产品线统一到 metadata、sitemap、llms.txt、结构化数据和站内更新入口中。

- 新增真实产品 Open Graph 图，尺寸为 `1200x630`，同时呈现 AI critique、AI Create 和 gallery example
- `/gallery` 从纯客户端页面改为服务端可见的公开摘要加客户端长廊交互，降低抓取器只看到空壳的风险
- 新增 `/generate/prompts` 和 30 个静态提示词案例页，承接 “GPT Image 2 prompt examples” 等长尾搜索意图
- 修正多语言 locale 初始化、语言切换、hreflang、sitemap 和私有生成页 noindex 边界
- 补齐 SEO / i18n / prompt library 回归测试，并修复 Node 测试里的 TypeScript 扩展名解析问题

### SEO / GEO 与索引边界

- 新增 `docs/seo/seo-audit-2026-05-01.md`，记录技术 SEO、多语言 hreflang、结构化数据、AI 可引用性和索引策略的全量审计结果
- `siteConfig` 的站点标题、描述、关键词和 OG 配置扩展到“AI 摄影点评 + GPT Image 2 视觉参考生成”双产品面
- `frontend/public/og-product.png` 替换原先只偏 logo 的社交预览资产，明确覆盖点评、生图和长廊示例
- `/generate` 新增独立 metadata、Open Graph、Twitter card 和 `SoftwareApplication` JSON-LD
- `/generation-tasks/[taskId]` 与 `/generations/[generationId]` 新增 noindex layout，避免任务流和登录态结果页被误索引
- `robots.ts`、`sitemap.ts`、`llms.ts` 与 `frontend/public/llms.txt` 同步更新，明确公开入口、AI crawler 访问策略、价格口径和引用说明
- sitemap 覆盖 `/generate`、`/generate/prompts`、30 个提示词详情页、根博客 canonical 和公开功能页 canonical，同时修正非等价页面错误 hreflang

### Gallery 服务端首屏摘要

- `/gallery` 改为服务端页面包装，先输出 `CollectionPage` JSON-LD 和静态 SEO hero，再挂载原有客户端长廊功能
- 新增 `GallerySeoHero` 和三语 `gallery-seo-copy`，让首屏在数据接口加载前也能提供可读的点评案例摘要
- Gallery metadata 改为单页 canonical / x-default，避免把混合语言公共页误标成 `/zh`、`/en`、`/ja` 的等价页面
- 静态摘要文案覆盖五维评分卡、长廊到练习闭环、摄影学习档案，并保留进入点评和提示词案例页的入口

### AI Create Prompt Library

- 新增 `/generate/prompts` 可索引提示词库首页，按 photography、portrait、poster、product、ui、experimental 等分类输出静态案例卡
- 新增 `/generate/prompts/[id]` 静态详情页，30 个 GPT Image 2 案例都带独立 metadata、canonical、示例图、来源署名、完整 prompt 和 `CreativeWork` JSON-LD
- AI Create 页面里的示例库卡片增加 crawlable 详情页入口，用户仍可在产品内继续套用案例生成
- `prompt-examples.ts` 新增本地化标题、分类标签、摘要截断和案例读取 helper，保护中英日可见标题不再出现编码异常

### 多语言与运行时一致性

- locale 逻辑统一支持 `zh`、`en`、`ja`，并通过 `picspeak-locale` cookie 与请求头把用户语言偏好传给服务端首屏
- `AppProviders` 支持接收服务端初始 locale 与翻译包，根 layout 按请求语言设置 `html lang`
- Header 语言切换在非 locale 路由上也会刷新页面，确保 `/gallery`、`/generate/prompts` 这类单 URL 页面立即显示目标语言
- 修复内容转换、Pro 转化和多语言测试依赖的 `.ts` extensionless import，避免全量 Node 测试在 ESM 解析阶段失败

### 首页更新记录同步

- `/updates` 三语 JSON 已新增本次更新记录，并指向本 changelog
- 首页底部“更新记录”入口三语 hint 已从运行时迁移更新切换到本次 SEO、OG、长廊和提示词库主题
- README 与 Claude 项目说明同步补充 AI Create prompt library、公开 SEO/GEO 入口和最新 changelog 链接

### 影响文件

#### 前端

- `frontend/public/og-product.png`
- `frontend/public/llms.txt`
- `frontend/scripts/generate-og-product.ps1`
- `frontend/src/app/generate/layout.tsx`
- `frontend/src/app/generate/prompts/page.tsx`
- `frontend/src/app/generate/prompts/[id]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/gallery/layout.tsx`
- `frontend/src/app/generation-tasks/[taskId]/layout.tsx`
- `frontend/src/app/generations/[generationId]/layout.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/robots.ts`
- `frontend/src/app/sitemap.ts`
- `frontend/src/components/gallery/GallerySeoHero.tsx`
- `frontend/src/components/home/HomePageClient.tsx`
- `frontend/src/components/layout/HeaderControls.tsx`
- `frontend/src/components/providers/AppProviders.tsx`
- `frontend/src/content/generation/prompt-examples.ts`
- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `frontend/src/features/generations/components/PromptExampleGallery.tsx`
- `frontend/src/lib/gallery-seo-copy.ts`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/llms.ts`
- `frontend/src/lib/locale.ts`
- `frontend/src/lib/seo.ts`
- `frontend/src/lib/site.ts`
- `frontend/src/proxy.ts`

#### 测试

- `frontend/test/gallery-seo-copy.test.ts`
- `frontend/test/generation-prompt-examples.test.ts`
- `frontend/test/seo-alternates.test.ts`
- `frontend/test/seo-assets.test.ts`
- `frontend/tsconfig.json`
- `frontend/tsconfig.typecheck.json`

#### 文档

- `docs/seo/seo-audit-2026-05-01.md`
- `docs/changelog/CHANGELOG.md#2026-05-01-seo-og-gallery-prompt-library`
- `CLAUDE.md`
- `README.md`
- `README.zh-CN.md`

### 验证

- `cd frontend && node --test "test/*.test.ts" "src/features/generations/*.test.ts"`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd backend && ..\.venv\Scripts\python.exe -m pytest`
- 本地 HTML 抽查：设置 `picspeak-locale=zh` 后，`/gallery` 首屏包含中文静态摘要，`/generate/prompts` 包含中文 GPT Image 2 提示词案例标题
- `Get-FileHash` 对比仓库 changelog 与外部归档副本 SHA256 一致

---

<a id="2026-04-28-runtime-migrations-and-stability"></a>

## 2026-04-28 - runtime migrations and stability

日期：2026-04-28

### 概览

这次更新把运行时数据库维护从散落的手写建表/补列逻辑收拢到 Alembic 迁移，并补上认证、游客创建、审计日志、AI 生图下载、公开长廊推荐和前端本地化默认值上的稳定性修正。用户可感知到的结果是博客阅读数、公开长廊推荐、AI 生图历史/下载、首页语言和演示点评文案更稳定；部署侧则获得可重复执行的 schema 迁移和更明确的连接池配置。

- 后端运行时 schema 改由 Alembic baseline 与增量迁移管理，`ensure_runtime_schema()` 会升级到 head
- 游客创建、登录时间刷新、请求审计、转发 IP、Cloud Tasks secret 和 JWT 解析补上低风险加固
- 博客阅读数、公开长廊推荐、图片生成分页/下载、评图详情查询和重复上传判断改为更稳定的实现
- 前端 API base、WebSocket、OAuth、下载链接统一构造，生产环境缺少 API 地址会在构建期暴露
- 首页语言默认、`html lang`、三语演示点评和图片处理工具补齐回归保护

### 数据库迁移与运行时基础设施

- 新增 `backend/alembic.ini`、`backend/alembic/env.py` 和两份 `20260428` 迁移，建立当前运行时 schema baseline，并单独补上公开长廊与用量流水的低风险索引
- `backend/app/db/bootstrap.py` 不再维护一长串手写 DDL，而是通过 Alembic `upgrade head` 完成 runtime schema 检查
- `backend/app/db/models.py` 同步补齐 gallery 推荐索引、usage ledger 索引、`updated_at` 的 `onupdate` 行为，并把 Numeric 字段类型标注调整为 `Decimal`
- `backend/app/db/session.py` 增加非 SQLite 连接池参数，`backend/app/core/config.py` 提供 pool size、overflow、recycle 配置项
- `README.md` 与 `README.zh-CN.md` 从手动执行 `create_schema.sql` 改为安装依赖后运行 `python scripts/ensure_runtime_schema.py` 或 `alembic upgrade head`

### API 稳定性与安全

- 游客 token TTL 调整为 14 天，游客创建新增独立分钟级限速，登录时间刷新增加 5 分钟间隔，减少依赖阶段的重复写入
- 请求中的当前用户 public id 统一通过 `backend/app/api/request_state.py` 读写，错误日志、审计日志、Clerk/Lemon Squeezy webhook 都复用同一入口
- 审计日志的 fire-and-forget 写入现在会登记任务并在应用关闭时等待或取消，避免后台任务静默遗留
- `X-Forwarded-For` 只接受合法首个 IP，Cloud Tasks secret 使用 `secrets.compare_digest`，JWT 分段解析不再被额外分隔符误判为 malformed
- 博客阅读数改为 PostgreSQL upsert，公开长廊推荐百分位改为数据库窗口函数，图片生成历史游标改为 `created_at|id` 稳定游标并兼容旧 public id 游标
- AI 生图下载会校验对象 `ContentLength`，超出配置上限或大小未知时返回明确错误，同时响应带回 `Content-Length`
- 评图详情和公开分享查询合并照片与用户 join，上传重复检测只复用 READY 照片，避免被 REJECTED 记录挡住重新上传

### 前端语言、入口与图片处理

- `frontend/src/lib/api.ts` 统一构造 API、下载、WebSocket 和 Google OAuth 地址，支持 `NEXT_PUBLIC_API_URL` 已带 `/api` 或 `/api/v1` 的部署形态
- `frontend/src/proxy.ts` 按 URL 语言段写入 `x-picspeak-locale`，`frontend/src/app/layout.tsx` 用该值设置 `html lang`
- i18n 默认语言改为英文，路径语言优先于本地偏好，并通过 `picspeak-locale-sync` 事件同步未固定语言路由
- 新增 `frontend/src/lib/locale.ts` 统一 locale normalize 逻辑，`content-conversion` 与 `pro-conversion` 不再各自维护一份
- 首页演示图支持 `NEXT_PUBLIC_DEMO_IMAGE_URL` 覆盖，中文/日文演示点评文案补齐并修复日文乱码式措辞
- 新增 `frontend/src/lib/canvas.ts` 复用 canvas blob 转换；压缩流程限制 resize pass，EXIF 扫描上限提升到 1 MB，缩略图缓存失败会输出可诊断 warning
- Pro checkout 遇到已开通状态会直接转到账户用量页，主题切换和 outside-click hook 也收紧 hydration 与闭包行为

### 首页更新记录同步

- `/updates` 最新条目已写入 `frontend/src/content/updates/zh.json`、`frontend/src/content/updates/en.json` 和 `frontend/src/content/updates/ja.json`
- 首页底部“更新记录”提示已通过 `frontend/src/lib/i18n-zh.ts`、`frontend/src/lib/i18n-en.ts` 和 `frontend/src/lib/i18n-ja.ts` 指向本次“运行时迁移与稳定性”主题
- 本次更新文档路径为 `docs/changelog/CHANGELOG.md#2026-04-28-runtime-migrations-and-stability`

### 影响文件

#### 后端

- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/versions/20260428_0001_baseline_runtime_schema.py`
- `backend/alembic/versions/20260428_0002_low_risk_indexes.py`
- `backend/app/api/deps.py`
- `backend/app/api/request_state.py`
- `backend/app/api/routers/auth.py`
- `backend/app/api/routers/auth_support.py`
- `backend/app/api/routers/billing.py`
- `backend/app/api/routers/blog.py`
- `backend/app/api/routers/gallery_support.py`
- `backend/app/api/routers/generations.py`
- `backend/app/api/routers/review_queries.py`
- `backend/app/api/routers/tasks.py`
- `backend/app/api/routers/uploads.py`
- `backend/app/api/routers/webhooks.py`
- `backend/app/core/config.py`
- `backend/app/core/network.py`
- `backend/app/core/security.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/db/session.py`
- `backend/app/main.py`
- `backend/app/services/guard.py`
- `backend/requirements.txt`
- `create_schema.sql`

#### 前端

- `frontend/.env.local.example`
- `frontend/src/app/layout.tsx`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `frontend/src/content/updates/zh.json`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/auth-context.tsx`
- `frontend/src/lib/canvas.ts`
- `frontend/src/lib/compress.ts`
- `frontend/src/lib/content-conversion.ts`
- `frontend/src/lib/demo-review.ts`
- `frontend/src/lib/exif.ts`
- `frontend/src/lib/hooks/useOnClickOutside.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-initial.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/locale.ts`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/lib/pro-conversion.ts`
- `frontend/src/lib/review-thumbnail-cache.ts`
- `frontend/src/lib/theme-context.tsx`
- `frontend/src/proxy.ts`

#### 测试与文档

- `backend/tests/test_alembic_bootstrap.py`
- `backend/tests/test_api_surface_regressions.py`
- `backend/tests/test_auth_transaction_helpers.py`
- `backend/tests/test_blog_post_views.py`
- `backend/tests/test_image_generation_routes.py`
- `backend/tests/test_low_risk_regressions.py`
- `backend/tests/test_public_gallery_route.py`
- `frontend/test/demo-review.test.ts`
- `frontend/test/locale-default.test.ts`
- `README.md`
- `README.zh-CN.md`
- `docs/changelog/CHANGELOG.md#2026-04-28-runtime-migrations-and-stability`

### 验证

- `cd backend && ..\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`
- `cd frontend && npm exec -- tsx --test test/demo-review.test.ts test/locale-default.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

---

<a id="2026-04-27-gpt-image2-prompt-gallery"></a>

## 2026-04-27 - gpt image2 prompt gallery

日期：2026-04-27

### 概览

这次更新把 GPT-Image-2 的精选 prompt 案例接入到 AI 创作页，让用户可以先浏览带示例图的高质量结构，再一键填入生成表单继续微调。案例内容保持来源仓库原文，不额外改写 prompt，并把作者、来源链接、多语言标题和静态示例图一起纳入产品内置库。

- `/generate` 新增「精选 GPT-Image-2 提示词」子版块，覆盖摄影、人像、海报、产品商业、UI 信息图和实验视觉方向
- 主 prompt 输入框下方先展示质量、比例、风格和负面提示词控制，再展示精选案例库，生成参数与案例浏览的顺序更贴近实际操作
- 案例支持分类筛选、查看来源、复制 prompt 和一键填入当前生成表单
- prompt、标题和来源信息集中维护在结构化数据文件中，示例图复制到 `public` 静态目录并补充 NOTICE
- 新增测试覆盖案例数量、图片资源、模板 key、画幅、来源链接和基础内容完整性

### AI 创作提示词库

- 新增 `PromptExampleGallery` 组件，在 AI 创作页内展示 30 个精选 GPT-Image-2 案例
- 案例卡片包含示例图、分类、标题、作者、原始来源入口、prompt 摘要、复制按钮和「使用提示词」按钮
- 使用案例时会填入当前 locale 对应的 prompt，同时同步推荐模板、风格和画幅，不改变后端生图任务流程
- 为避免模板切换覆盖案例 prompt，生成页增加一次性跳过模板 prompt 同步的保护逻辑

### 内容来源与多语言

- 新增 `frontend/src/content/generation/prompt-examples.ts`，集中维护案例 ID、分类、作者、来源链接、静态图路径、三语标题、三语 prompt、推荐模板、风格和画幅
- prompt 文本按来源仓库原文保留，不做产品侧改写；中文和日文 README 中原本为英文的 prompt 也继续保留英文原文
- 示例图复制到 `frontend/public/generation-prompt-examples/`，前端通过 `/generation-prompt-examples/...jpg` 访问
- 新增 `NOTICE.md` 说明案例与图片来源于 `EvoLinkAI/awesome-gpt-image-2-prompts`，并保留 Apache-2.0 许可说明
- 三语界面文案补齐提示词库标题、分类、复制、来源和使用按钮文案

### 首页更新记录同步

- `/updates` 数据已在 `frontend/src/content/updates/zh.json`、`frontend/src/content/updates/en.json`、`frontend/src/content/updates/ja.json` 的首位新增本次更新
- 首页底部「更新记录」入口的三语 hint 已同步指向本次「精选 GPT-Image-2 提示词库」更新
- 当前仓库的 updates 数据实际由 JSON bundle 驱动，`frontend/src/lib/updates-data.ts` 只负责加载这些 bundle，因此本次同步点落在 `frontend/src/content/updates/*.json`

### 影响文件

#### 前端

- `frontend/src/app/generate/page.tsx`
- `frontend/src/features/generations/components/PromptExampleGallery.tsx`
- `frontend/src/content/generation/prompt-examples.ts`
- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/public/generation-prompt-examples/`

#### 测试

- `frontend/test/generation-prompt-examples.test.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-27-gpt-image2-prompt-gallery`

### 验证

- `cd frontend && node --test test/generation-prompt-examples.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

---

<a id="2026-04-26-content-bundles-and-home-ssr"></a>

## 2026-04-26 - content bundles and home ssr

日期：2026-04-26

### 概览

这次更新把首页、博客、更新记录和评图说明从“大文件内联内容”整理成更容易维护的数据与组件边界，同时让首页在根路由和多语言路由下都能带着初始翻译内容渲染。后端同步收紧 AI 评图 prompt 模块与生图任务状态读取，避免只读查询触发事务提交。

- 首页主体从 `app/page.tsx` 抽成 `HomePageClient`，根路由默认带英文初始翻译，多语言首页带对应语种初始翻译
- Blog、Updates 和评图维度说明迁入 `src/content` JSON bundle，页面读取逻辑保持原有公开内容但更容易校验
- Header 和 MarketingHeader 复用统一的右侧控制区，语言、主题、登录态与快捷入口逻辑集中维护
- 应用 Provider 增加错误边界，认证 ready 等待从轮询改为 waiter 集合，减少页面挂起时的无效轮询
- 后端 AI prompt 抽到 `ai_prompts.py`，生成任务状态读取不再 commit，新建 pending 生图任务以 `next_attempt_at = null` 立即等待认领

### 首页与多语言渲染

- `frontend/src/app/page.tsx` 现在只负责根路由包装，使用 `I18nProvider defaultLocale="en"` 和 `getInitialTranslations('en')` 提供首屏英文内容
- `frontend/src/app/[locale]/page.tsx` 改为 async page，读取路由参数后传入对应语种的 `initialMessages`
- 首页实际 UI、结构化数据、FAQ、创作入口、额度区、联系方式与更新记录入口迁入 `frontend/src/components/home/HomePageClient.tsx`
- 首页底部仍保留 Blog 与 Updates 两个入口，Updates 的最新提示通过三语 `updates_hint_latest` 文案同步到本次主题

### 内容 bundle 与 SEO 数据

- `frontend/src/lib/blog-data.ts` 从 `frontend/src/content/blog/{zh,en,ja}.json` 读取 Blog UI 与文章正文，避免 1300 行内联内容堆在代码文件里
- `frontend/src/lib/updates-data.ts` 从 `frontend/src/content/updates/{zh,en,ja}.json` 读取更新记录，并返回 entry / section / items 的拷贝，避免调用方误改共享数据
- `frontend/src/lib/review-page-copy.ts` 将题材维度说明迁到 `frontend/src/content/review/dim-descriptions.json`
- Blog 文章页的 JSON-LD 补充 `abstract`、真实 `inLanguage`、OG image、免费访问标记和关键词 `about` 结构
- Sitemap 生成 Blog URL 时按各 locale 分别读取文章列表，避免只用英文 slug 数据推导全部语言

### 导航、容错与认证稳定性

- `frontend/src/components/layout/HeaderControls.tsx` 集中承载语言切换、主题切换、快捷菜单、登录/注册、用户菜单和 legacy logout
- `Header.tsx` 与 `MarketingHeader.tsx` 复用 `HeaderRightControls`，减少两套 header 的重复逻辑
- MarketingHeader 的桌面与移动导航把原 affiliate 入口替换为 Usage / Quota，方便用户直接查看额度
- `AppProviders` 外层加入 `AppErrorBoundary`，出现客户端渲染错误时展示三语重试界面，而不是让整页静默崩掉
- `auth-context` 的 `waitForReady` 改为注册一次性 waiter，并保留 10 秒兜底 timeout，替代 25ms interval 轮询

### 后端 AI 与生图任务

- `backend/app/services/ai.py` 保留请求、评分和响应处理逻辑，prompt 常量与构造函数迁入 `backend/app/services/ai_prompts.py`
- `GET /generation-tasks/{task_id}` 查询状态时移除多余 `db.commit()`，只读接口不会再提交当前 session
- `make_generation_task` 创建 pending 任务时将 `next_attempt_at` 设为 `None`，与 claim 逻辑的 immediate claim 语义对齐
- 后端测试补上“读取任务状态不 commit”和“新建任务 next_attempt_at 为空”的回归用例

### 首页更新记录同步

- `/updates` 最新一条记录已同步到本次“内容 bundle、首页 SSR 翻译与任务稳定性”更新
- 首页底部“更新记录”提示文案已改为指向本次内容架构与首页渲染更新

### 影响文件

#### 后端

- `backend/app/api/routers/generations.py`
- `backend/app/db/session.py`
- `backend/app/services/ai.py`
- `backend/app/services/ai_prompts.py`
- `backend/app/services/image_generation_task_processor.py`
- `backend/tests/test_image_generation_routes.py`
- `backend/tests/test_image_generation_task_processor.py`

#### 前端

- `frontend/src/app/page.tsx`
- `frontend/src/app/[locale]/page.tsx`
- `frontend/src/app/[locale]/blog/[slug]/BlogPostClient.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/components/home/HomePageClient.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/HeaderControls.tsx`
- `frontend/src/components/layout/MarketingHeader.tsx`
- `frontend/src/components/providers/AppErrorBoundary.tsx`
- `frontend/src/components/providers/AppProviders.tsx`
- `frontend/src/lib/auth-context.tsx`
- `frontend/src/lib/blog-data.ts`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/i18n-initial.ts`
- `frontend/src/lib/review-page-copy.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/content/blog/en.json`
- `frontend/src/content/blog/ja.json`
- `frontend/src/content/blog/zh.json`
- `frontend/src/content/review/dim-descriptions.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `frontend/src/content/updates/zh.json`
- `frontend/test/blog-content.test.ts`
- `frontend/test/content-bundles.test.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-26-content-bundles-and-home-ssr`

### 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_image_generation_*.py"`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

<a id="2026-04-25-ai-image-generation-and-credits"></a>

## 2026-04-25 - ai image generation and credits

日期：2026-04-25

### 概览

这次更新把 PicSpeak 从“上传照片后获得点评”扩展到“先生成视觉参考，再回到摄影工作流复拍和复盘”。用户现在可以在独立 AI 创作页生成图片，也可以从点评详情里根据原图建议生成下一次拍摄参考；同时新增生图额度、额度包购买、兑换码和后台任务处理链路，保证生成结果可排队、可追踪、可下载、可复用。

- 新增 `/generate` AI 创作页，支持模板、提示词、画幅、质量和风格选择
- 点评详情页新增“参考图生成”模块，可根据原评图建议生成复拍、构图、光线或色彩参考
- 新增生成任务页、生成详情页和账户内生成历史页，覆盖排队、结果查看、下载、复制提示词、再次生成和回到工作台
- 后端新增生图任务、生成图片数据表、OpenAI 兼容生图客户端、对象存储保存、失败重试和生成额度扣减
- 计费链路新增 AI 生图额度快照、30 点兑换码、300 点额度包结账和中文一次性 Pro 购买支持
- 首页、Header、Usage、Pro 卡片、Blog、Gallery 等入口同步露出 AI 创作和生图额度信息

### AI 创作与复拍参考

- `frontend/src/app/generate/page.tsx` 提供独立 AI 创作页，用户可选择摄影灵感、社媒配图、人像头像、产品场景、空间氛围和色彩 moodboard 等模板
- 创作页会从后端拉取真实 credits table，前端不再硬编码各质量和画幅的点数
- 生成任务提交后跳转 `/generation-tasks/{taskId}` 轮询状态，成功后自动进入 `/generations/{generationId}`
- 生成详情页支持下载、复制提示词、再次生成，并可将生成图作为复拍灵感带回 `/workspace`
- `frontend/src/features/reviews/components/ReviewReferenceGenerationPanel.tsx` 接入点评详情页，让用户按复拍、构图、光线和色彩意图生成下一轮拍摄参考
- Blog、Gallery 和首页入口会带上来源参数进入 AI 创作页，便于后续分析内容入口转化

### 生图后端、额度与任务处理

- 新增 `/generations/templates`、`/generations`、`/generation-tasks/{taskId}`、`/generations/{generationId}`、`/me/generations`、下载、删除和 reuse 等 API
- `image_generation_tasks` 记录排队、运行、重试、进度、错误和来源点评；`generated_images` 记录对象存储位置、模型、质量、画幅、成本和点数
- Worker 会在处理评图任务之外并发提交生图任务，避免长时间生图请求阻塞评图主循环
- OpenAI 兼容客户端支持普通生成、参考图编辑、APIMart 任务轮询、base64 响应解析和生成图下载
- 生图点数按质量与画幅计价，参考图额外加点；成功保存后写入 `usage_ledger`，失败不扣点
- `/me/usage` 现在返回 `generation_credits`，Usage 页面展示本月总量、已用和剩余点数

### 计费、兑换码与本地化入口

- 新增 `PICSPEAKART` 兑换码，可为已登录用户发放 30 个 AI 生图点数，并防止同用户重复兑换
- 新增 300 点生图额度包 checkout API，Lemon Squeezy webhook 会按订单幂等发放点数
- 中文 Pro checkout 支持一次性 30 天 Pro 购买，通过签名 token 在 webhook 中校验并开通
- Header、MarketingHeader、首页 Pro 卡、HomeCheckoutButton、Usage 页面和 ProPromoCard 同步更新 AI 创作、额度和购买文案
- `frontend/src/lib/i18n-zh.ts`、`i18n-en.ts`、`i18n-ja.ts` 新增三语 AI 创作、生成任务、生成详情、额度包和兑换码文案

### 首页更新记录同步

- `/updates` 最新一条记录同步为本次“AI 创作、生图额度与复拍参考”更新
- 首页底部“更新记录”提示文案同步指向 AI 创作和生图额度更新
- 当前首页更新提示由 `frontend/src/app/page.tsx` 读取三语 i18n 的 `updates_hint_latest`，所以实际文案更新落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

### README 同步

- `README.md` 和 `README.zh-CN.md` 功能列表新增 AI Create、复拍参考、生成历史与 AI 生图额度
- 文档区的 Changelog 链接更新到本次 changelog
- 快速开始说明补充 OpenAI 兼容生图 API、Lemon Squeezy 和 AI 生图相关配置

### 影响文件

#### 后端

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

#### 前端

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

#### 测试与文档

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
- `docs/changelog/CHANGELOG.md#2026-04-25-ai-image-generation-and-credits`
- `README.md`
- `README.zh-CN.md`

### 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_image_generation_*.py"`
- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_lemonsqueezy_credit_pack_webhooks backend.tests.test_billing_portal_selection backend.tests.test_settings_defaults backend.tests.test_product_analytics_service backend.tests.test_api_surface_regressions`
- `cd frontend && node --test src/features/generations/generation-contracts.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

<a id="2026-04-24-stage-d-content-conversion"></a>

## 2026-04-24 - stage d content conversion

日期：2026-04-24

### 概览

这次更新围绕“内容阅读和公开长廊如何回到评图工作台”展开：Blog、Gallery 和首页新增更明确的工作台入口，并补齐内容来源转化事件与周报口径，方便后续判断哪些内容真正带来了上传和首评完成。

- Blog 文章底部会按文章题材生成同类点评和上传入口
- Gallery 卡片新增同题材练习和“用这套标准点评我的照片”入口
- 首页新增按用户意图分流的入口，区分新用户、回访用户和内容读者
- 前后端新增 `content_workspace_clicked` 事件，串起内容入口点击、工作台进入、上传和首评完成
- 后端新增内容来源转化周报导出脚本，并让 API 审计日志写入不再阻塞主请求

### 内容入口回流

- `frontend/src/lib/content-conversion.ts` 统一维护 Blog、Gallery 和首页入口文案、归因参数与 `/workspace` 跳转链接
- Blog 详情页底部 CTA 从固定“下一步”改为按文章 slug 匹配题材，例如构图、光线、街拍和色彩判断
- Blog CTA 会携带 `source=blog`、`entrypoint`、`content_slug` 和 `image_type`，并上报 `content_workspace_clicked`
- Gallery 卡片会根据作品题材生成练习入口，并把 `gallery_review_id`、`image_type` 和点击入口写入归因参数
- Gallery 空状态 CTA 也接入同一套 `gallery_practice` 入口，避免空列表场景丢失来源
- 首页新增三类入口：首次上传、继续历史、从内容方法进入工作台

### 内容来源转化统计

- 产品分析事件类型新增 `content_workspace_clicked`
- 后端事件目录将该事件标为 Stage D，并在来源拆解中新增工作台点击数、上传数、点击率和上传转化率
- 新增 `content_conversion_weekly` 快照，分别计算 Blog 和 Gallery 的浏览访客、工作台点击、工作台进入、上传、发起点评和查看结果
- Blog 周报口径额外输出文章到工作台点击率、文章来源首评完成率
- Gallery 周报口径额外输出长廊到工作台点击率、长廊到上传转化率
- `backend/scripts/export_content_conversion_weekly_report.py` 可导出内容来源转化周报，数据库不可用时会生成零基线回退报告并记录原因

### 请求审计稳定性

- `/healthz`、`/docs`、`/openapi.json`、`/redoc` 不再写入 API 审计日志，减少高频非业务端点噪音
- 审计日志持久化改为 `asyncio.to_thread` 后台执行，避免同步数据库写入阻塞 FastAPI 事件循环
- 审计写入失败仍会 rollback 并记录日志，不影响原请求响应

### 首页更新记录同步

- `/updates` 最新一条记录同步为本次“内容来源转化与工作台入口”更新
- 首页底部“更新记录”提示文案同步指向本次 Blog、Gallery 和首页入口转化更新

### 影响文件

#### 后端

- `backend/app/main.py`
- `backend/app/services/product_analytics.py`
- `backend/scripts/export_content_conversion_weekly_report.py`
- `backend/tests/test_product_analytics_service.py`

#### 前端

- `frontend/src/app/[locale]/blog/[slug]/BlogPostClient.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/components/gallery/GalleryCard.tsx`
- `frontend/src/lib/content-conversion.ts`
- `frontend/src/lib/product-analytics.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/test/content-conversion.test.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-24-stage-d-content-conversion`

### 验证

- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_product_analytics_service`
- `cd frontend && node --test test/content-conversion.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run lint`

---

<a id="2026-04-22-pro-conversion-and-faq-schema"></a>

## 2026-04-22 - pro conversion and faq schema

日期：2026-04-22

### 概览

这次更新把 Pro 从“更深度点评”重新包装成“下一轮拍摄指导、完整复盘和进步追踪”的成长工具，同时修复了 `/zh`、`/en`、`/ja` 首页重复输出 `FAQPage` 结构化数据的问题。用户现在会在结果页、历史页和 Usage 页面看到更清楚的升级理由，Google Search Console 也不会再因为 locale 首页重复 FAQPage 字段而报错。

- 首页套餐与 FAQ 文案改为突出 Free / Pro 边界：Free 做快速诊断，Pro 指导下一次拍摄
- 结果页 Pro 触发位统一由策略字典生成，覆盖游客保存、配额触底、深度建议和复拍对比
- 历史页在趋势视图后新增“想看趋势时升级 Pro”的转化入口
- Usage / Billing 页面强化为 Pro 升级决策页，展示付费前后的体验差异
- locale 首页复用首页 UI 时不再重复输出 FAQPage JSON-LD，由 locale layout 保留唯一一份结构化数据
- 新增 Pro 转化策略测试和首页结构化数据 scope 测试

### Pro 价值表达重做

- `frontend/src/lib/pro-conversion.ts` 新增三语 Pro 转化策略字典，统一维护 Free / Pro 边界、升级触发位和 Usage 决策页文案
- `frontend/src/components/marketing/ProPromoCard.tsx` 改用策略字典中的 Pro features 和场景文案，不再把 Pro 主要表达成“更深入分析”
- 首页三语套餐、功能和 FAQ 文案同步改为“快速诊断 -> 下一次拍摄指导 -> 完整复盘 -> 进步追踪”的表达
- `frontend/test/pro-conversion.test.ts` 锁定 Free / Pro 边界、升级触发位和 Usage 决策页文案，避免后续退回“只卖模型深度”的旧表达

### 转化路径补强

- `frontend/src/app/reviews/[reviewId]/page.tsx` 删除内联多语言 Pro 促销分支，改为按触发场景读取统一策略
- 结果页会根据用户身份、低额度、低分或复拍场景展示不同升级理由
- `frontend/src/app/account/reviews/page.tsx` 在已有成长趋势视图后，为非 Pro 用户增加历史趋势相关的 Pro 转化卡
- `frontend/src/app/account/usage/page.tsx` 新增 `UsageDecisionPanel`，把账户页从“看额度”推进到“理解是否该升级”的决策页面

### FAQPage 结构化数据去重

- `frontend/src/app/page.tsx` 拆出 `HomePageContent`，保留根首页默认行为
- `frontend/src/app/[locale]/page.tsx` 复用 `HomePageContent structuredDataScope="locale"`，避免 locale 页面再输出第二份 FAQPage JSON-LD
- `frontend/src/lib/home-structured-data.ts` 集中管理首页结构化数据 scope
- `frontend/test/home-structured-data.test.ts` 覆盖 root 首页保留 FAQPage、locale 首页抑制嵌套 FAQPage 的行为
- 构建产物检查确认 `zh.html`、`en.html`、`ja.html` 中 `FAQPage` 均只出现 1 次

### 首页更新记录同步

- 新增 `/updates` 记录到 `frontend/src/lib/updates-data.ts`
- 首页底部“更新记录”入口仍由 `frontend/src/app/page.tsx` 渲染
- 本次首页 hint 同步实际落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

### 影响文件

#### 前端

- `frontend/src/app/[locale]/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/home-structured-data.ts`
- `frontend/src/lib/pro-conversion.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

#### 测试与文档

- `frontend/test/home-structured-data.test.ts`
- `frontend/test/pro-conversion.test.ts`
- `docs/changelog/CHANGELOG.md#2026-04-22-pro-conversion-and-faq-schema`

### 验证

- `cd frontend && node --test test/home-structured-data.test.ts test/pro-conversion.test.ts test/review-growth.test.ts test/replay-intent-copy.test.ts test/header-auth-visibility.test.ts`
- `cd frontend && npm run lint`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- 构建后检查 `.next/server/app/zh.html`、`.next/server/app/en.html`、`.next/server/app/ja.html` 的 `FAQPage` 计数均为 1

---

<a id="2026-04-20-review-growth-loop-and-replay-guidance"></a>

## 2026-04-20 - review growth loop and replay guidance

日期：2026-04-20

### 概览

这次更新把“看完点评以后下一步该怎么拍”做得更直接了。Flash 建议现在更像可执行的下一轮拍摄指令，历史页会把最近 3 次点评串成连续进步视图，详情页也把“同图复评”和“换新照片重拍”拆成了更清楚的两条路径。

- Flash 模式的建议现在要求每条只聚焦一个具体调整，并用 Observation / Reason / Action 标签输出，便于直接压成下一轮拍摄清单
- 评图历史新增 Growth Loop 区块，对比最近 3 次和之前 3 次的平均分走势，并标出反复掉分的维度
- 评图详情新增下一轮决策卡片和 3 条 checklist，让用户更快判断该继续验证修正还是直接重拍
- 工作台复评横幅与 Header 登录态显示都做了文案和稳定性收口，避免误导性的入口与 hydration 闪烁
- 新增后端 prompt、成长快照、复评文案与 Header 可见性测试，保证这轮行为可回归

### 后端点评输出收口

- `backend/app/services/ai.py` 为 Flash 建议补充了“每条只写一个调整目标”“动作优先”“按 locale 使用显式标签示例”的 prompt 约束
- 这样前端可以更稳定地把建议抽成下一轮拍摄清单，而不是再从一大段混合建议里硬拆动作
- `backend/tests/test_ai_prompt.py` 新增英文与日文标签、Flash 单目标建议约束的回归测试

### 前端成长闭环

- `frontend/src/app/account/reviews/page.tsx` 新增 Growth Loop 面板，对比最近 3 次与上一轮 3 次的平均分，并显示上升、下降或平台期趋势
- 同一区块会汇总反复低于 7 分的维度，并给出最近 3 次点评的快捷回跳入口
- `frontend/src/lib/review-growth.ts` 负责把结构化建议压成 checklist，同时生成历史趋势和薄弱维度快照
- `frontend/src/app/reviews/[reviewId]/page.tsx` 新增 `ReviewGrowthLoopPanel`，把“同图复评”和“换新照片重拍”拆成两条路径
- 详情页会从建议文本里抽出 3 条下一轮清单，优先展示动作、观察和原因
- `frontend/src/features/workspace/components/ReplayBanner.tsx` 与 `frontend/src/lib/replay-intent-copy.ts` 收紧复评文案，明确只有已经改过同一张图时，再复评才真正有意义

### 导航与回归保护

- `frontend/src/components/layout/Header.tsx` 改成在 hydration 完成后再显示登录态专属导航，避免首屏先闪出错误的登录壳
- `frontend/src/features/reviews/components/ReviewActionBar.tsx` 去掉和新 Growth Loop 面板重复的按钮，减少详情页操作分散
- `frontend/test/review-growth.test.ts`、`frontend/test/replay-intent-copy.test.ts`、`frontend/test/header-auth-visibility.test.ts` 补齐新文案和新逻辑回归
- `frontend/tsconfig.typecheck.json` 允许测试文件使用带 `.ts` 扩展名的导入，保证 `npm run typecheck` 能覆盖这些 node:test 文件

### 首页更新记录同步

- 新增 `/updates` 记录到 `frontend/src/lib/updates-data.ts`
- 首页底部“更新记录”入口仍由 `frontend/src/app/page.tsx` 使用 `updates_hint_latest` 渲染
- 因为提示文案来自翻译字典，本次同步实际落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

### 影响文件

#### 后端

- `backend/app/services/ai.py`

#### 前端

- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/header-auth-visibility.ts`
- `frontend/src/features/reviews/components/ReviewActionBar.tsx`
- `frontend/src/features/reviews/components/ReviewGrowthLoopPanel.tsx`
- `frontend/src/features/workspace/components/ReplayBanner.tsx`
- `frontend/src/lib/replay-intent-copy.ts`
- `frontend/src/lib/review-growth.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/tsconfig.typecheck.json`

#### 测试与文档

- `backend/tests/test_ai_prompt.py`
- `frontend/test/header-auth-visibility.test.ts`
- `frontend/test/replay-intent-copy.test.ts`
- `frontend/test/review-growth.test.ts`
- `docs/changelog/CHANGELOG.md#2026-04-20-review-growth-loop-and-replay-guidance`

### 验证

- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_ai_prompt`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && node --test --experimental-strip-types test/review-growth.test.ts test/replay-intent-copy.test.ts test/header-auth-visibility.test.ts`
- `cd frontend && npm run build`

---

<a id="2026-04-19-backend-frontend-module-split"></a>

## 2026-04-19 - backend frontend module split

日期：2026-04-19

### 概览

本次更新是一次纯工程重构，无用户可见功能变化。目标是把积累过大的几个核心文件拆分成职责单一的子模块，降低后续维护和阅读的心智负担。

- 后端废弃了 3000 余行的 `routes.py` 单体文件，各领域路由已完整迁移至 `api/routers/` 下的域文件
- `reviews.py`（980 行）拆分为 4 个子模块：创建、操作、查询、通用支持
- `auth.py` 和 `gallery.py` 各自提取出 `_support` 辅助文件
- 前端评图详情页从 390 行瘦身至 93 行，UI 组件和业务 Hook 迁入 `features/reviews/`
- `useUploadFlow.ts` 的工具函数移入专用的 `uploadFlowSupport.ts`
- 后端应用标题从 `AiPingTu Backend` 更正为 `PicSpeak Backend`

### 后端路由拆分

#### routes.py 清理

- `backend/app/api/routes.py`（3029 行）已被删除
- 各域路由早已迁移至 `api/routers/` 下各自的文件，此次删除清除了遗留冗余

#### reviews 拆分

原始 `reviews.py`（980 行）按职责拆为：

| 文件 | 职责 |
|---|---|
| `review_create.py` | 评图创建（同步/异步）及任务状态查询 |
| `review_actions.py` | 评图操作：删除、分享、导出、元数据更新 |
| `review_queries.py` | 评图列表、历史、单条查询及公开评图查询 |
| `review_support.py` | 跨模块共用的常量、校验函数、构建函数 |

`reviews.py` 现在仅作为聚合入口，从上述 4 个子模块再导出。

#### auth 和 gallery 拆分

- `auth_support.py`：OAuth 流程函数、Clerk webhook 处理、用户序列化等辅助逻辑从 `auth.py` 中提取
- `gallery_support.py`：长廊相关的辅助函数从 `gallery.py` 中提取

#### 其他

- `backend/app/main.py`：FastAPI 应用标题从 `AiPingTu Backend` 更正为 `PicSpeak Backend`
- 新增脚本 `ensure_runtime_schema.py`（运行时 schema 校验）和 `verify_product_analytics_write.py`（产品分析写入验证）
- 所有测试文件的导入路径已同步更新至新模块结构

### 前端组件与 Hook 拆分

#### reviews/[reviewId]/page.tsx

页面文件从 ~390 行精简至 ~93 行，逻辑分散到新建的 `features/reviews/` 下：

**Hooks：**

| 文件 | 职责 |
|---|---|
| `useReviewDetail.ts` | 评图数据加载与状态管理 |
| `useReviewPhoto.ts` | 照片预览 URL 获取与缓存 |
| `useReviewActions.ts` | 分享、导出、收藏、长廊等操作 |
| `useReviewUsage.ts` | 用量配额查询 |
| `reviewActionSupport.ts` | 操作函数的共用辅助 |

**Components：**

| 文件 | 职责 |
|---|---|
| `CritiqueSection.tsx` | 单条批评维度卡片（含复制、展开、反馈） |
| `ReviewScorePanel.tsx` | 评分面板（雷达图 + 分项列表） |
| `ReviewActionBar.tsx` | 顶部操作栏（分享、导出、收藏等按钮） |
| `ReviewGalleryPanel.tsx` | 长廊操作面板 |
| `GalleryConfirmDialog.tsx` | 长廊提交确认弹窗 |
| `ImageZoomOverlay.tsx` | 照片放大覆盖层 |

#### useUploadFlow.ts

- `extractClientMeta`、`cachePhoto`、`getCachedPhoto`、`collectUploadMetrics` 等工具函数迁入 `uploadFlowSupport.ts`
- `useUploadFlow.ts` 保留上传流程主逻辑，工具细节不再内联

#### workspace 组件（小幅调整）

`ImageTypePicker`、`ModePicker`、`QuotaBanner`、`QuotaModal`、`ReplayBanner` 各自有小幅 import 路径更新，行为无变化。

### 首页更新记录同步

- `frontend/src/lib/updates-data.ts`：新增本次重构条目（三语言）
- `frontend/src/lib/i18n-zh.ts` / `i18n-en.ts` / `i18n-ja.ts`：更新 `updates_hint_latest` 指向本次更新

### 影响文件

#### 后端

- `backend/app/api/routes.py`（已删除）
- `backend/app/api/routers/reviews.py`（精简为聚合入口）
- `backend/app/api/routers/review_create.py`（新增）
- `backend/app/api/routers/review_actions.py`（新增）
- `backend/app/api/routers/review_queries.py`（新增）
- `backend/app/api/routers/review_support.py`（新增）
- `backend/app/api/routers/auth.py`（精简）
- `backend/app/api/routers/auth_support.py`（新增）
- `backend/app/api/routers/gallery.py`（精简）
- `backend/app/api/routers/gallery_support.py`（新增）
- `backend/app/main.py`（标题更正）
- `backend/scripts/ensure_runtime_schema.py`（新增）
- `backend/scripts/verify_product_analytics_write.py`（新增）
- `backend/tests/test_ensure_runtime_schema_script.py`（新增）
- `backend/tests/test_verify_product_analytics_write_script.py`（新增）
- `backend/tests/test_*.py`（多个文件的 import 路径更新）

#### 前端

- `frontend/src/app/reviews/[reviewId]/page.tsx`（精简）
- `frontend/src/features/reviews/hooks/useReviewDetail.ts`（新增）
- `frontend/src/features/reviews/hooks/useReviewPhoto.ts`（新增）
- `frontend/src/features/reviews/hooks/useReviewActions.ts`（新增）
- `frontend/src/features/reviews/hooks/useReviewUsage.ts`（新增）
- `frontend/src/features/reviews/hooks/reviewActionSupport.ts`（新增）
- `frontend/src/features/reviews/components/CritiqueSection.tsx`（新增）
- `frontend/src/features/reviews/components/ReviewScorePanel.tsx`（新增）
- `frontend/src/features/reviews/components/ReviewActionBar.tsx`（新增）
- `frontend/src/features/reviews/components/ReviewGalleryPanel.tsx`（新增）
- `frontend/src/features/reviews/components/GalleryConfirmDialog.tsx`（新增）
- `frontend/src/features/reviews/components/ImageZoomOverlay.tsx`（新增）
- `frontend/src/features/workspace/hooks/useUploadFlow.ts`（精简）
- `frontend/src/features/workspace/hooks/uploadFlowSupport.ts`（新增）
- `frontend/src/features/workspace/components/ImageTypePicker.tsx`（小幅调整）
- `frontend/src/features/workspace/components/ModePicker.tsx`（小幅调整）
- `frontend/src/features/workspace/components/QuotaBanner.tsx`（小幅调整）
- `frontend/src/features/workspace/components/QuotaModal.tsx`（小幅调整）
- `frontend/src/features/workspace/components/ReplayBanner.tsx`（小幅调整）
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-19-backend-frontend-module-split`（本文件）
- `docs/api/后端接口文档_v1.md`（小幅更新）
- `docs/architecture/系统架构.md`（小幅更新）
- `CLAUDE.md`（项目结构描述同步）

### 验证

```bash
# 后端测试
cd backend
& "E:\Project Code\PicSpeak\.venv\Scripts\python.exe" -m unittest discover -s tests -p "test_*.py"

# 前端类型检查
cd frontend
npm run typecheck

# 前端构建
npm run build
```

---

<a id="2026-04-19-auth-hardening-and-request-stability"></a>

## 2026-04-19 - auth hardening and request stability

日期：2026-04-19

### 概览

这次更新集中收口了认证链路、任务重试与前端请求稳定性，目标是让游客登录、配额检查、异步任务状态和跨域请求在异常场景下更可控，也避免把内部错误细节直接暴露给用户。

- 后端收紧了 CORS 方法与请求头白名单，并补回前端真实使用的 `X-Device-Id`
- guest cookie 的 SameSite 策略改成按环境显式配置，避免跨域策略和 Secure 组合不一致
- Clerk webhook 的重复事件与鉴权失败现在返回不同状态码，不再把真实失败误报成成功
- 激活码兑换接口新增按用户限速，异步评图的配额检查前移到 AI 调用之前
- 前端请求层补上 AbortController 取消链路，任务页与详情页的轮询/加载中断后不再继续落状态

### 认证与接口安全

- `backend/app/main.py` 不再对 CORS 使用 `*`，而是显式限制为 `GET/POST/PUT/PATCH/DELETE/OPTIONS`，并只开放站点真实依赖的请求头
- `backend/app/api/deps.py` 和 `backend/app/core/config.py` 把 guest token cookie 的 SameSite 策略改成配置驱动：
  - 开发环境固定回落到 `lax`
  - 非开发环境允许 `none`，但会自动要求 `secure`
- `backend/app/api/routers/auth.py` 修正了 Clerk webhook 的错误响应：
  - `409` 冲突视为幂等重复事件，返回 200
  - `401/403` 处理失败改为返回 400，避免被上游当成成功吞掉
- `backend/app/api/routers/billing.py` 和 `backend/app/services/guard.py` 为激活码兑换增加用户级限速，阻断高频猜码

### 任务稳定性与错误边界

- `backend/app/services/clerk_auth.py` 为 JWKS 缓存刷新加锁，避免并发请求同时击穿 Clerk 上游
- `backend/app/services/review_task_processor.py` 调整了评图任务的失败语义：
  - 领取任务时就消耗一次 attempt，避免边界条件下的无限重试
  - AI 与 worker 失败消息对外统一做脱敏，用户侧只看到可恢复的通用提示
  - 配额检查前移到 `run_ai_review()` 之前，避免无额度时仍触发模型调用
- `backend/app/api/routers/tasks.py` 和 `backend/app/api/routers/realtime.py` 统一输出脱敏后的任务错误与事件消息
- `backend/app/api/routers/review_create.py` 的同步评图失败也不再直接返回上游异常原文
- `backend/app/services/ai.py` 删除了 `run_ai_review()` 返回后的整段不可达旧实现，减少维护噪音

### 前端请求稳定性

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

### 首页更新记录同步

- 新增 `/updates` 记录数据到 `frontend/src/lib/updates-data.ts`
- 首页底部“更新记录”入口仍由 `frontend/src/app/page.tsx` 使用 `updates_hint_latest` 渲染
- 因为当前首页提示来自翻译字典而不是页面内硬编码常量，所以本次同步落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

### 影响文件

#### 后端

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

#### 前端

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

#### 测试与文档

- `backend/tests/test_clerk_auth.py`
- `backend/tests/test_review_task_processor.py`
- `backend/tests/test_auth_transaction_helpers.py`
- `backend/tests/test_api_surface_regressions.py`
- `docs/changelog/CHANGELOG.md#2026-04-19-auth-hardening-and-request-stability`

### 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -q`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

---

<a id="2026-04-13-blog-view-counts"></a>

## 2026-04-13 - blog view counts

日期：2026-04-13

### 概览

这次更新给博客文章加上了公开浏览次数，并把计数贯通到数据库、后端接口和前端页面。用户现在在博客列表页和文章详情页都能直接看到每篇文章被浏览了多少次，进入文章详情页时会自动记一次浏览。

- 博客详情页新增浏览计数写入，打开文章会自动增加一次浏览数
- 博客列表页和文章详情页都开始展示文章浏览次数
- 后端新增独立的 `blog_post_views` 计数表与公开接口，按文章 `slug` 维护浏览量
- 前端增加 5 秒去抖，避免极短时间内重复进入同一篇文章时连续累加

### 博客浏览统计

- 新增 `blog_post_views` 表，字段包括 `slug`、`view_count`、`created_at`、`updated_at`
- 后端新增 `GET /api/v1/blog/views`，支持按多个 `slug` 批量读取浏览数
- 后端新增 `POST /api/v1/blog/{slug}/views`，用于文章详情页进入时递增浏览数
- `slug` 在后端会统一转成小写并做格式校验，避免异常值进入计数表

### 前端展示

- 博客列表页卡片和精选文章区域新增浏览次数显示
- 博客详情页标题区新增浏览次数显示
- 相关文章卡片也会同步展示各自的浏览次数
- 前端通过 `sessionStorage` 做 5 秒节流，保证“点进去一次记一次”的同时，避免短时间重复触发造成异常放大

### 首页更新记录同步

- `/updates` 页面已新增本次更新条目，并放在三种语言列表的最前面
- 首页底部“更新记录”入口的最新提示文案已同步到本次“博客浏览次数”更新主题
- 当前首页实现通过 i18n 文案控制提示内容，因此本次同步点落在 `i18n-en.ts`、`i18n-zh.ts` 和 `i18n-ja.ts`

### 影响文件

#### 后端

- `backend/app/api/routes.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/schemas.py`
- `backend/tests/test_blog_post_views.py`
- `create_schema.sql`

#### 前端

- `frontend/src/app/[locale]/blog/BlogIndexClient.tsx`
- `frontend/src/app/[locale]/blog/[slug]/BlogPostClient.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/blog-view-stats.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-ja.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-13-blog-view-counts`

### 验证

- `.\.venv\Scripts\python.exe -m pytest backend/tests/test_blog_post_views.py backend/tests/test_public_gallery_route.py`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

---

<a id="2026-04-12-llms-seo-schema"></a>

## 2026-04-12 - llms seo schema

日期：2026-04-12

### 概览

本次更新重点强化 AI 搜索可见性：新增 llms.txt 标准文件帮助 AI 系统理解网站结构与内容，补齐 Person 和 SoftwareSourceCode 等 Schema.org 结构化数据，并为更新记录页面增加多语言路由。同时优化了导航栏布局和移动端体验。

- 新增 `/llms.txt` 和 `/.well-known/llms.txt` 路由，遵循 AI 搜索引擎标准
- 补齐 Person、SoftwareSourceCode 等 Schema.org 结构化数据
- 新增 `/[locale]/updates` 多语言更新记录路由
- 优化 Header 导航布局，增加移动端首页入口
- 简化路由判断逻辑，移除条件性 Provider 注入
- 更新示例图片 alt 文案，提升无障碍访问质量
- `.gitignore` 新增 GEO 审核报告忽略规则

### llms.txt 实现

- 新增 `frontend/public/llms.txt` 静态文件，包含产品定位、功能、定价、关键 URL、博客主题等结构化信息
- 新增 `frontend/src/lib/llms.ts`，提供 `getLlmsText()` 函数动态生成内容
- 新增 `frontend/src/app/llms.txt/route.ts` 和 `frontend/src/app/.well-known/llms.txt/route.ts`，提供两个标准访问路径
- 响应头包含 `text/plain; charset=utf-8` 和 1 小时缓存策略
- 新增 `siteConfig.repositoryUrl`、`siteConfig.social`、`siteConfig.author` 配置项，供 Schema 和 llms.txt 共用

### Schema.org 结构化数据增强

#### 首页
- 新增 Person schema（`@id`、name、alternateName、jobTitle、description、email、sameAs）
- 新增 SoftwareSourceCode schema（codeRepository、programmingLanguage、runtimePlatform、author、publisher）
- SoftwareApplication 增加 `sameAs`（X、GitHub）、`isAccessibleForFree`、`creator` 字段

#### 博客索引页
- Blog schema 增加 `author`（@id 引用）、`publisher` 字段
- 新增 Person schema，与首页共用 author 信息

#### 博客文章页
- BlogPosting schema 增加 `inLanguage`、`url`、`isPartOf`（引用 Blog）、`author`（@id 引用）
- 新增 Person schema

#### 布局组件
- SoftwareApplication schema 增加 `sameAs`、`isAccessibleForFree`、`creator` 字段

### 多语言更新记录页面

- 新增 `frontend/src/app/[locale]/updates/page.tsx`，提供 `/zh/updates`、`/en/updates`、`/ja/updates` 路由
- 提取 `frontend/src/components/marketing/UpdatesPageContent.tsx` 共享组件，接收 `homeHref` 参数
- 原 `/updates` 页面改为调用共享组件，传入 `homeHref="/"`
- 更新记录页面新增三语 metadata（title、description、OpenGraph、alternates）
- `sitemap.ts` 新增各 locale 的 `/updates` 条目，带完整 hreflang alternates
- 原 `/updates` 条目的 alternates 修正为指向正确的 locale 路径

### Header 导航优化

- Logo 旁新增移动端首页链接（仅移动端显示）
- 快捷菜单（QuickLinksMenu）重构：
  - 非访客用户的"历史记录"移至快捷菜单
  - 移动端底部导航新增博客入口（BookOpen 图标）
  - 移动端"使用量"入口改为始终显示
- 桌面端导航简化：使用量链接不再受 plan 条件约束
- 博客链接统一使用 `/${locale}/blog` 格式，确保语言前缀正确

### 路由判断简化

- `route-shell.ts` 重构为通用路径匹配：
  - 使用正则 `/(zh|en|ja)` 提取并移除 locale 前缀
  - 路径标准化后再判断是否为 marketing 路由
- `AppProviders.tsx` 移除条件性 Provider 注入，统一使用完整 Provider 栈
- 修复 marketing 路由子页面（如 `/zh/blog/article`）的高亮判断

### 内容更新

- 首页示例图片 alt 文案更新，从"蓝天下的秋日银杏树"改为详细描述金色时刻逆光银杏树冠的光影特征与色温对比
- 三语（中/英/日）同步更新，提升无障碍访问质量和 SEO 相关性

### 首页更新记录同步

首页 `page.tsx` 底部更新记录入口链接从 `/updates` 改为 `/${locale}/updates`，与新增的多语言路由保持一致。

### 影响文件

#### 前端

- `frontend/src/app/page.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/updates/layout.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/[locale]/layout.tsx`
- `frontend/src/app/[locale]/blog/BlogIndexClient.tsx`
- `frontend/src/app/[locale]/blog/[slug]/BlogPostClient.tsx`
- `frontend/src/app/[locale]/updates/page.tsx` (新增)
- `frontend/src/app/llms.txt/route.ts` (新增)
- `frontend/src/app/.well-known/llms.txt/route.ts` (新增)
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/marketing/UpdatesPageContent.tsx` (新增)
- `frontend/src/components/providers/AppProviders.tsx`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/llms.ts` (新增)
- `frontend/src/lib/route-shell.ts`
- `frontend/src/lib/site.ts`
- `frontend/public/llms.txt` (新增)

#### 文档/配置

- `.gitignore`
- `docs/changelog/CHANGELOG.md#2026-04-12-llms-seo-schema` (本文)

### 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

<a id="2026-04-11-blog-gallery-sort-theme"></a>

## 2026-04-11 - blog gallery sort theme

日期：2026-04-11

### 概览

本次更新包含三块主要改动：新增多语言博客模块、画廊排序功能和深色主题色值校准。博客模块为产品首次引入内容营销入口，画廊排序让用户可以自由选择浏览方式，主题色调整让深色模式更温暖耐看。

- 新增 `/[locale]/blog` 博客模块，含 6 篇三语（中/英/日）SEO 文章
- 画廊新增排序选项：推荐、最新、最高分、最多赞
- 深色主题色值从中性灰调整为暖褐色调，多处硬编码 `rgba()` 改用 CSS 变量
- 后端代理 URL 构造适配反向代理场景（`X-Forwarded-*` 头）
- 画廊卡片图片加载增加 fallback 链路，提升可靠性

### 博客模块

- 新增 `frontend/src/lib/blog-data.ts`，包含 6 篇文章的三语完整内容：AI 日常练习、构图检查、反馈转清单、光线错误、色彩原则、街头摄影工作流
- 新增 `frontend/src/app/[locale]/blog/` 路由组件：`page.tsx`（索引页 SSR Metadata）、`BlogIndexClient.tsx`（客户端列表）、`[slug]/page.tsx`（文章详情 SSR Metadata）、`[slug]/BlogPostClient.tsx`（客户端详情）
- Header、MarketingHeader、Footer 均新增 Blog 导航入口，根据当前 locale 生成正确的链接
- 首页底部新增博客入口（带 `BookOpenText` 图标），与现有 Updates 入口并列
- `sitemap.ts` 扩展：为每个 locale 生成博客索引条目和每篇文章条目，包含 `alternates` hreflang
- `route-shell.ts` 将 `/blog` 加入 marketing 路由白名单，无需登录即可访问
- Header 语言切换器增加 locale 路由感知：在 `/zh/blog` 等 locale 前缀路由上切换语言时，会导航到对应 locale 的等效路径

### 画廊排序

- 后端 `list_public_gallery` 新增 `sort` 查询参数，支持 `default`（综合热度）、`latest`（发布时间）、`score`（最终评分）、`likes`（点赞数）
- 排序逻辑统一复用已有的三段式游标分页机制，`primary_expr` 替代原先写死的 `rank_score`
- 前端 `GalleryFilters` 组件新增排序按钮组（Zap/Clock/Star/Heart 图标），当前选中项高亮为金色
- 前端 `api.ts` 和 `types.ts` 新增 `sort` 字段透传
- i18n 三语新增 `gallery_sort_default/latest/score/likes` 翻译键
- 后端新增测试用例验证排序参数正确传递

### 深色主题与样式统一

- `globals.css` 深色主题 9 个基础色值从中性灰（`8 8 8` ~ `46 46 46`）调整为暖褐色调（`17 16 15` ~ `64 58 52`），整体色温更温暖
- 多个页面和组件中硬编码的 `rgba(18,16,13,…)` 和 `#050505`、`#111111`、`#2b2722` 等色值统一替换为 `rgb(var(--color-surface)/…)`、`bg-void/95`、`bg-surface`、`border-border` 等 CSS 变量写法
- 受影响组件：`gallery/page.tsx`、`reviews/[reviewId]/page.tsx`、`account/favorites/page.tsx`、`account/reviews/page.tsx`、`workspace/page.tsx`、`updates/page.tsx`、`ProPromoCard.tsx`、`ActivationCodeModal.tsx`、`GalleryFilters.tsx`
- Header 和 MarketingHeader 的 `isActive` 判断改为路径前缀匹配，子页面也能正确高亮导航项

### 后端代理 URL 适配

- 新增 `_request_origin()` 和 `_request_url_for()` 辅助函数，读取 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 头
- `_build_photo_proxy_url` 改用 `_request_url_for` 构造 URL，在反向代理（如 Nginx）后面也能生成正确的 `https://` 公网 URL
- 非 localhost 环境自动升级为 HTTPS
- 新增单元测试 `test_build_photo_proxy_url_prefers_https_for_forwarded_requests`

### 画廊卡片图片加载改进

- `GalleryCardImage` 从 `next/image` 的 `Image` 组件彻底切换到原生 `<img>`（之前部分场景已切换）
- 新增 fallback 链路：优先加载 `photo_thumbnail_url`，失败后回退到 `photo_url`，再次失败才显示占位
- 添加 `loading="lazy"` 和 `decoding="async"` 属性

### 其他

- `.gitignore` 新增 `.claude/` 目录

### 首页更新记录同步

首页 `page.tsx` 底部同时展示博客入口和更新记录入口，`updates_hint_latest` 仍指向当前最新更新条目。本次未更改 `updates-data.ts` 中的条目内容，但需要在下方步骤中同步新条目。

### 影响文件

#### 后端

- `backend/app/api/routes.py`
- `backend/tests/test_public_gallery_route.py`

#### 前端

- `frontend/src/app/globals.css`
- `frontend/src/app/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/app/account/favorites/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/[locale]/blog/page.tsx` (新增)
- `frontend/src/app/[locale]/blog/BlogIndexClient.tsx` (新增)
- `frontend/src/app/[locale]/blog/[slug]/page.tsx` (新增)
- `frontend/src/app/[locale]/blog/[slug]/BlogPostClient.tsx` (新增)
- `frontend/src/components/billing/ActivationCodeModal.tsx`
- `frontend/src/components/gallery/GalleryCardImage.tsx`
- `frontend/src/components/gallery/GalleryFilters.tsx`
- `frontend/src/components/layout/Footer.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/MarketingHeader.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/blog-data.ts` (新增)
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/route-shell.ts`
- `frontend/src/lib/types.ts`

#### 文档/配置

- `.gitignore`
- `docs/changelog/CHANGELOG.md#2026-04-11-blog-gallery-sort-theme` (本文)

### 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `& "E:\Project Code\PicSpeak\.venv\Scripts\python.exe" -m unittest discover -s backend/tests -p "test_*.py"`

---

<a id="2026-04-10-locale-seo-and-gallery-refactor"></a>

## 2026-04-10 - locale seo and gallery refactor

日期：2026-04-10

### 概览

这次更新主要解决两个问题：一是让中文、英文、日文用户可以通过独立 URL 直接进入对应语言首页，并把多语 SEO 信号补完整；二是把首页、公开长廊、评图页和工作台里零散的多语文案与大块页面逻辑收拢整理，方便继续迭代。

- 新增 `/zh`、`/en`、`/ja` 三个语言固定首页，进入后会直接锁定当前语言
- 首页、公开页面 metadata、`hreflang`、`sitemap` 和 JSON-LD 同步补齐多语 SEO 入口
- 首页价格区、更新记录、联系方式，以及工作台/评图页/长廊的多语文案统一收拢进 i18n
- 公开长廊页拆分为筛选、卡片、分页等独立组件，保留现有体验的同时降低后续维护成本

### 多语言首页与 SEO 路由

- 新增 `frontend/src/app/[locale]/` 路由层，支持 `/zh`、`/en`、`/ja` 三个语言固定首页
- 语言固定首页会通过内层 `I18nProvider` 直接写入当前 locale，避免继续依赖浏览器检测或旧的本地缓存状态
- 语言固定首页为每种语言分别配置了标题、描述、关键词、Open Graph、Twitter 卡片和 JSON-LD
- 根首页、`/affiliate`、`/gallery`、`/updates`、公开评图示例页和 `sitemap` 也同步带上 `canonical` 与 `alternate languages`
- `route-shell` 现在把 `/zh`、`/en`、`/ja` 识别为 marketing 路由，确保这些直达首页继续沿用营销页壳层逻辑

### 页面文案与组件整理

- 首页里原先写死在组件内部的价格、促销、联系方式和“更新记录”提示，改为统一从翻译字典读取
- 工作台“复用上一张照片”区域、评图页收藏返回文案、Pro 转化卡、长廊 SEO 说明都改为使用三语 i18n 键
- 公开长廊页把筛选、卡片、分页抽成 `GalleryFilters`、`GalleryCard`、`GalleryPagination` 等独立组件
- 长廊页内部原先散落在页面文件中的本地化文案与小工具函数得到收敛，页面主体保留数据流和交互编排职责
- 工作台上传预览、模式选择和 CTA 动效也做了同批视觉整理，但不改变已有评图流程

### 首页更新记录同步

- `/updates` 最新一条记录已切换到本次“多语言首页直达、SEO 路由与长廊页面重构”更新
- 首页底部“更新记录”提示已改为指向本次 2026-04-10 更新主题

### 影响文件

#### 前端

- `frontend/src/app/[locale]/layout.tsx`
- `frontend/src/app/[locale]/locales.ts`
- `frontend/src/app/[locale]/page.tsx`
- `frontend/src/app/affiliate/page.tsx`
- `frontend/src/app/gallery/layout.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/layout.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/updates/layout.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/components/gallery/GalleryCard.tsx`
- `frontend/src/components/gallery/GalleryCardImage.tsx`
- `frontend/src/components/gallery/GalleryFilters.tsx`
- `frontend/src/components/gallery/GalleryPagination.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/route-shell.ts`
- `frontend/src/lib/updates-data.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-10-locale-seo-and-gallery-refactor`
- `docs/changelog/CHANGELOG_WORKFLOW.md`

### 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

<a id="2026-04-09-gallery-ranking-and-quality-gates"></a>

## 2026-04-09 - gallery ranking and quality gates

日期：2026-04-09

### 概览

这次更新围绕公开影像长廊的排序质量、图片加载稳定性和前端质量门展开，目标是让用户更容易先看到分数更高、同时又较新的作品，并且避免长廊卡片在开发环境里出现图片加载失败或前端 lint 无法运行的问题。

- 公开影像长廊改为按“分数优先、发布时间次优先”的组合热度排序
- 长廊分页游标升级为稳定游标，避免组合排序下翻页重复或漏项
- 修复 `next/image` 远程源配置缺失导致的开发环境报错
- 长廊卡片图片恢复为更稳定的原生 `<img>` 渲染路径，避免缩略图可请求但不显示
- 前端补齐 ESLint 配置，`npm run lint` 不再进入交互模式

### 影像长廊排序

- 后端 `/gallery` 查询不再只按 `gallery_added_at` 倒序，而是改为组合排序分
- 排序分由 `final_score` 和发布时间新鲜度共同组成，其中分数权重更高
- 当前权重为：分数 `0.6`，时间 `0.4`
- 时间衰减采用 `45` 天半衰期，越新的作品会获得更高的新鲜度加成
- 这样可以保证明显高分的作品优先，同时让分数接近时的新作品更容易排到前面

### 分页与游标稳定性

- 长廊排序改为组合分后，原先只基于发布时间的分页游标已经不够稳定
- 新游标现在同时编码：组合排序分、`gallery_added_at`、数据库 `id`
- 翻页过滤逻辑也同步改为三段式比较，避免出现同一张卡片在翻页时重复出现，或某些卡片被跳过
- 兼容旧游标格式，旧的仅时间游标仍可解析

### 图片加载与前端质量门

- `next.config.js` 现在显式允许 `http://localhost:8000` 和 `http://127.0.0.1:8000` 作为图片源，并会自动吸收 `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SITE_URL`
- 长廊卡片在尝试改为 `next/image` 后出现了可请求但不可见的渲染问题，因此主图、背景图和头像恢复成原生 `<img>`，优先保证稳定显示
- 评图详情页和缓存缩略图组件保留了原生 `<img>` 的 ESLint 例外说明，因为这些场景依赖 blob / object URL 或缩放原图
- 前端新增 `.eslintrc.json` 和 `.eslintignore`，并把 `lint` 脚本切换到 ESLint CLI，后续可以稳定跑进 CI 或本地检查
- `account/usage` 页面补齐 Hook 依赖，避免用户状态变化时的潜在同步问题

### 影响文件

#### 后端

- `backend/app/api/routes.py`
- `backend/tests/test_public_gallery_route.py`

#### 前端

- `frontend/next.config.js`
- `frontend/package.json`
- `frontend/.eslintrc.json`
- `frontend/.eslintignore`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/ui/CachedThumbnail.tsx`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/app/page.tsx`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-09-gallery-ranking-and-quality-gates`

### 验证

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `.\.venv\Scripts\python -m pytest backend -q`

---

<a id="2026-04-07-activation-code-billing"></a>

## 2026-04-07 - activation code billing

日期：2026-04-07

### 概览

这次更新围绕中文用户的 Pro 开通与续期链路展开，目标是把“国内购买 -> 收到激活码 -> 站内兑换 -> 自动同步会员状态”这条路径补完整，同时把相关入口同步到首页、评图页、营销卡片和账户页。

- 后端新增激活码订阅能力，支持 30 天 Pro 开通与续期
- 中文环境下的 Pro 购买入口统一改为前往爱发电，下单后通过激活码在站内兑换
- 账户页能够识别激活码来源的 Pro，正确展示到期时间、无自动续费状态和续期入口
- 鉴权与 webhook 现在复用同一套订阅权限判断，过期订阅会正确回落到 `free` 或 `guest`
- 同步补上激活码生成脚本、后端测试覆盖，以及首页更新记录

### 激活码订阅链路

- 新增 `billing_activation_codes` 表，用来存储激活码哈希、批次、时长、兑换状态和过期信息
- 新增 `/billing/activation-code/redeem` 接口，登录用户可直接提交激活码完成开通
- 激活码兑换后会生成或复用 `activation_code` 类型订阅，并把 Pro 到期时间顺延 `30` 天
- 如果用户已经有激活码 Pro 且尚未到期，新兑换的时长会接在原到期时间之后，而不是覆盖
- Lemon Squeezy 订阅与激活码订阅现在共用 `billing_access.py` 内的权限判断与计划同步逻辑

### 中文购买与账户页

- 中文环境下的 Pro 购买按钮统一改为跳转爱发电商品页
- 购买提示从“微信联系购买”改为“下单后输入激活码开通 30 天 Pro”
- 账户额度页新增“国内支付与激活码开通”说明区，明确展示购买、收码、兑换三步流程
- 额度页新增激活码兑换弹窗，支持直接输入激活码并在成功后刷新当前套餐状态
- 当 Pro 来源于激活码时，账户页会展示“当前账号通过激活码开通，无自动续费”，并将原订阅管理按钮替换为续费入口

### 页面入口与工程补充

- 首页定价区按钮、通用 Pro 转化卡和额度页都新增“输入激活码”入口
- 评图详情页复用同样的中文 Pro 转化文案，支持直接走购买或兑换路径
- 新增 `backend/scripts/generate_activation_codes.py`，可批量生成激活码与 SQL 种子数据
- 新增 `backend/tests/test_billing_activation_access.py`，覆盖到期降级、guest 保持 guest、激活码续期等场景
- 评图详情页的大量文案与解析辅助函数抽离到 `frontend/src/lib/review-page-copy.ts`
- `frontend/next.config.js` 为非开发构建切换到内存缓存，减少写盘缓存带来的构建环境问题

### 首页更新记录同步

- `/updates` 最新一条记录已切换到本次“激活码开通与订阅同步”更新
- 首页底部“更新记录”提示文案已改为指向本次激活码与国内支付链路更新

### 影响文件

#### 后端

- `backend/app/api/deps.py`
- `backend/app/api/routes.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/schemas.py`
- `backend/app/services/billing_access.py`
- `backend/app/services/lemonsqueezy_webhooks.py`
- `backend/scripts/generate_activation_codes.py`
- `backend/tests/test_billing_activation_access.py`
- `create_schema.sql`

#### 前端

- `frontend/next.config.js`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/billing/ActivationCodeModal.tsx`
- `frontend/src/components/home/HomeCheckoutButton.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/lib/review-page-copy.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/updates-data.ts`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-07-activation-code-billing`

### 验证

- `cd backend && python -m unittest tests.test_billing_activation_access`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

<a id="2026-04-01-audit-score-gallery-polish"></a>

## 2026-04-01 - audit score gallery polish

日期：2026-04-01

### 概览

这次更新主要围绕公开长廊审核、评图结果表达，以及长廊卡片展示稳定性做了一轮收口：

- 公开长廊图片审核 prompt 改为“只拦截明确违规内容”，降低对泳装、时尚摄影、非露点贴身服装等内容的误杀
- 评图详情页把最终得分文案从 5 档粗分类细化到 10 档，并补齐中英日三套本地化标签
- 公开长廊卡片统一改为留白包裹 + 背景虚化的缩略图展示方式，横图不再被列表卡片硬裁切
- 补上内容审核 prompt 的回归测试，并整理本地忽略规则，避免 `.vercel` 与本地环境文件进入工作区

### 公开长廊审核收紧误杀

- 内容审核 prompt 现在明确要求“只拦截高置信度违规内容”，并把判断边界写清楚
- 正常人像、时尚摄影、泳装、健身、舞蹈、孕妇照、非露点内衣或贴身服装、艺术化人体表达等内容默认倾向 `safe`
- 如果只有性感氛围、姿势撩人或衣着较少，但没有明确露点或露骨性行为，模型应给出较低 `nsfw_score`，而不是直接拦截
- 无法确定时默认倾向 `safe`，减少公开长廊因为审核过度保守而丢图

### 评图得分文案细化

- 评图详情页不再只显示“优秀 / 良好 / 中等”这类粗粒度标签
- 最终分数现在会先四舍五入到 `1` 到 `10` 的整数档位，再映射到对应文案
- 中文、英文、日文都补齐了 10 档结果标签，让用户看到的总结语更贴近实际分数区间
- 这次调整只改展示层，不改原始评分逻辑

### 长廊卡片展示优化

- 公开长廊卡片去掉了按横竖图分支渲染的逻辑，统一使用 `object-contain`
- 横图会放在带留白的容器里展示，外层保留模糊背景，既不拉伸也不再把主体裁掉
- 这样可以减少卡片因图片方向切换而出现的跳变，同时让不同构图在列表里更稳定

### 工程补充

- 新增内容审核 prompt 回归测试，锁住“常见边界内容应默认通过”的行为
- 根目录和前端目录补充忽略 `.vercel` 与本地环境文件的规则，减少无关改动进入 Git 工作区

### 影响文件

#### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/.gitignore`

#### 后端

- `backend/app/services/content_audit.py`
- `backend/tests/test_content_audit.py`
- `.gitignore`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-04-01-audit-score-gallery-polish`

### 验证

- `cd backend && python -m unittest tests.test_content_audit`
- `cd frontend && npm run typecheck`

---

<a id="2026-03-28-home-review-gallery-refresh"></a>

## 2026-03-28 - home review gallery refresh

日期：2026-03-28

### 概览

这次更新主要围绕三个方向收口：

- 首页继续做轻量化和体验打磨，统一顶栏样式，补上注册入口，并修掉头像显示和 Pro 卡片 tips 被截断的问题
- 评图详情页修复了“单条建议被拆成多条”的展示错误，同时优先复用本地上传预览，减少图片显示失败
- 公开长廊补强分页体验与缩略图链路，新增可回填的 gallery thumbnail 脚本与测试，降低首屏图像带宽

### 首页与入口体验

- 首页顶栏已统一回应用内的标准 Header，导航、语言切换、主题切换和右侧操作区与工作台页保持一致
- 首页 CTA 区现在同时提供“立即登录”和“立即注册”
- 登录后的头像展示改为紧凑容器，不再被固定宽度占位框挤压
- Pro 促销卡底部的支付 tips 现在可以完整展示，不再被插槽高度裁掉
- 首页 FAQ、登录、注册、结账按钮与背景特效继续保持按需挂载，避免把不必要的交互逻辑压进首屏

### 评图详情修复

- 建议列表的切分逻辑做了收紧：已经识别为“观察 / 原因 / 可执行动作”的完整建议，不会再因为分号被拆成三张卡片
- 评图详情页优先读取本地上传后的预览地址，减少回看历史时图片丢失或加载失败
- 详情大图改为直接使用浏览器图片元素，减少额外包装带来的显示问题

### 公开长廊与缩略图链路

- 长廊分页新增首页、末页、页码跳转和当前区间显示，翻页反馈更直接
- 公开长廊入选时会生成专用的 `gallery thumbnail`，并使用长期缓存策略返回给列表卡片
- 长廊卡片优先使用专用缩略图，不再为列表展示优先请求原图
- 新增 `backfill_gallery_thumbnails.py`，可以为已审核通过的公开作品批量补齐缩略图
- 增加了缩略图生成、公开长廊返回字段和回填脚本的测试覆盖

### 首页更新记录同步

- `/updates` 页面的最新一条已切换到本次更新
- 首页底部“更新记录”入口文案已同步指向本次首页 / 评图 / 长廊整理

### 影响文件

#### 前端

- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/home/*`
- `frontend/src/components/layout/SiteChrome.tsx`
- `frontend/src/components/performance/PerformanceTelemetry.tsx`
- `frontend/src/components/ui/DeferredBackgroundEffect.tsx`
- `frontend/src/components/providers/AppProviders.tsx`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/route-shell.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/package.json`
- `frontend/tsconfig.typecheck.json`

#### 后端

- `backend/app/api/routes.py`
- `backend/scripts/backfill_gallery_thumbnails.py`
- `backend/tests/test_backfill_gallery_thumbnails_script.py`
- `backend/tests/test_gallery_thumbnail_flow.py`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-03-28-home-review-gallery-refresh`

### 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

---

<a id="2026-03-27-gallery-navigation-and-filters"></a>

## 2026-03-27 - gallery navigation and filters

日期：2026-03-27

### 概览

这次更新继续围绕公开影像长廊打磨，重点解决三类问题：一是从长廊进入详情后返回时，列表会丢失原来的分页与滚动位置；二是长廊还缺少和评图历史一致的筛选能力；三是卡片图片仍可能请求原图，不够节制。

- 公开影像长廊新增与评图历史一致的筛选项：开始时间、结束时间、最低评分、最高评分、图片类型
- 长廊筛选状态现在同步到 URL，浏览器前进/后退可恢复当前筛选条件
- 长廊列表状态按当前筛选条件单独缓存，进入详情再返回时可恢复已加载页、当前页和滚动位置
- 长廊卡片改为只使用缩略图，不再优先请求原图，同时继续使用较高清晰度缩略图
- 首页更新记录与 `/updates` 页面已同步切换到本次更新

### 公开长廊筛选

- 公开长廊页新增筛选面板，交互与“我的历史”保持一致
- 筛选参数直接写入 `/gallery` 查询串，便于分享、刷新和浏览器历史恢复
- 后端 `/gallery` 接口补充支持：
  - `created_from`
  - `created_to`
  - `min_score`
  - `max_score`
  - `image_type`
- `total_count` 也会按当前筛选结果返回，避免头部计数与实际列表不一致

### 返回恢复与浏览器历史

- 从长廊卡片进入详情前，会保存当前筛选条件下的列表页状态
- 返回长廊时，会优先恢复：
  - 已加载分页数据
  - 当前分页索引
  - 页面滚动位置
  - 最近点击的卡片定位
- 恢复状态按“当前筛选条件”分桶保存，不同筛选结果之间互不污染
- 详情页返回逻辑同时兼容浏览器前进/后退键与页面内返回按钮

### 图片加载策略

- 长廊卡片改为只读取 `photo_thumbnail_url`
- 不再因为卡片展示去优先请求 `photo_url`
- 继续沿用公开长廊接口提供的较高分辨率缩略图，兼顾带宽与清晰度

### 影响文件

#### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/lib/gallery-navigation.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`

#### 后端

- `backend/app/api/routes.py`
- `backend/tests/test_public_gallery_route.py`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-03-27-gallery-navigation-and-filters`

### 验证

- `cd frontend && npx tsc --noEmit` 通过
- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_public_gallery_route` 通过

---

<a id="2026-03-25-pro-launch-checkout"></a>

## 2026-03-25 - pro launch checkout

日期：2026-03-25

### 概览

这次更新围绕 Pro 首发优惠和购买链路展开，目标是让用户从看到优惠、理解权益到进入支付的路径更短、更清晰。

- 全站统一 Pro 首发优惠文案，当前价格调整为 `$2.99/月`，并明确为网站运营初期 `25% OFF`
- 工作台、结果页、影像长廊、额度页与首页定价区统一补强 Pro 入口
- 促销按钮不再先跳到额度页，而是直接请求 `checkout_url` 后进入支付流程
- 中文环境下增加国内支付提示，告知用户可通过微信 `Asa-180` 联系购买，并提供优惠价
- 修复开发环境启动前清空 `.next` 带来的不稳定问题

### Pro 优惠表达统一

- 首页定价区、页内促销卡、额度页等位置统一展示 `$2.99/月` 与划线原价 `$3.99`
- 统一强调“网站运营初期 25% OFF”的首发优惠语境
- Pro 用户文案改成面向真实用户的权益确认，不再出现内部验收式表达

### 转化入口增强

- 工作台新增更靠下的 Pro 转化卡片，减少对上传主流程的打断
- 结果页保留升级入口，并根据额度与结果状态强化升级理由
- 影像长廊新增从案例浏览切换到深度分析的转化入口
- 额度页、首页定价区同步升级为首发优惠表达

### 购买链路更新

- 所有促销卡和首页 Pro 购买按钮改为直接拉取 `checkout_url`
- 用户点击“领取 Pro 首发价”后直接进入支付，不再先绕到 `/account/usage`
- 额度页原有购买按钮保留，但与其他入口使用同一条 checkout 链路

### 中文支付提示

- 当用户语言为中文时，在所有直达 checkout 的“领取 Pro 首发价”按钮下方补充提示
- 提示内容为：当前暂未接入国内支付渠道，国内用户可添加微信 `Asa-180` 购买，另有优惠价

### 开发与文档

- `frontend/package.json` 中的 `dev` 脚本改为直接执行 `next dev`
- 新增 `dev:clean` 以便在需要时手动清理 `.next`
- 联盟资料、多语言文案与首页更新记录同步更新

### 影响文件

#### 文案与前端

- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/app/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/lib/i18n.tsx`

#### 配置与文档

- `frontend/package.json`
- `docs/marketing/affiliate-program-profile.md`
- `docs/changelog/CHANGELOG.md#2026-03-25-pro-launch-checkout`

### 验证

- `cd frontend && npm run build` 通过

---

<a id="2026-03-24-score-upgrade"></a>

## 2026-03-24 - score upgrade

日期：2026-03-24

### 概览

这次更新聚焦在评分体系与公开长廊展示逻辑的统一。目标不是把分数抬高，而是让新一轮评图更严格、更稳定，同时避免 `flash` 和 `pro` 因为文案深度不同而出现过大的分差。

### 统一评分口径

- 评分请求的温度下调到 `0`，减少同图重复评测时的随机波动
- 评图流程拆成两步：先锁定分数，再按模式生成文案
- `flash` 与 `pro` 共用同一轮评分结果，不再因为分析长度不同而直接拉开分差
- `flash` 现在输出更短的摘要式建议，`pro` 输出更完整的展开分析

### 长廊展示调整

- 公开长廊继续不设置硬性分数门槛，作品是否展示仍以公开状态和审核通过为准
- 新增“推荐”标记，用相对分位而不是绝对分数来识别当前长廊中的靠前作品
- 推荐逻辑优先参考同 `image_type` 的样本分布，样本不足时回退到全局长廊分布

### 评分版本与用户提示

- 新评图结果新增 `score_version` 字段，当前版本为 `score-v2-strict`
- 旧作品会保留原有结果，并按 `legacy` 版本处理
- 公开长廊新增常驻说明，明确告知用户从 2026 年 3 月 24 日开始评分标准已经升级
- 长廊中的旧作品与新作品可能存在评分口径差异，后续可以按 `score_version` 继续扩展展示策略

### 影响文件

#### 后端

- `backend/app/services/ai.py`
- `backend/app/api/routes.py`
- `backend/app/services/review_task_processor.py`
- `backend/app/schemas.py`

#### 前端

- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/i18n.tsx`

#### 测试

- `backend/tests/test_ai_prompt.py`
- `backend/tests/test_public_gallery_route.py`

### 验证

- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_ai_prompt backend.tests.test_public_gallery_route` 通过
- `cd frontend && npx tsc --noEmit` 通过

---

<a id="2026-03-22-gallery-likes"></a>

## 2026-03-22 - gallery likes

日期：2026-03-22

### 概览

这次更新包含两部分：一是公开影像长廊新增可持久化点赞功能，并明确收紧为“游客只能浏览，不能点赞”；二是补了一轮页面级 SEO 优化，统一 metadata、robots 与 sitemap 策略。

### 公开长廊点赞

- 公开影像长廊卡片新增点赞按钮与点赞数展示
- 点赞状态改为后端持久化存储，不再是前端临时状态
- `/gallery` 返回新增：
  - `like_count`
  - `liked_by_viewer`
- 新增公开长廊点赞与取消点赞接口，支持已登录用户切换点赞状态

### 游客权限收紧

- 游客仍可正常浏览公开影像长廊
- 游客点击点赞时，前端会直接提示需要登录
- 后端接口也会对游客点赞请求返回 `403`，避免绕过前端限制

### 数据与接口

- 新增 `review_likes` 表，用于记录用户对公开长廊作品的点赞关系
- 运行时 schema 初始化会自动创建点赞表与相关索引
- 长廊列表接口在带登录态访问时，会返回当前访问者是否已点赞

### SEO 优化

- 新增 `frontend/src/lib/seo.ts`，集中维护可索引与禁止索引的 robots 配置
- 公开页面补充更完整的标题、描述与 canonical：
  - `/gallery`
  - `/updates`
  - `/affiliate`
  - 示例评图详情页
- 私有或不适合收录的页面统一加 `noindex`：
  - 账户页
  - 登录页
  - 工作台
  - 任务进度页
  - 支付成功页
  - 分享结果页
  - 错误页
- `sitemap` 调整为更偏公开内容导向，补强 `/gallery`、`/affiliate`、`/updates` 等页面权重
- affiliate 页面补充了更适合搜索与转化的说明内容，承接“摄影创作者 / 教学 / 联盟推广”等意图

### 影响文件

#### 后端

- `backend/app/db/models.py`
- `backend/app/db/bootstrap.py`
- `backend/app/schemas.py`
- `backend/app/api/routes.py`

#### 前端

- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/gallery/layout.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/updates/layout.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/seo.ts`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/affiliate/page.tsx`
- `frontend/src/components/marketing/AffiliatePageContent.tsx`
- `frontend/src/app/reviews/[reviewId]/layout.tsx`
- `frontend/src/app/workspace/layout.tsx`
- `frontend/src/app/tasks/[taskId]/layout.tsx`
- `frontend/src/app/account/layout.tsx`
- `frontend/src/app/account/reviews/layout.tsx`
- `frontend/src/app/account/usage/layout.tsx`
- `frontend/src/app/auth/layout.tsx`
- `frontend/src/app/error/layout.tsx`
- `frontend/src/app/payment-success/layout.tsx`
- `frontend/src/app/share/[shareToken]/layout.tsx`
- `frontend/src/app/photos/[photoId]/reviews/layout.tsx`

#### 测试

- `backend/tests/test_public_gallery_route.py`
- `backend/tests/test_gallery_like_route.py`

### 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_*gallery*.py"` 通过
- `cd frontend && npx tsc --noEmit` 通过
- `cd frontend && npm run lint`
  - 未执行完成；当前仓库还未初始化 ESLint，`next lint` 会进入交互式配置

---

<a id="2026-03-21-strict-scoring"></a>

## 2026-03-21 - strict scoring

日期：2026-03-21

### 概览

这次更新聚焦两件事：一是收紧 AI 评图 prompt，让整体打分口径更严格、更稳定；二是修复公开影像长廊头部“已收录”数字在第一页只显示当前页数量的问题。

### 评分标准收紧

- 评图 prompt 升级为 `photo-review-v4-strict`
- 明确要求普通照片主要落在 3-6 分区间
- 7 分必须建立在多个维度都明显扎实的前提上
- 8 分必须接近作品集级别且没有明显短板
- 9-10 分被明确限定为极少出现
- 禁止因为“电影感”“情绪感”“风格化”或被摄体本身讨喜而主动抬分
- system prompt 同步收紧，避免模型在系统层面回到偏宽松口径

### 影像长廊计数修复

- `/gallery` 接口新增返回 `total_count`
- 长廊页头部“已收录”改为显示真实总收录数，而不是当前已加载条数
- 修复后，第一页就会显示完整收录数量，不必翻到下一页才看到正确数字

### 历史筛选日期显示优化

- 将评图历史筛选日期显示统一为 `yyyy/mm/dd`，不再跟随浏览器本地化显示成“日”
- 将可见文本格式与日历选择器拆开，解决 `yyyy/mm/日` 这类显示问题
- 补充明显的非法日期提示，输入无效日期时会显示红框与错误文案，并禁用“应用筛选”
- 将筛选区的双列布局延后到更宽断点，给日期字段留出更稳定的显示空间

### 评图历史缩略图回退修复

- 修复评图历史卡片里缩略图加载失败后仍停留在浏览器破图状态的问题
- 缩略图失败时现在会正确回退到原图 URL
- 只有缩略图和原图都失败时，才进入最终失败态

### 影响文件

#### 后端

- `backend/app/services/ai.py`
- `backend/app/api/routes.py`
- `backend/app/schemas.py`

#### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/components/ui/CachedThumbnail.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/types.ts`
- `frontend/src/app/globals.css`

#### 测试

- `backend/tests/test_ai_prompt.py`
- `backend/tests/test_public_gallery_route.py`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-03-21-strict-scoring`

### 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_ai_prompt.py"` 通过
- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_public_gallery_route.py"` 通过
- `cd frontend && npm exec tsc -- --noEmit` 通过

---

<a id="2026-03-20-gallery"></a>

## 2026-03-20 - gallery

日期：2026-03-20

### 概览

这次更新围绕“公开影像长廊”继续打磨，重点补齐了公开浏览、加入前审核、游客只读、历史记录筛选可用性，以及长廊页卡片清晰度与分页体验。

### 公开影像长廊

- 长廊改为后端统一管理的公开展示模式，不再依赖前端本地 `localStorage`
- 全站用户与游客都可以浏览公开长廊
- 只有通过长廊审核的作品会出现在公开长廊
- 长廊卡片改为优先加载原图，失败时回退到更大的高分辨率缩略图，减少糊图问题
- 长廊页面新增稳定分页，支持按页浏览作品
- 卡片右下角展示作品所属用户标识与用户名，底部文字信息进一步收敛

### 加入长廊与审核

- 评图流程中的图片审核阶段已移除，不再影响正常出结果
- 图片审核改为在“加入影像长廊”前触发
- `IMAGE_AUDIT_ENABLED` 现在专门用于控制“加入长廊前审核”是否启用，默认开启
- 加入长廊时会默认同步加入收藏
- 提示文案明确说明：
  - 公开长廊为全站可见
  - 图片会先经过审核
  - 审核通过后才会进入公开长廊
  - 后续可在历史记录详情页移出长廊
- 游客只能浏览公开长廊，不能提交作品到长廊

### 结果页长廊引导

- 结果页中的“加入影像长廊”引导卡片现在只对总分 6 分及以上作品显示
- 卡片文案调整为更积极的鼓励式表达，同时保留审核与收藏规则说明
- 从公开长廊进入详情页时，个人操作按钮仍保持隐藏，避免公共展示页出现个人管理入口

### 历史记录页优化

- 调整筛选区日期输入框宽度，避免日期显示不完整
- 修复暗色主题下原生日期选择器对比度不足的问题
- 历史记录列表补充“长廊审核未通过”状态标签，便于快速识别

### 影响文件

#### 后端

- `backend/app/api/routes.py`
- `backend/app/core/config.py`
- `backend/app/services/review_task_processor.py`
- `backend/app/db/models.py`
- `backend/app/db/bootstrap.py`
- `backend/app/schemas.py`

#### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/i18n.tsx`

#### 文档

- `docs/changelog/CHANGELOG.md#2026-03-20-gallery`

### 验证建议

- `cd frontend && npm run build`
- `e:\Project Code\PicSpeak\.venv\Scripts\python.exe -m unittest backend.tests.test_review_history_helpers backend.tests.test_settings_defaults`

---

<a id="2026-03-20"></a>

## 2026-03-20

日期：2026-03-20

### 概览

这次更新围绕“历史记录与复盘能力”继续补齐了前后端闭环，并新增了收藏能力与站内整理入口。重点不在大改视觉，而在把已有后端能力真正接到前端，让历史筛选、分享导出、再次分析、收藏沉淀都能直接使用。

### 后端能力接入与同步

#### 历史记录

- 支持分页查询历史记录
- 支持按时间范围筛选
- 支持按评分区间筛选
- 支持按图片类型筛选
- 历史卡片同步展示图片类型、分享状态、关联复盘状态

#### 结果分享与导出

- 结果页分享按钮改为调用后端分享接口
- 分享时使用独立 `share_token` / 公开页面地址
- 结果页导出按钮改为调用后端简版导出接口
- 导出内容改为后端结构化结果数据，便于复用和归档

#### 再次分析

- 结果页“再次点评”会携带 `source_review_id`
- 工作台支持复用上一条分析对应的照片直接再次发起分析
- 同时保留切换为重新上传新照片的入口

### 收藏能力

#### 结果页

- 新增收藏 / 取消收藏按钮
- 收藏状态写入后端 `review meta`
- 收藏操作会即时更新当前页面状态反馈

#### 我的收藏

- 新增“我的收藏”页面
- 展示已收藏的评图结果
- 支持在收藏列表中直接取消收藏
- 入口放到头像旁下拉菜单中，避免主导航过载

### 导航与页面整理

- 首页保留主转化路径不变
- 新增低曝光“更新记录”入口，不抢占主按钮注意力
- 新增站内更新记录页，方便查看近期变更

### 影响文件

#### 文档

- `docs/changelog/CHANGELOG.md#2026-03-20`

#### 前端

- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/account/favorites/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`

### 验证

- `cd frontend && npm run build` 通过
