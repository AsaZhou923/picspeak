# PicSpeak Update Log

日期：2026-04-10

## 概览

这次更新主要解决两个问题：一是让中文、英文、日文用户可以通过独立 URL 直接进入对应语言首页，并把多语 SEO 信号补完整；二是把首页、公开长廊、评图页和工作台里零散的多语文案与大块页面逻辑收拢整理，方便继续迭代。

- 新增 `/zh`、`/en`、`/ja` 三个语言固定首页，进入后会直接锁定当前语言
- 首页、公开页面 metadata、`hreflang`、`sitemap` 和 JSON-LD 同步补齐多语 SEO 入口
- 首页价格区、更新记录、联系方式，以及工作台/评图页/长廊的多语文案统一收拢进 i18n
- 公开长廊页拆分为筛选、卡片、分页等独立组件，保留现有体验的同时降低后续维护成本

## 多语言首页与 SEO 路由

- 新增 `frontend/src/app/[locale]/` 路由层，支持 `/zh`、`/en`、`/ja` 三个语言固定首页
- 语言固定首页会通过内层 `I18nProvider` 直接写入当前 locale，避免继续依赖浏览器检测或旧的本地缓存状态
- 语言固定首页为每种语言分别配置了标题、描述、关键词、Open Graph、Twitter 卡片和 JSON-LD
- 根首页、`/affiliate`、`/gallery`、`/updates`、公开评图示例页和 `sitemap` 也同步带上 `canonical` 与 `alternate languages`
- `route-shell` 现在把 `/zh`、`/en`、`/ja` 识别为 marketing 路由，确保这些直达首页继续沿用营销页壳层逻辑

## 页面文案与组件整理

- 首页里原先写死在组件内部的价格、促销、联系方式和“更新记录”提示，改为统一从翻译字典读取
- 工作台“复用上一张照片”区域、评图页收藏返回文案、Pro 转化卡、长廊 SEO 说明都改为使用三语 i18n 键
- 公开长廊页把筛选、卡片、分页抽成 `GalleryFilters`、`GalleryCard`、`GalleryPagination` 等独立组件
- 长廊页内部原先散落在页面文件中的本地化文案与小工具函数得到收敛，页面主体保留数据流和交互编排职责
- 工作台上传预览、模式选择和 CTA 动效也做了同批视觉整理，但不改变已有评图流程

## 首页更新记录同步

- `/updates` 最新一条记录已切换到本次“多语言首页直达、SEO 路由与长廊页面重构”更新
- 首页底部“更新记录”提示已改为指向本次 2026-04-10 更新主题

## 影响文件

### 前端

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

### 文档

- `docs/changelog/update-log-2026-04-10-locale-seo-and-gallery-refactor.md`
- `docs/changelog/CHANGELOG_WORKFLOW.md`

## 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
