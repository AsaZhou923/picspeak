# PicSpeak Update Log

日期：2026-03-20

## 概览

这次更新围绕“公开影像长廊”继续打磨，重点补齐了公开浏览、加入前审核、游客只读、历史记录筛选可用性，以及长廊页卡片清晰度与分页体验。

## 公开影像长廊

- 长廊改为后端统一管理的公开展示模式，不再依赖前端本地 `localStorage`
- 全站用户与游客都可以浏览公开长廊
- 只有通过长廊审核的作品会出现在公开长廊
- 长廊卡片改为优先加载原图，失败时回退到更大的高分辨率缩略图，减少糊图问题
- 长廊页面新增稳定分页，支持按页浏览作品
- 卡片右下角展示作品所属用户标识与用户名，底部文字信息进一步收敛

## 加入长廊与审核

- 评图流程中的图片审核阶段已移除，不再影响正常出结果
- 图片审核改为在“加入影像长廊”前触发
- `IMAGE_AUDIT_ENABLED` 现在专门用于控制“加入长廊前审核”是否启用，默认开启
- 加入长廊时会默认同步加入收藏
- 提示文案明确说明：
  - 公开长廊为全站可见
  - 图片会先经过审核
  - 审核通过后才会进入公开长廊
  - 后续可在历史记录详情页移出长廊
- 游客只能浏览公开长廊，不能提交作品到长廊

## 结果页长廊引导

- 结果页中的“加入影像长廊”引导卡片现在只对总分 6 分及以上作品显示
- 卡片文案调整为更积极的鼓励式表达，同时保留审核与收藏规则说明
- 从公开长廊进入详情页时，个人操作按钮仍保持隐藏，避免公共展示页出现个人管理入口

## 历史记录页优化

- 调整筛选区日期输入框宽度，避免日期显示不完整
- 修复暗色主题下原生日期选择器对比度不足的问题
- 历史记录列表补充“长廊审核未通过”状态标签，便于快速识别

## 影响文件

### 后端

- `backend/app/api/routes.py`
- `backend/app/core/config.py`
- `backend/app/services/review_task_processor.py`
- `backend/app/db/models.py`
- `backend/app/db/bootstrap.py`
- `backend/app/schemas.py`

### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/i18n.tsx`

### 文档

- `docs/changelog/update-log-2026-03-20-gallery.md`

## 验证建议

- `cd frontend && npm run build`
- `e:\Project Code\PicSpeak\.venv\Scripts\python.exe -m unittest backend.tests.test_review_history_helpers backend.tests.test_settings_defaults`
