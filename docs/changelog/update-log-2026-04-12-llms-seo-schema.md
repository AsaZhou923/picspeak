# PicSpeak Update Log

日期：2026-04-12

## 概览

本次更新重点强化 AI 搜索可见性：新增 llms.txt 标准文件帮助 AI 系统理解网站结构与内容，补齐 Person 和 SoftwareSourceCode 等 Schema.org 结构化数据，并为更新记录页面增加多语言路由。同时优化了导航栏布局和移动端体验。

- 新增 `/llms.txt` 和 `/.well-known/llms.txt` 路由，遵循 AI 搜索引擎标准
- 补齐 Person、SoftwareSourceCode 等 Schema.org 结构化数据
- 新增 `/[locale]/updates` 多语言更新记录路由
- 优化 Header 导航布局，增加移动端首页入口
- 简化路由判断逻辑，移除条件性 Provider 注入
- 更新示例图片 alt 文案，提升无障碍访问质量
- `.gitignore` 新增 GEO 审核报告忽略规则

## llms.txt 实现

- 新增 `frontend/public/llms.txt` 静态文件，包含产品定位、功能、定价、关键 URL、博客主题等结构化信息
- 新增 `frontend/src/lib/llms.ts`，提供 `getLlmsText()` 函数动态生成内容
- 新增 `frontend/src/app/llms.txt/route.ts` 和 `frontend/src/app/.well-known/llms.txt/route.ts`，提供两个标准访问路径
- 响应头包含 `text/plain; charset=utf-8` 和 1 小时缓存策略
- 新增 `siteConfig.repositoryUrl`、`siteConfig.social`、`siteConfig.author` 配置项，供 Schema 和 llms.txt 共用

## Schema.org 结构化数据增强

### 首页
- 新增 Person schema（`@id`、name、alternateName、jobTitle、description、email、sameAs）
- 新增 SoftwareSourceCode schema（codeRepository、programmingLanguage、runtimePlatform、author、publisher）
- SoftwareApplication 增加 `sameAs`（X、GitHub）、`isAccessibleForFree`、`creator` 字段

### 博客索引页
- Blog schema 增加 `author`（@id 引用）、`publisher` 字段
- 新增 Person schema，与首页共用 author 信息

### 博客文章页
- BlogPosting schema 增加 `inLanguage`、`url`、`isPartOf`（引用 Blog）、`author`（@id 引用）
- 新增 Person schema

### 布局组件
- SoftwareApplication schema 增加 `sameAs`、`isAccessibleForFree`、`creator` 字段

## 多语言更新记录页面

- 新增 `frontend/src/app/[locale]/updates/page.tsx`，提供 `/zh/updates`、`/en/updates`、`/ja/updates` 路由
- 提取 `frontend/src/components/marketing/UpdatesPageContent.tsx` 共享组件，接收 `homeHref` 参数
- 原 `/updates` 页面改为调用共享组件，传入 `homeHref="/"`
- 更新记录页面新增三语 metadata（title、description、OpenGraph、alternates）
- `sitemap.ts` 新增各 locale 的 `/updates` 条目，带完整 hreflang alternates
- 原 `/updates` 条目的 alternates 修正为指向正确的 locale 路径

## Header 导航优化

- Logo 旁新增移动端首页链接（仅移动端显示）
- 快捷菜单（QuickLinksMenu）重构：
  - 非访客用户的"历史记录"移至快捷菜单
  - 移动端底部导航新增博客入口（BookOpen 图标）
  - 移动端"使用量"入口改为始终显示
- 桌面端导航简化：使用量链接不再受 plan 条件约束
- 博客链接统一使用 `/${locale}/blog` 格式，确保语言前缀正确

## 路由判断简化

- `route-shell.ts` 重构为通用路径匹配：
  - 使用正则 `/(zh|en|ja)` 提取并移除 locale 前缀
  - 路径标准化后再判断是否为 marketing 路由
- `AppProviders.tsx` 移除条件性 Provider 注入，统一使用完整 Provider 栈
- 修复 marketing 路由子页面（如 `/zh/blog/article`）的高亮判断

## 内容更新

- 首页示例图片 alt 文案更新，从"蓝天下的秋日银杏树"改为详细描述金色时刻逆光银杏树冠的光影特征与色温对比
- 三语（中/英/日）同步更新，提升无障碍访问质量和 SEO 相关性

## 首页更新记录同步

首页 `page.tsx` 底部更新记录入口链接从 `/updates` 改为 `/${locale}/updates`，与新增的多语言路由保持一致。

## 影响文件

### 前端

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

### 文档/配置

- `.gitignore`
- `docs/changelog/update-log-2026-04-12-llms-seo-schema.md` (本文)

## 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
