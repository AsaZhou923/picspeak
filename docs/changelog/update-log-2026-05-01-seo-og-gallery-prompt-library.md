# PicSpeak Update Log

日期：2026-05-01

## 概览

这次更新围绕 PicSpeak 的公开内容可索引性和 AI 搜索可见性展开：在完成全量 SEO / GEO 审计后，把 AI 摄影点评、AI Create 生图和公开长廊三条产品线统一到 metadata、sitemap、llms.txt、结构化数据和站内更新入口中。

- 新增真实产品 Open Graph 图，尺寸为 `1200x630`，同时呈现 AI critique、AI Create 和 gallery example
- `/gallery` 从纯客户端页面改为服务端可见的公开摘要加客户端长廊交互，降低抓取器只看到空壳的风险
- 新增 `/generate/prompts` 和 30 个静态提示词案例页，承接 “GPT Image 2 prompt examples” 等长尾搜索意图
- 修正多语言 locale 初始化、语言切换、hreflang、sitemap 和私有生成页 noindex 边界
- 补齐 SEO / i18n / prompt library 回归测试，并修复 Node 测试里的 TypeScript 扩展名解析问题

## SEO / GEO 与索引边界

- 新增 `docs/seo/seo-audit-2026-05-01.md`，记录技术 SEO、多语言 hreflang、结构化数据、AI 可引用性和索引策略的全量审计结果
- `siteConfig` 的站点标题、描述、关键词和 OG 配置扩展到“AI 摄影点评 + GPT Image 2 视觉参考生成”双产品面
- `frontend/public/og-product.png` 替换原先只偏 logo 的社交预览资产，明确覆盖点评、生图和长廊示例
- `/generate` 新增独立 metadata、Open Graph、Twitter card 和 `SoftwareApplication` JSON-LD
- `/generation-tasks/[taskId]` 与 `/generations/[generationId]` 新增 noindex layout，避免任务流和登录态结果页被误索引
- `robots.ts`、`sitemap.ts`、`llms.ts` 与 `frontend/public/llms.txt` 同步更新，明确公开入口、AI crawler 访问策略、价格口径和引用说明
- sitemap 覆盖 `/generate`、`/generate/prompts`、30 个提示词详情页、根博客 canonical 和公开功能页 canonical，同时修正非等价页面错误 hreflang

## Gallery 服务端首屏摘要

- `/gallery` 改为服务端页面包装，先输出 `CollectionPage` JSON-LD 和静态 SEO hero，再挂载原有客户端长廊功能
- 新增 `GallerySeoHero` 和三语 `gallery-seo-copy`，让首屏在数据接口加载前也能提供可读的点评案例摘要
- Gallery metadata 改为单页 canonical / x-default，避免把混合语言公共页误标成 `/zh`、`/en`、`/ja` 的等价页面
- 静态摘要文案覆盖五维评分卡、长廊到练习闭环、摄影学习档案，并保留进入点评和提示词案例页的入口

## AI Create Prompt Library

- 新增 `/generate/prompts` 可索引提示词库首页，按 photography、portrait、poster、product、ui、experimental 等分类输出静态案例卡
- 新增 `/generate/prompts/[id]` 静态详情页，30 个 GPT Image 2 案例都带独立 metadata、canonical、示例图、来源署名、完整 prompt 和 `CreativeWork` JSON-LD
- AI Create 页面里的示例库卡片增加 crawlable 详情页入口，用户仍可在产品内继续套用案例生成
- `prompt-examples.ts` 新增本地化标题、分类标签、摘要截断和案例读取 helper，保护中英日可见标题不再出现编码异常

## 多语言与运行时一致性

- locale 逻辑统一支持 `zh`、`en`、`ja`，并通过 `picspeak-locale` cookie 与请求头把用户语言偏好传给服务端首屏
- `AppProviders` 支持接收服务端初始 locale 与翻译包，根 layout 按请求语言设置 `html lang`
- Header 语言切换在非 locale 路由上也会刷新页面，确保 `/gallery`、`/generate/prompts` 这类单 URL 页面立即显示目标语言
- 修复内容转换、Pro 转化和多语言测试依赖的 `.ts` extensionless import，避免全量 Node 测试在 ESM 解析阶段失败

## 首页更新记录同步

- `/updates` 三语 JSON 已新增本次更新记录，并指向本 changelog
- 首页底部“更新记录”入口三语 hint 已从运行时迁移更新切换到本次 SEO、OG、长廊和提示词库主题
- README 与 Claude 项目说明同步补充 AI Create prompt library、公开 SEO/GEO 入口和最新 changelog 链接

## 影响文件

### 前端

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

### 测试

- `frontend/test/gallery-seo-copy.test.ts`
- `frontend/test/generation-prompt-examples.test.ts`
- `frontend/test/seo-alternates.test.ts`
- `frontend/test/seo-assets.test.ts`
- `frontend/tsconfig.json`
- `frontend/tsconfig.typecheck.json`

### 文档

- `docs/seo/seo-audit-2026-05-01.md`
- `docs/changelog/update-log-2026-05-01-seo-og-gallery-prompt-library.md`
- `CLAUDE.md`
- `README.md`
- `README.zh-CN.md`

## 验证

- `cd frontend && node --test "test/*.test.ts" "src/features/generations/*.test.ts"`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd backend && ..\.venv\Scripts\python.exe -m pytest`
- 本地 HTML 抽查：设置 `picspeak-locale=zh` 后，`/gallery` 首屏包含中文静态摘要，`/generate/prompts` 包含中文 GPT Image 2 提示词案例标题
- `Get-FileHash` 对比仓库 changelog 与外部归档副本 SHA256 一致
