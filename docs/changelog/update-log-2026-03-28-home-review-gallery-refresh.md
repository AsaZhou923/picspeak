# PicSpeak Update Log

日期：2026-03-28

## 概览

这次更新主要围绕三个方向收口：

- 首页继续做轻量化和体验打磨，统一顶栏样式，补上注册入口，并修掉头像显示和 Pro 卡片 tips 被截断的问题
- 评图详情页修复了“单条建议被拆成多条”的展示错误，同时优先复用本地上传预览，减少图片显示失败
- 公开长廊补强分页体验与缩略图链路，新增可回填的 gallery thumbnail 脚本与测试，降低首屏图像带宽

## 首页与入口体验

- 首页顶栏已统一回应用内的标准 Header，导航、语言切换、主题切换和右侧操作区与工作台页保持一致
- 首页 CTA 区现在同时提供“立即登录”和“立即注册”
- 登录后的头像展示改为紧凑容器，不再被固定宽度占位框挤压
- Pro 促销卡底部的支付 tips 现在可以完整展示，不再被插槽高度裁掉
- 首页 FAQ、登录、注册、结账按钮与背景特效继续保持按需挂载，避免把不必要的交互逻辑压进首屏

## 评图详情修复

- 建议列表的切分逻辑做了收紧：已经识别为“观察 / 原因 / 可执行动作”的完整建议，不会再因为分号被拆成三张卡片
- 评图详情页优先读取本地上传后的预览地址，减少回看历史时图片丢失或加载失败
- 详情大图改为直接使用浏览器图片元素，减少额外包装带来的显示问题

## 公开长廊与缩略图链路

- 长廊分页新增首页、末页、页码跳转和当前区间显示，翻页反馈更直接
- 公开长廊入选时会生成专用的 `gallery thumbnail`，并使用长期缓存策略返回给列表卡片
- 长廊卡片优先使用专用缩略图，不再为列表展示优先请求原图
- 新增 `backfill_gallery_thumbnails.py`，可以为已审核通过的公开作品批量补齐缩略图
- 增加了缩略图生成、公开长廊返回字段和回填脚本的测试覆盖

## 首页更新记录同步

- `/updates` 页面的最新一条已切换到本次更新
- 首页底部“更新记录”入口文案已同步指向本次首页 / 评图 / 长廊整理

## 影响文件

### 前端

- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/home/*`
- `frontend/src/components/layout/SiteChrome.tsx`
- `frontend/src/components/performance/PerformanceTelemetry.tsx`
- `frontend/src/components/ui/DeferredBackgroundEffect.tsx`
- `frontend/src/components/providers/AppProviders.tsx`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/route-shell.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/package.json`
- `frontend/tsconfig.typecheck.json`

### 后端

- `backend/app/api/routes.py`
- `backend/scripts/backfill_gallery_thumbnails.py`
- `backend/tests/test_backfill_gallery_thumbnails_script.py`
- `backend/tests/test_gallery_thumbnail_flow.py`

### 文档

- `docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md`

## 验证

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
