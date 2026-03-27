# PicSpeak Update Log

日期：2026-03-27

## 概览

这次更新继续围绕公开影像长廊打磨，重点解决三类问题：一是从长廊进入详情后返回时，列表会丢失原来的分页与滚动位置；二是长廊还缺少和评图历史一致的筛选能力；三是卡片图片仍可能请求原图，不够节制。

- 公开影像长廊新增与评图历史一致的筛选项：开始时间、结束时间、最低评分、最高评分、图片类型
- 长廊筛选状态现在同步到 URL，浏览器前进/后退可恢复当前筛选条件
- 长廊列表状态按当前筛选条件单独缓存，进入详情再返回时可恢复已加载页、当前页和滚动位置
- 长廊卡片改为只使用缩略图，不再优先请求原图，同时继续使用较高清晰度缩略图
- 首页更新记录与 `/updates` 页面已同步切换到本次更新

## 公开长廊筛选

- 公开长廊页新增筛选面板，交互与“我的历史”保持一致
- 筛选参数直接写入 `/gallery` 查询串，便于分享、刷新和浏览器历史恢复
- 后端 `/gallery` 接口补充支持：
  - `created_from`
  - `created_to`
  - `min_score`
  - `max_score`
  - `image_type`
- `total_count` 也会按当前筛选结果返回，避免头部计数与实际列表不一致

## 返回恢复与浏览器历史

- 从长廊卡片进入详情前，会保存当前筛选条件下的列表页状态
- 返回长廊时，会优先恢复：
  - 已加载分页数据
  - 当前分页索引
  - 页面滚动位置
  - 最近点击的卡片定位
- 恢复状态按“当前筛选条件”分桶保存，不同筛选结果之间互不污染
- 详情页返回逻辑同时兼容浏览器前进/后退键与页面内返回按钮

## 图片加载策略

- 长廊卡片改为只读取 `photo_thumbnail_url`
- 不再因为卡片展示去优先请求 `photo_url`
- 继续沿用公开长廊接口提供的较高分辨率缩略图，兼顾带宽与清晰度

## 影响文件

### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/lib/gallery-navigation.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`

### 后端

- `backend/app/api/routes.py`
- `backend/tests/test_public_gallery_route.py`

### 文档

- `docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md`

## 验证

- `cd frontend && npx tsc --noEmit` 通过
- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_public_gallery_route` 通过
