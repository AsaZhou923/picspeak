# PicSpeak Update Log

日期：2026-04-11

## 概览

本次更新包含三块主要改动：新增多语言博客模块、画廊排序功能和深色主题色值校准。博客模块为产品首次引入内容营销入口，画廊排序让用户可以自由选择浏览方式，主题色调整让深色模式更温暖耐看。

- 新增 `/[locale]/blog` 博客模块，含 6 篇三语（中/英/日）SEO 文章
- 画廊新增排序选项：推荐、最新、最高分、最多赞
- 深色主题色值从中性灰调整为暖褐色调，多处硬编码 `rgba()` 改用 CSS 变量
- 后端代理 URL 构造适配反向代理场景（`X-Forwarded-*` 头）
- 画廊卡片图片加载增加 fallback 链路，提升可靠性

## 博客模块

- 新增 `frontend/src/lib/blog-data.ts`，包含 6 篇文章的三语完整内容：AI 日常练习、构图检查、反馈转清单、光线错误、色彩原则、街头摄影工作流
- 新增 `frontend/src/app/[locale]/blog/` 路由组件：`page.tsx`（索引页 SSR Metadata）、`BlogIndexClient.tsx`（客户端列表）、`[slug]/page.tsx`（文章详情 SSR Metadata）、`[slug]/BlogPostClient.tsx`（客户端详情）
- Header、MarketingHeader、Footer 均新增 Blog 导航入口，根据当前 locale 生成正确的链接
- 首页底部新增博客入口（带 `BookOpenText` 图标），与现有 Updates 入口并列
- `sitemap.ts` 扩展：为每个 locale 生成博客索引条目和每篇文章条目，包含 `alternates` hreflang
- `route-shell.ts` 将 `/blog` 加入 marketing 路由白名单，无需登录即可访问
- Header 语言切换器增加 locale 路由感知：在 `/zh/blog` 等 locale 前缀路由上切换语言时，会导航到对应 locale 的等效路径

## 画廊排序

- 后端 `list_public_gallery` 新增 `sort` 查询参数，支持 `default`（综合热度）、`latest`（发布时间）、`score`（最终评分）、`likes`（点赞数）
- 排序逻辑统一复用已有的三段式游标分页机制，`primary_expr` 替代原先写死的 `rank_score`
- 前端 `GalleryFilters` 组件新增排序按钮组（Zap/Clock/Star/Heart 图标），当前选中项高亮为金色
- 前端 `api.ts` 和 `types.ts` 新增 `sort` 字段透传
- i18n 三语新增 `gallery_sort_default/latest/score/likes` 翻译键
- 后端新增测试用例验证排序参数正确传递

## 深色主题与样式统一

- `globals.css` 深色主题 9 个基础色值从中性灰（`8 8 8` ~ `46 46 46`）调整为暖褐色调（`17 16 15` ~ `64 58 52`），整体色温更温暖
- 多个页面和组件中硬编码的 `rgba(18,16,13,…)` 和 `#050505`、`#111111`、`#2b2722` 等色值统一替换为 `rgb(var(--color-surface)/…)`、`bg-void/95`、`bg-surface`、`border-border` 等 CSS 变量写法
- 受影响组件：`gallery/page.tsx`、`reviews/[reviewId]/page.tsx`、`account/favorites/page.tsx`、`account/reviews/page.tsx`、`workspace/page.tsx`、`updates/page.tsx`、`ProPromoCard.tsx`、`ActivationCodeModal.tsx`、`GalleryFilters.tsx`
- Header 和 MarketingHeader 的 `isActive` 判断改为路径前缀匹配，子页面也能正确高亮导航项

## 后端代理 URL 适配

- 新增 `_request_origin()` 和 `_request_url_for()` 辅助函数，读取 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 头
- `_build_photo_proxy_url` 改用 `_request_url_for` 构造 URL，在反向代理（如 Nginx）后面也能生成正确的 `https://` 公网 URL
- 非 localhost 环境自动升级为 HTTPS
- 新增单元测试 `test_build_photo_proxy_url_prefers_https_for_forwarded_requests`

## 画廊卡片图片加载改进

- `GalleryCardImage` 从 `next/image` 的 `Image` 组件彻底切换到原生 `<img>`（之前部分场景已切换）
- 新增 fallback 链路：优先加载 `photo_thumbnail_url`，失败后回退到 `photo_url`，再次失败才显示占位
- 添加 `loading="lazy"` 和 `decoding="async"` 属性

## 其他

- `.gitignore` 新增 `.claude/` 目录

## 首页更新记录同步

首页 `page.tsx` 底部同时展示博客入口和更新记录入口，`updates_hint_latest` 仍指向当前最新更新条目。本次未更改 `updates-data.ts` 中的条目内容，但需要在下方步骤中同步新条目。

## 影响文件

### 后端

- `backend/app/api/routes.py`
- `backend/tests/test_public_gallery_route.py`

### 前端

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

### 文档/配置

- `.gitignore`
- `docs/changelog/update-log-2026-04-11-blog-gallery-sort-theme.md` (本文)

## 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `& "E:\Project Code\PicSpeak\.venv\Scripts\python.exe" -m unittest discover -s backend/tests -p "test_*.py"`
