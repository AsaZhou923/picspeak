# PicSpeak Changelog Workflow

## 目的

把“阅读今天的 git 工作区更新 -> 写一篇 changelog -> 同步首页更新记录 -> 验证 -> commit -> push”固定成可重复执行的流程，避免遗漏站内入口、验证步骤或提交规范。

本文档只定义执行步骤，不代表当前就要执行这些操作。只有在收到明确指令后，才按本文流程落地。

## 适用场景

- 用户要求“阅读今天的更新并写更新文档”
- 用户要求“同步首页更新记录”
- 用户要求“确认无误后 push”
- 用户要求“整理一次 release / 更新说明 / changelog”

## 固定原则

1. 先读工作区改动，再写文档。不要凭记忆总结。
2. 只记录这次工作区中的真实改动，不混入历史版本内容。
3. changelog、`/updates` 列表、首页“更新记录”入口要一起检查。
4. 先验证，再 commit，再 push。
5. 提交信息必须遵守仓库的 Lore Commit Protocol。

## 涉及文件

### changelog 文档

- `docs/changelog/update-log-YYYY-MM-DD-topic.md`

### `/updates` 页面数据源

- `frontend/src/lib/updates-data.ts`

### 首页底部“更新记录”入口

- `frontend/src/app/page.tsx`

注意：
- 当前实现里，首页最新更新提示不一定只改一处常量。
- `frontend/src/app/page.tsx` 中的 `latestUpdatesCopy` 可能先赋默认值，再被后续 `if / else` 逻辑覆写。
- 所以不能只搜索一次字符串后就结束，必须通读 `latestUpdatesCopy` 附近整段逻辑。

## 标准执行步骤

### 1. 确认当前状态

在仓库根目录执行：

```powershell
git status --short --branch
git diff --stat
```

目的：
- 确认当前分支
- 确认今天有哪些未提交修改
- 快速判断改动集中在哪些模块

如果改动范围很大，再继续按模块读 diff，不要直接开始写文档。

### 2. 阅读今天的修改

先看总体 diff，再按模块拆开读：

```powershell
git diff
```

必要时按目录拆读，例如：

```powershell
git diff -- backend
git diff -- frontend
git diff -- docs
```

阅读时必须提炼出下面 4 类信息：

1. 用户能感知到的变化
2. 后端或数据结构变化
3. 前端入口或文案变化
4. 验证方式和新增测试

如果遇到新增文件，也必须打开全文看，不要只看 `git diff --stat`。

### 3. 找到现有 changelog 格式

先参考最近几篇：

- `docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md`
- `docs/changelog/update-log-2026-04-07-activation-code-billing.md`

新文档命名规则：

```text
docs/changelog/update-log-YYYY-MM-DD-short-topic.md
```

建议结构保持一致：

```markdown
# PicSpeak Update Log

日期：YYYY-MM-DD

## 概览
- 3 到 5 条核心变化

## 模块 A
- ...

## 模块 B
- ...

## 首页更新记录同步
- ...

## 影响文件
### 后端
- ...

### 前端
- ...

### 文档
- ...

## 验证
- ...
```

要求：
- 用“结果”描述，不要用空泛表述
- 每一条都要能在 diff 中找到依据
- `影响文件` 只写本次改动真正涉及的文件

### 4. 写 changelog 文档

在 `docs/changelog/` 下创建新文件。

写作要求：

1. 第一段讲清这次更新解决了什么问题。
2. 优先写用户可见变化，再写工程补充。
3. 如果首页更新记录也会同步，单独保留 `## 首页更新记录同步` 一节。
4. `## 验证` 里写实际应该执行的命令，不写空话。

### 5. 更新 `/updates` 页面记录

编辑：

- `frontend/src/lib/updates-data.ts`

做法：

1. 在 `zh`、`en`、`ja` 三个数组最前面插入新条目。
2. `id`、`date`、`title`、`summary`、`docPath` 必须对应新 changelog。
3. 如果这次更新内容足够复杂，补 `sections`。
4. `docPath` 必须指向刚写的 `docs/changelog/...md`。
5. 因为这个页面能被用户看到，所以内容需要适当优化，无需太过详细

检查项：

- 三种语言都已添加
- 新条目位于最前面
- `docPath` 没写错
- 标题与摘要和 changelog 主旨一致

### 6. 更新首页“更新记录”入口

编辑：

- `frontend/src/app/page.tsx`

做法：

1. 搜索 `latestUpdatesCopy`
2. 检查默认文案
3. 检查后续是否有 `if / else` 对 `latestUpdatesCopy.hint` 再赋值
4. 保证最终生效的三语 hint 都指向本次更新主题

不要只改这里：

```ts
const latestUpdatesCopy = ...
```

还要继续检查它后面是否被覆写。

### 7. 复查文档与入口是否一致

至少检查下面三处是否对齐：

1. `docs/changelog/...`
2. `frontend/src/lib/updates-data.ts`
3. `frontend/src/app/page.tsx`

对齐内容包括：

- 日期
- 标题主题
- 文案方向
- `docPath`

### 8. 运行验证

先按改动范围选择针对性验证，再跑前端基础验证。

常用命令：

```powershell
cd backend
python -m unittest discover -s tests -p "test_*.py"
```

如果仓库根目录 `.venv` 才是可用环境，使用：

```powershell
& "E:\Project Code\PicSpeak\.venv\Scripts\python.exe" -m unittest discover -s tests -p "test_xxx.py"
```

前端至少执行：

```powershell
cd frontend
npm run typecheck
npm run build
```

如果本次改动涉及 lint 规则或前端通用质量门，再补：

```powershell
npm run lint
```

要求：
- 没跑过的验证，不要写“通过”
- 某条验证因环境原因失败，要明确记录失败原因
- 优先跑与本次改动直接相关的测试

### 9. 最终人工复核

在 commit 前至少再看一次：

```powershell
git diff -- docs/changelog
git diff -- frontend/src/lib/updates-data.ts
git diff -- frontend/src/app/page.tsx
git status --short
```

确认：

1. 新 changelog 标题、日期、文件名正确
2. `/updates` 新条目排在第一位
3. 首页 hint 指向本次更新
4. 没有误改无关文案
5. 工作区内容就是准备提交的内容

### 10. commit

先暂存：

```powershell
git add -A
```

提交信息必须遵守 Lore 格式

### 11. push

确认分支后推送：

```powershell
git branch --show-current
git push origin <branch>
```

如果远端提示仓库迁移，记录提示内容，但只要 push 成功就不需要重复操作。

## 交付时的标准回复内容

完成后汇报至少包含：

1. 新增的 changelog 文件路径
2. 首页更新记录已同步到哪些文件
3. 实际跑过哪些验证
4. commit hash
5. 是否已 push 成功

## 禁止事项

- 不要在没读 diff 的情况下直接写 changelog
- 不要只改 `docs/changelog` 而漏掉 `/updates`
- 不要只改 `updates-data.ts` 而漏掉首页 `page.tsx`
- 不要把未执行的验证写成已通过
- 不要在工作区有未知冲突时直接提交

## 快速清单

执行前：

- `git status --short --branch`
- `git diff --stat`
- `git diff`

写文档：

- 新建 `docs/changelog/update-log-YYYY-MM-DD-topic.md`
- 更新 `frontend/src/lib/updates-data.ts`
- 更新 `frontend/src/app/page.tsx`

验证：

- 相关后端测试
- `frontend npm run typecheck`
- `frontend npm run build`

提交：

- `git add -A`
- Lore commit message
- `git push origin <branch>`
