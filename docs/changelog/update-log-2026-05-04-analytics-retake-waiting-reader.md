# PicSpeak Update Log

日期：2026-05-04

## 概览

这次更新把 PicSpeak 的“拍后反馈 -> 下一轮行动 -> 数据复盘”链路补得更完整：用户在点评结果里可以把具体改进动作带回工作台，等待 AI 点评或 AI 生图时可以直接在右侧窗口阅读全文；运营侧则能在产品分析周报里看到 AI Create、Prompt Library、复拍贡献、locale 和数据健康拆分。

- 评图和生图任务等待页新增右侧 Blog 阅读窗口，窗口内可切换推荐文章并阅读全文，不再需要跳转离开等待页
- 点评详情页的下一轮拍摄清单现在会识别构图、光线、色彩、感染力或技术维度，并把选中的动作带回工作台
- 工作台支持携带来源点评、复拍意图、下一轮动作、维度和来源生成图信息，后续评图事件会写入这些上下文
- 评图历史页新增“下一轮练习”主题，Free 使用最近窗口，Pro 使用已加载的长周期记录
- 产品分析后端新增 AI Create 漏斗、Prompt Library 来源、复拍贡献、locale 拆分和数据健康检查，并提供产品经营周报导出脚本

## 等待页内嵌阅读

- 新增 `WaitingBlogWindow` 组件，复用现有三语 Blog bundle，在任务等待侧栏中渲染文章切换按钮、文章 intro、核心结论、章节正文和 bullet 列表
- `/tasks/[taskId]` 和 `/generation-tasks/[taskId]` 在非失败、无错误的等待状态下使用双栏布局：左侧保留原有进度和等待提示，右侧显示内嵌阅读器
- 等待阅读窗口针对评图与生图分别挑选不同文章主题，让评图等待更偏构图/光线/色彩检查，让生图等待更偏复拍计划和 prompt 方向整理
- 补充中英日等待阅读文案，并移除跳转式“打开文章 / 查看全部”交互，避免用户等待过程中离开任务页

## 复拍与成长闭环

- `buildNextShootChecklist()` 会为每条建议推断关联维度，优先从建议文本里的关键词识别，无法识别时回落到当前评分最低的维度
- 点评详情的成长面板新增“带到工作台”按钮；点击后会携带来源点评、复拍意图、动作文本和维度进入 `/workspace`
- “上传新照片再评一次”会默认带入第一条下一轮动作，并记录 `next_shoot_action_clicked` 事件，区分 checklist 触发和新照片面板触发
- 工作台新增复拍目标提示卡，展示来源点评、重点维度和本轮要验证的动作；发起评图时同步写入来源点评、复拍意图、动作、维度和来源生成图上下文
- 同图重跑会标记为 `same_photo_fix`，新照片复拍会标记为 `new_photo_retake`，便于后端周报区分复拍贡献
- 点评详情页在存在 `source_review_id` 时显示来源点评上下文，并提供回到来源点评的对照入口
- 评图历史页新增下一轮练习主题：根据趋势决定 recover / stabilize / extend，并在没有反复低于 7 分的弱项时使用平均最低维度作为练习候选

## 产品分析与周报

- 产品分析事件目录新增 `prompt_library_viewed` 与 `next_shoot_action_clicked`，并把 `prompt_library` 纳入来源归因和内容转化周报
- `build_stage_a_snapshot()` 现在输出 AI Create 漏斗、locale 拆分、复拍贡献和数据健康检查，markdown 渲染同步增加对应章节
- AI Create 漏斗覆盖 page view、Prompt Library、模板选择、prompt 打开、生成请求、成功、失败、下载、复拍使用、额度耗尽和 credit pack checkout
- 复拍贡献拆分会统计整体评图、复拍/再分析评图、生成图用于复拍，以及 same-photo fix / new-photo retake 的下一轮动作点击
- locale 拆分按 zh / en / ja / unknown 统计活跃用户、工作台进入、评图、生图和 checkout
- 新增 `backend/scripts/export_product_analytics_weekly_report.py`，用于从数据库导出产品经营周报；数据库不可用时会生成带说明的空窗口回退报告

## 首页更新记录同步

- `/updates` 三语 JSON 新增本次更新记录，并指向本 changelog
- 首页底部“更新记录”入口三语 hint 改为产品分析、复拍练习和等待阅读窗口主题
- README 与 Claude 项目说明同步补充本次新增的产品经营周报脚本、复拍目标回流、等待页内嵌阅读和最新 changelog 链接

## 影响文件

### 后端

- `backend/app/services/product_analytics.py`
- `backend/scripts/export_product_analytics_weekly_report.py`
- `backend/tests/test_product_analytics_service.py`

### 前端

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

### 测试与文档

- `frontend/test/review-growth.test.ts`
- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `docs/changelog/update-log-2026-05-04-analytics-retake-waiting-reader.md`
- `CLAUDE.md`
- `README.md`
- `README.zh-CN.md`

## 验证

- `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_product_analytics_service.py`
- `cd frontend && node --test .\test\*.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `Get-FileHash` 对比仓库 changelog 与外部归档副本 SHA256 一致
