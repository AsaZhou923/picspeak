# PicSpeak Update Log

日期：2026-04-26

## 概览

这次更新把首页、博客、更新记录和评图说明从“大文件内联内容”整理成更容易维护的数据与组件边界，同时让首页在根路由和多语言路由下都能带着初始翻译内容渲染。后端同步收紧 AI 评图 prompt 模块与生图任务状态读取，避免只读查询触发事务提交。

- 首页主体从 `app/page.tsx` 抽成 `HomePageClient`，根路由默认带英文初始翻译，多语言首页带对应语种初始翻译
- Blog、Updates 和评图维度说明迁入 `src/content` JSON bundle，页面读取逻辑保持原有公开内容但更容易校验
- Header 和 MarketingHeader 复用统一的右侧控制区，语言、主题、登录态与快捷入口逻辑集中维护
- 应用 Provider 增加错误边界，认证 ready 等待从轮询改为 waiter 集合，减少页面挂起时的无效轮询
- 后端 AI prompt 抽到 `ai_prompts.py`，生成任务状态读取不再 commit，新建 pending 生图任务以 `next_attempt_at = null` 立即等待认领

## 首页与多语言渲染

- `frontend/src/app/page.tsx` 现在只负责根路由包装，使用 `I18nProvider defaultLocale="en"` 和 `getInitialTranslations('en')` 提供首屏英文内容
- `frontend/src/app/[locale]/page.tsx` 改为 async page，读取路由参数后传入对应语种的 `initialMessages`
- 首页实际 UI、结构化数据、FAQ、创作入口、额度区、联系方式与更新记录入口迁入 `frontend/src/components/home/HomePageClient.tsx`
- 首页底部仍保留 Blog 与 Updates 两个入口，Updates 的最新提示通过三语 `updates_hint_latest` 文案同步到本次主题

## 内容 bundle 与 SEO 数据

- `frontend/src/lib/blog-data.ts` 从 `frontend/src/content/blog/{zh,en,ja}.json` 读取 Blog UI 与文章正文，避免 1300 行内联内容堆在代码文件里
- `frontend/src/lib/updates-data.ts` 从 `frontend/src/content/updates/{zh,en,ja}.json` 读取更新记录，并返回 entry / section / items 的拷贝，避免调用方误改共享数据
- `frontend/src/lib/review-page-copy.ts` 将题材维度说明迁到 `frontend/src/content/review/dim-descriptions.json`
- Blog 文章页的 JSON-LD 补充 `abstract`、真实 `inLanguage`、OG image、免费访问标记和关键词 `about` 结构
- Sitemap 生成 Blog URL 时按各 locale 分别读取文章列表，避免只用英文 slug 数据推导全部语言

## 导航、容错与认证稳定性

- `frontend/src/components/layout/HeaderControls.tsx` 集中承载语言切换、主题切换、快捷菜单、登录/注册、用户菜单和 legacy logout
- `Header.tsx` 与 `MarketingHeader.tsx` 复用 `HeaderRightControls`，减少两套 header 的重复逻辑
- MarketingHeader 的桌面与移动导航把原 affiliate 入口替换为 Usage / Quota，方便用户直接查看额度
- `AppProviders` 外层加入 `AppErrorBoundary`，出现客户端渲染错误时展示三语重试界面，而不是让整页静默崩掉
- `auth-context` 的 `waitForReady` 改为注册一次性 waiter，并保留 10 秒兜底 timeout，替代 25ms interval 轮询

## 后端 AI 与生图任务

- `backend/app/services/ai.py` 保留请求、评分和响应处理逻辑，prompt 常量与构造函数迁入 `backend/app/services/ai_prompts.py`
- `GET /generation-tasks/{task_id}` 查询状态时移除多余 `db.commit()`，只读接口不会再提交当前 session
- `make_generation_task` 创建 pending 任务时将 `next_attempt_at` 设为 `None`，与 claim 逻辑的 immediate claim 语义对齐
- 后端测试补上“读取任务状态不 commit”和“新建任务 next_attempt_at 为空”的回归用例

## 首页更新记录同步

- `/updates` 最新一条记录已同步到本次“内容 bundle、首页 SSR 翻译与任务稳定性”更新
- 首页底部“更新记录”提示文案已改为指向本次内容架构与首页渲染更新

## 影响文件

### 后端

- `backend/app/api/routers/generations.py`
- `backend/app/db/session.py`
- `backend/app/services/ai.py`
- `backend/app/services/ai_prompts.py`
- `backend/app/services/image_generation_task_processor.py`
- `backend/tests/test_image_generation_routes.py`
- `backend/tests/test_image_generation_task_processor.py`

### 前端

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

### 文档

- `docs/changelog/update-log-2026-04-26-content-bundles-and-home-ssr.md`

## 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_image_generation_*.py"`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
