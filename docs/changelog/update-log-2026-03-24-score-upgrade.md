# PicSpeak Update Log

日期：2026-03-24

## 概览

这次更新聚焦在评分体系与公开长廊展示逻辑的统一。目标不是把分数抬高，而是让新一轮评图更严格、更稳定，同时避免 `flash` 和 `pro` 因为文案深度不同而出现过大的分差。

## 统一评分口径

- 评分请求的温度下调到 `0`，减少同图重复评测时的随机波动
- 评图流程拆成两步：先锁定分数，再按模式生成文案
- `flash` 与 `pro` 共用同一轮评分结果，不再因为分析长度不同而直接拉开分差
- `flash` 现在输出更短的摘要式建议，`pro` 输出更完整的展开分析

## 长廊展示调整

- 公开长廊继续不设置硬性分数门槛，作品是否展示仍以公开状态和审核通过为准
- 新增“推荐”标记，用相对分位而不是绝对分数来识别当前长廊中的靠前作品
- 推荐逻辑优先参考同 `image_type` 的样本分布，样本不足时回退到全局长廊分布

## 评分版本与用户提示

- 新评图结果新增 `score_version` 字段，当前版本为 `score-v2-strict`
- 旧作品会保留原有结果，并按 `legacy` 版本处理
- 公开长廊新增常驻说明，明确告知用户从 2026 年 3 月 24 日开始评分标准已经升级
- 长廊中的旧作品与新作品可能存在评分口径差异，后续可以按 `score_version` 继续扩展展示策略

## 影响文件

### 后端

- `backend/app/services/ai.py`
- `backend/app/api/routes.py`
- `backend/app/services/review_task_processor.py`
- `backend/app/schemas.py`

### 前端

- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/i18n.tsx`

### 测试

- `backend/tests/test_ai_prompt.py`
- `backend/tests/test_public_gallery_route.py`

## 验证

- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_ai_prompt backend.tests.test_public_gallery_route` 通过
- `cd frontend && npx tsc --noEmit` 通过
