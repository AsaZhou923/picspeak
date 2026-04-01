# PicSpeak Update Log

日期：2026-04-01

## 概览

这次更新主要围绕公开长廊审核、评图结果表达，以及长廊卡片展示稳定性做了一轮收口：

- 公开长廊图片审核 prompt 改为“只拦截明确违规内容”，降低对泳装、时尚摄影、非露点贴身服装等内容的误杀
- 评图详情页把最终得分文案从 5 档粗分类细化到 10 档，并补齐中英日三套本地化标签
- 公开长廊卡片统一改为留白包裹 + 背景虚化的缩略图展示方式，横图不再被列表卡片硬裁切
- 补上内容审核 prompt 的回归测试，并整理本地忽略规则，避免 `.vercel` 与本地环境文件进入工作区

## 公开长廊审核收紧误杀

- 内容审核 prompt 现在明确要求“只拦截高置信度违规内容”，并把判断边界写清楚
- 正常人像、时尚摄影、泳装、健身、舞蹈、孕妇照、非露点内衣或贴身服装、艺术化人体表达等内容默认倾向 `safe`
- 如果只有性感氛围、姿势撩人或衣着较少，但没有明确露点或露骨性行为，模型应给出较低 `nsfw_score`，而不是直接拦截
- 无法确定时默认倾向 `safe`，减少公开长廊因为审核过度保守而丢图

## 评图得分文案细化

- 评图详情页不再只显示“优秀 / 良好 / 中等”这类粗粒度标签
- 最终分数现在会先四舍五入到 `1` 到 `10` 的整数档位，再映射到对应文案
- 中文、英文、日文都补齐了 10 档结果标签，让用户看到的总结语更贴近实际分数区间
- 这次调整只改展示层，不改原始评分逻辑

## 长廊卡片展示优化

- 公开长廊卡片去掉了按横竖图分支渲染的逻辑，统一使用 `object-contain`
- 横图会放在带留白的容器里展示，外层保留模糊背景，既不拉伸也不再把主体裁掉
- 这样可以减少卡片因图片方向切换而出现的跳变，同时让不同构图在列表里更稳定

## 工程补充

- 新增内容审核 prompt 回归测试，锁住“常见边界内容应默认通过”的行为
- 根目录和前端目录补充忽略 `.vercel` 与本地环境文件的规则，减少无关改动进入 Git 工作区

## 影响文件

### 前端

- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/.gitignore`

### 后端

- `backend/app/services/content_audit.py`
- `backend/tests/test_content_audit.py`
- `.gitignore`

### 文档

- `docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md`

## 验证

- `cd backend && python -m unittest tests.test_content_audit`
- `cd frontend && npm run typecheck`
