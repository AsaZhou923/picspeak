# PicSpeak Update Log

日期：2026-04-22

## 概览

这次更新把 Pro 从“更深度点评”重新包装成“下一轮拍摄指导、完整复盘和进步追踪”的成长工具，同时修复了 `/zh`、`/en`、`/ja` 首页重复输出 `FAQPage` 结构化数据的问题。用户现在会在结果页、历史页和 Usage 页面看到更清楚的升级理由，Google Search Console 也不会再因为 locale 首页重复 FAQPage 字段而报错。

- 首页套餐与 FAQ 文案改为突出 Free / Pro 边界：Free 做快速诊断，Pro 指导下一次拍摄
- 结果页 Pro 触发位统一由策略字典生成，覆盖游客保存、配额触底、深度建议和复拍对比
- 历史页在趋势视图后新增“想看趋势时升级 Pro”的转化入口
- Usage / Billing 页面强化为 Pro 升级决策页，展示付费前后的体验差异
- locale 首页复用首页 UI 时不再重复输出 FAQPage JSON-LD，由 locale layout 保留唯一一份结构化数据
- 新增 Pro 转化策略测试和首页结构化数据 scope 测试

## Pro 价值表达重做

- `frontend/src/lib/pro-conversion.ts` 新增三语 Pro 转化策略字典，统一维护 Free / Pro 边界、升级触发位和 Usage 决策页文案
- `frontend/src/components/marketing/ProPromoCard.tsx` 改用策略字典中的 Pro features 和场景文案，不再把 Pro 主要表达成“更深入分析”
- 首页三语套餐、功能和 FAQ 文案同步改为“快速诊断 -> 下一次拍摄指导 -> 完整复盘 -> 进步追踪”的表达
- `frontend/test/pro-conversion.test.ts` 锁定 Free / Pro 边界、升级触发位和 Usage 决策页文案，避免后续退回“只卖模型深度”的旧表达

## 转化路径补强

- `frontend/src/app/reviews/[reviewId]/page.tsx` 删除内联多语言 Pro 促销分支，改为按触发场景读取统一策略
- 结果页会根据用户身份、低额度、低分或复拍场景展示不同升级理由
- `frontend/src/app/account/reviews/page.tsx` 在已有成长趋势视图后，为非 Pro 用户增加历史趋势相关的 Pro 转化卡
- `frontend/src/app/account/usage/page.tsx` 新增 `UsageDecisionPanel`，把账户页从“看额度”推进到“理解是否该升级”的决策页面

## FAQPage 结构化数据去重

- `frontend/src/app/page.tsx` 拆出 `HomePageContent`，保留根首页默认行为
- `frontend/src/app/[locale]/page.tsx` 复用 `HomePageContent structuredDataScope="locale"`，避免 locale 页面再输出第二份 FAQPage JSON-LD
- `frontend/src/lib/home-structured-data.ts` 集中管理首页结构化数据 scope
- `frontend/test/home-structured-data.test.ts` 覆盖 root 首页保留 FAQPage、locale 首页抑制嵌套 FAQPage 的行为
- 构建产物检查确认 `zh.html`、`en.html`、`ja.html` 中 `FAQPage` 均只出现 1 次

## 首页更新记录同步

- 新增 `/updates` 记录到 `frontend/src/lib/updates-data.ts`
- 首页底部“更新记录”入口仍由 `frontend/src/app/page.tsx` 渲染
- 本次首页 hint 同步实际落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

## 影响文件

### 前端

- `frontend/src/app/[locale]/page.tsx`
- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/home-structured-data.ts`
- `frontend/src/lib/pro-conversion.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

### 测试与文档

- `frontend/test/home-structured-data.test.ts`
- `frontend/test/pro-conversion.test.ts`
- `docs/changelog/update-log-2026-04-22-pro-conversion-and-faq-schema.md`

## 验证

- `cd frontend && node --test test/home-structured-data.test.ts test/pro-conversion.test.ts test/review-growth.test.ts test/replay-intent-copy.test.ts test/header-auth-visibility.test.ts`
- `cd frontend && npm run lint`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- 构建后检查 `.next/server/app/zh.html`、`.next/server/app/en.html`、`.next/server/app/ja.html` 的 `FAQPage` 计数均为 1
