# PicSpeak Update Log

日期：2026-04-13

## 概览

这次更新给博客文章加上了公开浏览次数，并把计数贯通到数据库、后端接口和前端页面。用户现在在博客列表页和文章详情页都能直接看到每篇文章被浏览了多少次，进入文章详情页时会自动记一次浏览。

- 博客详情页新增浏览计数写入，打开文章会自动增加一次浏览数
- 博客列表页和文章详情页都开始展示文章浏览次数
- 后端新增独立的 `blog_post_views` 计数表与公开接口，按文章 `slug` 维护浏览量
- 前端增加 5 秒去抖，避免极短时间内重复进入同一篇文章时连续累加

## 博客浏览统计

- 新增 `blog_post_views` 表，字段包括 `slug`、`view_count`、`created_at`、`updated_at`
- 后端新增 `GET /api/v1/blog/views`，支持按多个 `slug` 批量读取浏览数
- 后端新增 `POST /api/v1/blog/{slug}/views`，用于文章详情页进入时递增浏览数
- `slug` 在后端会统一转成小写并做格式校验，避免异常值进入计数表

## 前端展示

- 博客列表页卡片和精选文章区域新增浏览次数显示
- 博客详情页标题区新增浏览次数显示
- 相关文章卡片也会同步展示各自的浏览次数
- 前端通过 `sessionStorage` 做 5 秒节流，保证“点进去一次记一次”的同时，避免短时间重复触发造成异常放大

## 首页更新记录同步

- `/updates` 页面已新增本次更新条目，并放在三种语言列表的最前面
- 首页底部“更新记录”入口的最新提示文案已同步到本次“博客浏览次数”更新主题
- 当前首页实现通过 i18n 文案控制提示内容，因此本次同步点落在 `i18n-en.ts`、`i18n-zh.ts` 和 `i18n-ja.ts`

## 影响文件

### 后端

- `backend/app/api/routes.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/schemas.py`
- `backend/tests/test_blog_post_views.py`
- `create_schema.sql`

### 前端

- `frontend/src/app/[locale]/blog/BlogIndexClient.tsx`
- `frontend/src/app/[locale]/blog/[slug]/BlogPostClient.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/blog-view-stats.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-ja.ts`

### 文档

- `docs/changelog/update-log-2026-04-13-blog-view-counts.md`

## 验证

- `.\.venv\Scripts\python.exe -m pytest backend/tests/test_blog_post_views.py backend/tests/test_public_gallery_route.py`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
