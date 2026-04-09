# PicSpeak Update Log

日期：2026-04-09

## 概览

这次更新围绕公开影像长廊的排序质量、图片加载稳定性和前端质量门展开，目标是让用户更容易先看到分数更高、同时又较新的作品，并且避免长廊卡片在开发环境里出现图片加载失败或前端 lint 无法运行的问题。

- 公开影像长廊改为按“分数优先、发布时间次优先”的组合热度排序
- 长廊分页游标升级为稳定游标，避免组合排序下翻页重复或漏项
- 修复 `next/image` 远程源配置缺失导致的开发环境报错
- 长廊卡片图片恢复为更稳定的原生 `<img>` 渲染路径，避免缩略图可请求但不显示
- 前端补齐 ESLint 配置，`npm run lint` 不再进入交互模式

## 影像长廊排序

- 后端 `/gallery` 查询不再只按 `gallery_added_at` 倒序，而是改为组合排序分
- 排序分由 `final_score` 和发布时间新鲜度共同组成，其中分数权重更高
- 当前权重为：分数 `0.6`，时间 `0.4`
- 时间衰减采用 `45` 天半衰期，越新的作品会获得更高的新鲜度加成
- 这样可以保证明显高分的作品优先，同时让分数接近时的新作品更容易排到前面

## 分页与游标稳定性

- 长廊排序改为组合分后，原先只基于发布时间的分页游标已经不够稳定
- 新游标现在同时编码：组合排序分、`gallery_added_at`、数据库 `id`
- 翻页过滤逻辑也同步改为三段式比较，避免出现同一张卡片在翻页时重复出现，或某些卡片被跳过
- 兼容旧游标格式，旧的仅时间游标仍可解析

## 图片加载与前端质量门

- `next.config.js` 现在显式允许 `http://localhost:8000` 和 `http://127.0.0.1:8000` 作为图片源，并会自动吸收 `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SITE_URL`
- 长廊卡片在尝试改为 `next/image` 后出现了可请求但不可见的渲染问题，因此主图、背景图和头像恢复成原生 `<img>`，优先保证稳定显示
- 评图详情页和缓存缩略图组件保留了原生 `<img>` 的 ESLint 例外说明，因为这些场景依赖 blob / object URL 或缩放原图
- 前端新增 `.eslintrc.json` 和 `.eslintignore`，并把 `lint` 脚本切换到 ESLint CLI，后续可以稳定跑进 CI 或本地检查
- `account/usage` 页面补齐 Hook 依赖，避免用户状态变化时的潜在同步问题

## 影响文件

### 后端

- `backend/app/api/routes.py`
- `backend/tests/test_public_gallery_route.py`

### 前端

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

### 文档

- `docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md`

## 验证

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `.\.venv\Scripts\python -m pytest backend -q`
