# PicSpeak Update Log

日期：2026-03-22

## 概览

这次更新包含两部分：一是公开影像长廊新增可持久化点赞功能，并明确收紧为“游客只能浏览，不能点赞”；二是补了一轮页面级 SEO 优化，统一 metadata、robots 与 sitemap 策略。

## 公开长廊点赞

- 公开影像长廊卡片新增点赞按钮与点赞数展示
- 点赞状态改为后端持久化存储，不再是前端临时状态
- `/gallery` 返回新增：
  - `like_count`
  - `liked_by_viewer`
- 新增公开长廊点赞与取消点赞接口，支持已登录用户切换点赞状态

## 游客权限收紧

- 游客仍可正常浏览公开影像长廊
- 游客点击点赞时，前端会直接提示需要登录
- 后端接口也会对游客点赞请求返回 `403`，避免绕过前端限制

## 数据与接口

- 新增 `review_likes` 表，用于记录用户对公开长廊作品的点赞关系
- 运行时 schema 初始化会自动创建点赞表与相关索引
- 长廊列表接口在带登录态访问时，会返回当前访问者是否已点赞

## SEO 优化

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

## 影响文件

### 后端

- `backend/app/db/models.py`
- `backend/app/db/bootstrap.py`
- `backend/app/schemas.py`
- `backend/app/api/routes.py`

### 前端

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

### 测试

- `backend/tests/test_public_gallery_route.py`
- `backend/tests/test_gallery_like_route.py`

## 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_*gallery*.py"` 通过
- `cd frontend && npx tsc --noEmit` 通过
- `cd frontend && npm run lint`
  - 未执行完成；当前仓库还未初始化 ESLint，`next lint` 会进入交互式配置
