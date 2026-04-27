# PicSpeak Update Log

日期：2026-04-27

## 概览

这次更新把 GPT-Image-2 的精选 prompt 案例接入到 AI 创作页，让用户可以先浏览带示例图的高质量结构，再一键填入生成表单继续微调。案例内容保持来源仓库原文，不额外改写 prompt，并把作者、来源链接、多语言标题和静态示例图一起纳入产品内置库。

- `/generate` 新增「精选 GPT-Image-2 提示词」子版块，覆盖摄影、人像、海报、产品商业、UI 信息图和实验视觉方向
- 主 prompt 输入框下方先展示质量、比例、风格和负面提示词控制，再展示精选案例库，生成参数与案例浏览的顺序更贴近实际操作
- 案例支持分类筛选、查看来源、复制 prompt 和一键填入当前生成表单
- prompt、标题和来源信息集中维护在结构化数据文件中，示例图复制到 `public` 静态目录并补充 NOTICE
- 新增测试覆盖案例数量、图片资源、模板 key、画幅、来源链接和基础内容完整性

## AI 创作提示词库

- 新增 `PromptExampleGallery` 组件，在 AI 创作页内展示 30 个精选 GPT-Image-2 案例
- 案例卡片包含示例图、分类、标题、作者、原始来源入口、prompt 摘要、复制按钮和「使用提示词」按钮
- 使用案例时会填入当前 locale 对应的 prompt，同时同步推荐模板、风格和画幅，不改变后端生图任务流程
- 为避免模板切换覆盖案例 prompt，生成页增加一次性跳过模板 prompt 同步的保护逻辑

## 内容来源与多语言

- 新增 `frontend/src/content/generation/prompt-examples.ts`，集中维护案例 ID、分类、作者、来源链接、静态图路径、三语标题、三语 prompt、推荐模板、风格和画幅
- prompt 文本按来源仓库原文保留，不做产品侧改写；中文和日文 README 中原本为英文的 prompt 也继续保留英文原文
- 示例图复制到 `frontend/public/generation-prompt-examples/`，前端通过 `/generation-prompt-examples/...jpg` 访问
- 新增 `NOTICE.md` 说明案例与图片来源于 `EvoLinkAI/awesome-gpt-image-2-prompts`，并保留 Apache-2.0 许可说明
- 三语界面文案补齐提示词库标题、分类、复制、来源和使用按钮文案

## 首页更新记录同步

- `/updates` 数据已在 `frontend/src/content/updates/zh.json`、`frontend/src/content/updates/en.json`、`frontend/src/content/updates/ja.json` 的首位新增本次更新
- 首页底部「更新记录」入口的三语 hint 已同步指向本次「精选 GPT-Image-2 提示词库」更新
- 当前仓库的 updates 数据实际由 JSON bundle 驱动，`frontend/src/lib/updates-data.ts` 只负责加载这些 bundle，因此本次同步点落在 `frontend/src/content/updates/*.json`

## 影响文件

### 前端

- `frontend/src/app/generate/page.tsx`
- `frontend/src/features/generations/components/PromptExampleGallery.tsx`
- `frontend/src/content/generation/prompt-examples.ts`
- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/public/generation-prompt-examples/`

### 测试

- `frontend/test/generation-prompt-examples.test.ts`

### 文档

- `docs/changelog/update-log-2026-04-27-gpt-image2-prompt-gallery.md`

## 验证

- `cd frontend && node --test test/generation-prompt-examples.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
