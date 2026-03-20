# PicSpeak Update Log

日期：2026-03-20

## 概览

这次更新围绕“公开影像长廊”展开，把原先仅保存在前端本地的长廊能力改成了后端统一管理的公开浏览模式。同时补齐了加入长廊后的图片审核、游客只读限制，以及历史记录筛选区在暗色主题下的日期显示问题。

## 公开影像长廊

- 新增长廊公开数据流，长廊状态不再依赖浏览器 `localStorage`
- 全站用户与游客都可以浏览公开长廊
- 只有审核通过的作品会出现在公开长廊
- 长廊卡片缩小重排，压缩底部文字信息
- 卡片右下角新增作者标识与用户名展示

## 加入长廊与审核

- 用户在评图详情页点击“加入影像长廊”时，立即触发图片审核
- 加入长廊时会默认同步加入收藏
- 提示文案中明确说明：
  - 长廊为公开展示
  - 图片会先经过审核
  - 审核通过后才会进入公开长廊
  - 后续可在历史记录详情页移出长廊
- 游客只能浏览公开长廊，不能将结果提交到长廊

## 历史记录页优化

- 调整筛选区日期输入框宽度，避免日期显示不完整
- 修复暗色主题下原生日期选择器对比度不足的问题
- 优化筛选区栅格布局，在较窄宽度下更稳定

## 影响文件

### 后端

- `backend/app/db/models.py`
- `backend/app/db/bootstrap.py`
- `backend/app/schemas.py`
- `backend/app/api/routes.py`

### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/i18n.tsx`

### 文档

- `docs/update-log-2026-03-20-gallery.md`

## 验证建议

- `cd backend && python -m unittest backend/tests/test_review_history_helpers.py`
- `cd frontend && npm run build`
