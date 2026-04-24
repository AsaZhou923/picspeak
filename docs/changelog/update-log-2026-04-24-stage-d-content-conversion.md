# PicSpeak Update Log

日期：2026-04-24

## 概览

这次更新围绕“内容阅读和公开长廊如何回到评图工作台”展开：Blog、Gallery 和首页新增更明确的工作台入口，并补齐内容来源转化事件与周报口径，方便后续判断哪些内容真正带来了上传和首评完成。

- Blog 文章底部会按文章题材生成同类点评和上传入口
- Gallery 卡片新增同题材练习和“用这套标准点评我的照片”入口
- 首页新增按用户意图分流的入口，区分新用户、回访用户和内容读者
- 前后端新增 `content_workspace_clicked` 事件，串起内容入口点击、工作台进入、上传和首评完成
- 后端新增内容来源转化周报导出脚本，并让 API 审计日志写入不再阻塞主请求

## 内容入口回流

- `frontend/src/lib/content-conversion.ts` 统一维护 Blog、Gallery 和首页入口文案、归因参数与 `/workspace` 跳转链接
- Blog 详情页底部 CTA 从固定“下一步”改为按文章 slug 匹配题材，例如构图、光线、街拍和色彩判断
- Blog CTA 会携带 `source=blog`、`entrypoint`、`content_slug` 和 `image_type`，并上报 `content_workspace_clicked`
- Gallery 卡片会根据作品题材生成练习入口，并把 `gallery_review_id`、`image_type` 和点击入口写入归因参数
- Gallery 空状态 CTA 也接入同一套 `gallery_practice` 入口，避免空列表场景丢失来源
- 首页新增三类入口：首次上传、继续历史、从内容方法进入工作台

## 内容来源转化统计

- 产品分析事件类型新增 `content_workspace_clicked`
- 后端事件目录将该事件标为 Stage D，并在来源拆解中新增工作台点击数、上传数、点击率和上传转化率
- 新增 `content_conversion_weekly` 快照，分别计算 Blog 和 Gallery 的浏览访客、工作台点击、工作台进入、上传、发起点评和查看结果
- Blog 周报口径额外输出文章到工作台点击率、文章来源首评完成率
- Gallery 周报口径额外输出长廊到工作台点击率、长廊到上传转化率
- `backend/scripts/export_content_conversion_weekly_report.py` 可导出内容来源转化周报，数据库不可用时会生成零基线回退报告并记录原因

## 请求审计稳定性

- `/healthz`、`/docs`、`/openapi.json`、`/redoc` 不再写入 API 审计日志，减少高频非业务端点噪音
- 审计日志持久化改为 `asyncio.to_thread` 后台执行，避免同步数据库写入阻塞 FastAPI 事件循环
- 审计写入失败仍会 rollback 并记录日志，不影响原请求响应

## 首页更新记录同步

- `/updates` 最新一条记录同步为本次“内容来源转化与工作台入口”更新
- 首页底部“更新记录”提示文案同步指向本次 Blog、Gallery 和首页入口转化更新

## 影响文件

### 后端

- `backend/app/main.py`
- `backend/app/services/product_analytics.py`
- `backend/scripts/export_content_conversion_weekly_report.py`
- `backend/tests/test_product_analytics_service.py`

### 前端

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

### 文档

- `docs/changelog/update-log-2026-04-24-stage-d-content-conversion.md`

## 验证

- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_product_analytics_service`
- `cd frontend && node --test test/content-conversion.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run lint`
