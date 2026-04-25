# PicSpeak Update Log

日期：2026-04-20

## 概览

这次更新把“看完点评以后下一步该怎么拍”做得更直接了。Flash 建议现在更像可执行的下一轮拍摄指令，历史页会把最近 3 次点评串成连续进步视图，详情页也把“同图复评”和“换新照片重拍”拆成了更清楚的两条路径。

- Flash 模式的建议现在要求每条只聚焦一个具体调整，并用 Observation / Reason / Action 标签输出，便于直接压成下一轮拍摄清单
- 评图历史新增 Growth Loop 区块，对比最近 3 次和之前 3 次的平均分走势，并标出反复掉分的维度
- 评图详情新增下一轮决策卡片和 3 条 checklist，让用户更快判断该继续验证修正还是直接重拍
- 工作台复评横幅与 Header 登录态显示都做了文案和稳定性收口，避免误导性的入口与 hydration 闪烁
- 新增后端 prompt、成长快照、复评文案与 Header 可见性测试，保证这轮行为可回归

## 后端点评输出收口

- `backend/app/services/ai.py` 为 Flash 建议补充了“每条只写一个调整目标”“动作优先”“按 locale 使用显式标签示例”的 prompt 约束
- 这样前端可以更稳定地把建议抽成下一轮拍摄清单，而不是再从一大段混合建议里硬拆动作
- `backend/tests/test_ai_prompt.py` 新增英文与日文标签、Flash 单目标建议约束的回归测试

## 前端成长闭环

- `frontend/src/app/account/reviews/page.tsx` 新增 Growth Loop 面板，对比最近 3 次与上一轮 3 次的平均分，并显示上升、下降或平台期趋势
- 同一区块会汇总反复低于 7 分的维度，并给出最近 3 次点评的快捷回跳入口
- `frontend/src/lib/review-growth.ts` 负责把结构化建议压成 checklist，同时生成历史趋势和薄弱维度快照
- `frontend/src/app/reviews/[reviewId]/page.tsx` 新增 `ReviewGrowthLoopPanel`，把“同图复评”和“换新照片重拍”拆成两条路径
- 详情页会从建议文本里抽出 3 条下一轮清单，优先展示动作、观察和原因
- `frontend/src/features/workspace/components/ReplayBanner.tsx` 与 `frontend/src/lib/replay-intent-copy.ts` 收紧复评文案，明确只有已经改过同一张图时，再复评才真正有意义

## 导航与回归保护

- `frontend/src/components/layout/Header.tsx` 改成在 hydration 完成后再显示登录态专属导航，避免首屏先闪出错误的登录壳
- `frontend/src/features/reviews/components/ReviewActionBar.tsx` 去掉和新 Growth Loop 面板重复的按钮，减少详情页操作分散
- `frontend/test/review-growth.test.ts`、`frontend/test/replay-intent-copy.test.ts`、`frontend/test/header-auth-visibility.test.ts` 补齐新文案和新逻辑回归
- `frontend/tsconfig.typecheck.json` 允许测试文件使用带 `.ts` 扩展名的导入，保证 `npm run typecheck` 能覆盖这些 node:test 文件

## 首页更新记录同步

- 新增 `/updates` 记录到 `frontend/src/lib/updates-data.ts`
- 首页底部“更新记录”入口仍由 `frontend/src/app/page.tsx` 使用 `updates_hint_latest` 渲染
- 因为提示文案来自翻译字典，本次同步实际落在：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

## 影响文件

### 后端

- `backend/app/services/ai.py`

### 前端

- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/header-auth-visibility.ts`
- `frontend/src/features/reviews/components/ReviewActionBar.tsx`
- `frontend/src/features/reviews/components/ReviewGrowthLoopPanel.tsx`
- `frontend/src/features/workspace/components/ReplayBanner.tsx`
- `frontend/src/lib/replay-intent-copy.ts`
- `frontend/src/lib/review-growth.ts`
- `frontend/src/lib/updates-data.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/tsconfig.typecheck.json`

### 测试与文档

- `backend/tests/test_ai_prompt.py`
- `frontend/test/header-auth-visibility.test.ts`
- `frontend/test/replay-intent-copy.test.ts`
- `frontend/test/review-growth.test.ts`
- `docs/changelog/update-log-2026-04-20-review-growth-loop-and-replay-guidance.md`

## 验证

- `.\.venv\Scripts\python.exe -m unittest backend.tests.test_ai_prompt`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && node --test --experimental-strip-types test/review-growth.test.ts test/replay-intent-copy.test.ts test/header-auth-visibility.test.ts`
- `cd frontend && npm run build`
