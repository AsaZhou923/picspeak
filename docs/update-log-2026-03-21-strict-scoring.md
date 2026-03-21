# PicSpeak Update Log

日期：2026-03-21

## 概览

这次更新聚焦两件事：一是收紧 AI 评图 prompt，让整体打分口径更严格、更稳定；二是修复公开影像长廊头部“已收录”数字在第一页只显示当前页数量的问题。

## 评分标准收紧

- 评图 prompt 升级为 `photo-review-v4-strict`
- 明确要求普通照片主要落在 3-6 分区间
- 7 分必须建立在多个维度都明显扎实的前提上
- 8 分必须接近作品集级别且没有明显短板
- 9-10 分被明确限定为极少出现
- 禁止因为“电影感”“情绪感”“风格化”或被摄体本身讨喜而主动抬分
- system prompt 同步收紧，避免模型在系统层面回到偏宽松口径

## 影像长廊计数修复

- `/gallery` 接口新增返回 `total_count`
- 长廊页头部“已收录”改为显示真实总收录数，而不是当前已加载条数
- 修复后，第一页就会显示完整收录数量，不必翻到下一页才看到正确数字

## 历史筛选日期显示优化

- 将评图历史筛选日期显示统一为 `yyyy/mm/dd`，不再跟随浏览器本地化显示成“日”
- 将可见文本格式与日历选择器拆开，解决 `yyyy/mm/日` 这类显示问题
- 补充明显的非法日期提示，输入无效日期时会显示红框与错误文案，并禁用“应用筛选”
- 将筛选区的双列布局延后到更宽断点，给日期字段留出更稳定的显示空间

## 评图历史缩略图回退修复

- 修复评图历史卡片里缩略图加载失败后仍停留在浏览器破图状态的问题
- 缩略图失败时现在会正确回退到原图 URL
- 只有缩略图和原图都失败时，才进入最终失败态

## 影响文件

### 后端

- `backend/app/services/ai.py`
- `backend/app/api/routes.py`
- `backend/app/schemas.py`

### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/components/ui/CachedThumbnail.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/types.ts`
- `frontend/src/app/globals.css`

### 测试

- `backend/tests/test_ai_prompt.py`
- `backend/tests/test_public_gallery_route.py`

### 文档

- `docs/update-log-2026-03-21-strict-scoring.md`

## 验证

- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_ai_prompt.py"` 通过
- `.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_public_gallery_route.py"` 通过
- `cd frontend && npm exec tsc -- --noEmit` 通过
