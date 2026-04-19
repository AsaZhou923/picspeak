# PicSpeak Update Log

日期：2026-04-19

## 概览

本次更新是一次纯工程重构，无用户可见功能变化。目标是把积累过大的几个核心文件拆分成职责单一的子模块，降低后续维护和阅读的心智负担。

- 后端废弃了 3000 余行的 `routes.py` 单体文件，各领域路由已完整迁移至 `api/routers/` 下的域文件
- `reviews.py`（980 行）拆分为 4 个子模块：创建、操作、查询、通用支持
- `auth.py` 和 `gallery.py` 各自提取出 `_support` 辅助文件
- 前端评图详情页从 390 行瘦身至 93 行，UI 组件和业务 Hook 迁入 `features/reviews/`
- `useUploadFlow.ts` 的工具函数移入专用的 `uploadFlowSupport.ts`
- 后端应用标题从 `AiPingTu Backend` 更正为 `PicSpeak Backend`

## 后端路由拆分

### routes.py 清理

- `backend/app/api/routes.py`（3029 行）已被删除
- 各域路由早已迁移至 `api/routers/` 下各自的文件，此次删除清除了遗留冗余

### reviews 拆分

原始 `reviews.py`（980 行）按职责拆为：

| 文件 | 职责 |
|---|---|
| `review_create.py` | 评图创建（同步/异步）及任务状态查询 |
| `review_actions.py` | 评图操作：删除、分享、导出、元数据更新 |
| `review_queries.py` | 评图列表、历史、单条查询及公开评图查询 |
| `review_support.py` | 跨模块共用的常量、校验函数、构建函数 |

`reviews.py` 现在仅作为聚合入口，从上述 4 个子模块再导出。

### auth 和 gallery 拆分

- `auth_support.py`：OAuth 流程函数、Clerk webhook 处理、用户序列化等辅助逻辑从 `auth.py` 中提取
- `gallery_support.py`：长廊相关的辅助函数从 `gallery.py` 中提取

### 其他

- `backend/app/main.py`：FastAPI 应用标题从 `AiPingTu Backend` 更正为 `PicSpeak Backend`
- 新增脚本 `ensure_runtime_schema.py`（运行时 schema 校验）和 `verify_product_analytics_write.py`（产品分析写入验证）
- 所有测试文件的导入路径已同步更新至新模块结构

## 前端组件与 Hook 拆分

### reviews/[reviewId]/page.tsx

页面文件从 ~390 行精简至 ~93 行，逻辑分散到新建的 `features/reviews/` 下：

**Hooks：**

| 文件 | 职责 |
|---|---|
| `useReviewDetail.ts` | 评图数据加载与状态管理 |
| `useReviewPhoto.ts` | 照片预览 URL 获取与缓存 |
| `useReviewActions.ts` | 分享、导出、收藏、长廊等操作 |
| `useReviewUsage.ts` | 用量配额查询 |
| `reviewActionSupport.ts` | 操作函数的共用辅助 |

**Components：**

| 文件 | 职责 |
|---|---|
| `CritiqueSection.tsx` | 单条批评维度卡片（含复制、展开、反馈） |
| `ReviewScorePanel.tsx` | 评分面板（雷达图 + 分项列表） |
| `ReviewActionBar.tsx` | 顶部操作栏（分享、导出、收藏等按钮） |
| `ReviewGalleryPanel.tsx` | 长廊操作面板 |
| `GalleryConfirmDialog.tsx` | 长廊提交确认弹窗 |
| `ImageZoomOverlay.tsx` | 照片放大覆盖层 |

### useUploadFlow.ts

- `extractClientMeta`、`cachePhoto`、`getCachedPhoto`、`collectUploadMetrics` 等工具函数迁入 `uploadFlowSupport.ts`
- `useUploadFlow.ts` 保留上传流程主逻辑，工具细节不再内联

### workspace 组件（小幅调整）

`ImageTypePicker`、`ModePicker`、`QuotaBanner`、`QuotaModal`、`ReplayBanner` 各自有小幅 import 路径更新，行为无变化。

## 首页更新记录同步

- `frontend/src/lib/updates-data.ts`：新增本次重构条目（三语言）
- `frontend/src/lib/i18n-zh.ts` / `i18n-en.ts` / `i18n-ja.ts`：更新 `updates_hint_latest` 指向本次更新

## 影响文件

### 后端

- `backend/app/api/routes.py`（已删除）
- `backend/app/api/routers/reviews.py`（精简为聚合入口）
- `backend/app/api/routers/review_create.py`（新增）
- `backend/app/api/routers/review_actions.py`（新增）
- `backend/app/api/routers/review_queries.py`（新增）
- `backend/app/api/routers/review_support.py`（新增）
- `backend/app/api/routers/auth.py`（精简）
- `backend/app/api/routers/auth_support.py`（新增）
- `backend/app/api/routers/gallery.py`（精简）
- `backend/app/api/routers/gallery_support.py`（新增）
- `backend/app/main.py`（标题更正）
- `backend/scripts/ensure_runtime_schema.py`（新增）
- `backend/scripts/verify_product_analytics_write.py`（新增）
- `backend/tests/test_ensure_runtime_schema_script.py`（新增）
- `backend/tests/test_verify_product_analytics_write_script.py`（新增）
- `backend/tests/test_*.py`（多个文件的 import 路径更新）

### 前端

- `frontend/src/app/reviews/[reviewId]/page.tsx`（精简）
- `frontend/src/features/reviews/hooks/useReviewDetail.ts`（新增）
- `frontend/src/features/reviews/hooks/useReviewPhoto.ts`（新增）
- `frontend/src/features/reviews/hooks/useReviewActions.ts`（新增）
- `frontend/src/features/reviews/hooks/useReviewUsage.ts`（新增）
- `frontend/src/features/reviews/hooks/reviewActionSupport.ts`（新增）
- `frontend/src/features/reviews/components/CritiqueSection.tsx`（新增）
- `frontend/src/features/reviews/components/ReviewScorePanel.tsx`（新增）
- `frontend/src/features/reviews/components/ReviewActionBar.tsx`（新增）
- `frontend/src/features/reviews/components/ReviewGalleryPanel.tsx`（新增）
- `frontend/src/features/reviews/components/GalleryConfirmDialog.tsx`（新增）
- `frontend/src/features/reviews/components/ImageZoomOverlay.tsx`（新增）
- `frontend/src/features/workspace/hooks/useUploadFlow.ts`（精简）
- `frontend/src/features/workspace/hooks/uploadFlowSupport.ts`（新增）
- `frontend/src/features/workspace/components/ImageTypePicker.tsx`（小幅调整）
- `frontend/src/features/workspace/components/ModePicker.tsx`（小幅调整）
- `frontend/src/features/workspace/components/QuotaBanner.tsx`（小幅调整）
- `frontend/src/features/workspace/components/QuotaModal.tsx`（小幅调整）
- `frontend/src/features/workspace/components/ReplayBanner.tsx`（小幅调整）
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

### 文档

- `docs/changelog/update-log-2026-04-19-backend-frontend-module-split.md`（本文件）
- `docs/api/后端接口文档_v1.md`（小幅更新）
- `docs/architecture/系统架构.md`（小幅更新）
- `CLAUDE.md`（项目结构描述同步）

## 验证

```bash
# 后端测试
cd backend
& "E:\Project Code\PicSpeak\.venv\Scripts\python.exe" -m unittest discover -s tests -p "test_*.py"

# 前端类型检查
cd frontend
npm run typecheck

# 前端构建
npm run build
```
