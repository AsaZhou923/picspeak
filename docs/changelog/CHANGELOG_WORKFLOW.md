# PicSpeak Changelog Workflow

## 目的

把“阅读当前 git 工作区更新 -> 追加一条统一 changelog -> 同步外部归档副本 -> 同步站内更新记录 -> 验证 -> 需要时 commit / push”固定成可重复执行的流程。

PicSpeak 现在只维护一份仓库内 changelog：

- `docs/changelog/CHANGELOG.md`

外部文档库的 Update Logs 目录只作为仓库内 changelog 目录的镜像副本：

- `/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs`

不要再新建 `docs/changelog/update-log-YYYY-MM-DD-topic.md` 或外部 `Update Logs\update-log-YYYY-MM-DD-topic.md`。历史拆分文件已经合并进统一 changelog，`/updates` 的 `docPath` 通过锚点定位到对应条目。

## 适用场景

- 用户要求“阅读今天的更新并写更新文档”
- 用户要求“同步首页更新记录”
- 用户要求“整理 release / 更新说明 / changelog”
- 用户要求“确认无误后 commit / push”

## 固定原则

1. 先读工作区改动，再写文档。不要凭记忆总结。
2. 只记录这次工作区中的真实改动，不混入历史版本内容。
3. 单一事实来源是 `docs/changelog/CHANGELOG.md`。
4. 每条 changelog 必须有稳定锚点，格式与 `/updates` 条目的 `id` 一致。
5. `/updates` 三语 JSON 的 `docPath` 必须指向 `docs/changelog/CHANGELOG.md#<id>`。
6. changelog、`/updates` 列表、首页“更新记录”入口、README / CLAUDE 等长期说明文档要一起检查。
7. 先验证，再 commit，再 push；未执行的验证不要写成“通过”。
8. 提交信息必须遵守仓库的 Lore Commit Protocol。
9. workflow 如果和当前代码结构有出入，以代码中的真实入口为准，并同步更新本文档，避免继续传播旧路径。
10. 每次更新仓库内 `docs/changelog/CHANGELOG.md` 或 `docs/changelog/CHANGELOG_WORKFLOW.md` 后，立即同步外部 Update Logs 目录，并用 SHA256 对比仓库文件与外部副本。

## 涉及文件

### changelog 文档

- `docs/changelog/CHANGELOG.md`
- `docs/changelog/CHANGELOG_WORKFLOW.md`

### 外部 Update Logs 归档

- `/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs/CHANGELOG.md`
- `/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs/CHANGELOG_WORKFLOW.md`

该目录必须和仓库内 `docs/changelog` 保持同款结构：只保留统一 `CHANGELOG.md` 和 `CHANGELOG_WORKFLOW.md`，不要保留旧的 `update-log-*.md` 拆分文件。

新增条目的锚点格式：

```markdown
<a id="YYYY-MM-DD-short-topic"></a>

## YYYY-MM-DD - short topic
```

示例：

```markdown
<a id="2026-05-04-analytics-retake-waiting-reader"></a>

## 2026-05-04 - analytics retake waiting reader
```

### `/updates` 页面数据源

- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- loader / 类型检查点：`frontend/src/lib/updates-data.ts`

`docPath` 必须使用统一 changelog 锚点：

```json
"docPath": "docs/changelog/CHANGELOG.md#YYYY-MM-DD-short-topic"
```

### 首页底部“更新记录”入口

- 渲染入口：`frontend/src/components/home/HomeContactSection.tsx`
- 三语提示文案：
  - `frontend/src/lib/i18n-zh.ts`
  - `frontend/src/lib/i18n-en.ts`
  - `frontend/src/lib/i18n-ja.ts`

如果以后入口再次重构，先用下面命令找到真实数据源和渲染点：

```powershell
rg -n "getProductUpdates|updates_hint_latest|updates_label|/updates" frontend/src
```

### 项目级说明文件

- `CLAUDE.md`
- `AGENTS.md`、`AGENT.md` 或 `agent.md`（如果仓库中存在）
- `README.md`
- 其他已存在的 README 变体，例如 `README.zh-CN.md`

只同步会影响后续开发者、代理或用户理解的内容；不要为了“更新而更新”制造无关 diff。

## 标准执行步骤

### 1. 确认当前状态

在仓库根目录执行：

```powershell
git status --short --branch
git diff --stat
```

确认当前分支、未提交修改范围，以及改动集中在哪些模块。改动范围较大时，再按目录继续阅读 diff。

### 2. 阅读当前修改

先看总体 diff：

```powershell
git diff
```

必要时按目录拆读：

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

新增文件也要打开全文看，不要只看 `git diff --stat`。

### 3. 确定条目 ID 与标题

条目 ID 使用日期和短主题：

```text
YYYY-MM-DD-short-topic
```

同一个 ID 同时用于：

- changelog 锚点：`<a id="YYYY-MM-DD-short-topic"></a>`
- `/updates` JSON 的 `id`
- `/updates` JSON 的 `docPath` 锚点后缀
- README 最新 changelog 链接（如果这次更新是最新发布）

### 4. 追加 changelog 条目

编辑 `docs/changelog/CHANGELOG.md`，把新条目追加到文件顶部说明文字之后、旧条目之前。

建议结构：

```markdown
<a id="YYYY-MM-DD-short-topic"></a>

## YYYY-MM-DD - short topic

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

写作要求：

1. 第一段讲清这次更新解决了什么问题。
2. 优先写用户可见变化，再写工程补充。
3. 如果首页更新记录也会同步，单独保留 `## 首页更新记录同步` 一节。
4. `## 影响文件` 只写本次改动真正涉及的文件。
5. `## 验证` 里写实际执行过或应该执行的命令；未执行的命令必须标明未执行。
6. 写完 `CHANGELOG.md` 后先执行下一步同步外部归档，再继续更新 `/updates`。

### 5. 同步外部 Update Logs 归档

仓库内 `docs/changelog` 是事实来源，外部目录是镜像副本。每次更新 `CHANGELOG.md` 后，立刻执行：

```bash
archive='/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs'
find "$archive" -maxdepth 1 -type f -name 'update-log-*.md' -delete
cp docs/changelog/CHANGELOG.md docs/changelog/CHANGELOG_WORKFLOW.md "$archive"/
shasum -a 256 docs/changelog/CHANGELOG.md "$archive/CHANGELOG.md" docs/changelog/CHANGELOG_WORKFLOW.md "$archive/CHANGELOG_WORKFLOW.md"
```

要求：

1. 外部目录最终只应包含 `CHANGELOG.md` 和 `CHANGELOG_WORKFLOW.md`。
2. `CHANGELOG.md` 的仓库版本和外部副本 SHA256 必须一致。
3. 如果本 workflow 本身也被修改，先保存 workflow，再重新执行本步骤，确保外部副本包含最新流程。

### 6. 更新 `/updates` 页面记录

编辑：

- `frontend/src/content/updates/zh.json`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`

做法：

1. 在三个 JSON 数组最前面插入新条目。
2. `id`、`date`、`title`、`summary`、`docPath` 必须对应新 changelog 条目。
3. `docPath` 必须指向 `docs/changelog/CHANGELOG.md#<id>`。
4. 如果这次更新内容足够复杂，补 `sections`。
5. 复查 `frontend/src/lib/updates-data.ts` 是否仍从三份 JSON 导入；除非 loader 结构变化，通常不需要改它。

### 7. 更新首页“更新记录”入口

编辑：

- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

做法：

1. 搜索 `updates_hint_latest`。
2. 搜索 `updates_label`，确认首页入口仍然使用 i18n 文案。
3. 打开 `frontend/src/components/home/HomeContactSection.tsx`，确认底部 `/updates` 链接实际读取的是 `t('updates_hint_latest')`。
4. 保证最终生效的 zh / en / ja hint 都指向本次更新主题。

### 8. 复查文档与入口是否一致

至少检查下面内容是否对齐：

- `docs/changelog/CHANGELOG.md` 是否存在对应 `<a id="..."></a>`
- 三份 `/updates` JSON 的 `id` 与 `docPath` 锚点是否一致
- README 最新 changelog 链接是否指向最新锚点
- 首页三语 hint 是否指向本次更新主题
- 仓库中是否还残留 `docs/changelog/update-log-*.md` 引用
- 外部 Update Logs 目录是否已经删除旧的 `update-log-*.md`
- 外部 `CHANGELOG.md` / `CHANGELOG_WORKFLOW.md` 是否与仓库内文件哈希一致

推荐命令：

```bash
rg -n "docs/changelog/update-log|update-log-YYYY|CHANGELOG.md#" .
find '/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs' -maxdepth 1 -type f -print
```

### 9. 运行验证

先按改动范围选择针对性验证，再跑必要的基础验证。

文档和 JSON 路径改动至少验证 JSON 能被解析：

```powershell
node -e "for (const f of ['zh','en','ja']) JSON.parse(require('fs').readFileSync(`frontend/src/content/updates/${f}.json`, 'utf8'));"
```

changelog 或 workflow 改动至少验证外部归档副本一致：

```bash
archive='/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs'
shasum -a 256 docs/changelog/CHANGELOG.md "$archive/CHANGELOG.md" docs/changelog/CHANGELOG_WORKFLOW.md "$archive/CHANGELOG_WORKFLOW.md"
```

前端 TypeScript 或导入结构受影响时执行：

```powershell
cd frontend
npm run typecheck
```

生产页面、SEO、路由或 bundle 受影响时补充：

```powershell
npm run build
```

后端相关改动按需执行：

```powershell
cd backend
python -m unittest discover -s tests -p "test_*.py"
```

要求：

- 没跑过的验证，不要写“通过”。
- 某条验证因环境原因失败，要明确记录失败原因。
- 优先跑与本次改动直接相关的测试。

### 10. 最终复核

在 commit 前至少再看一次：

```bash
git diff -- docs/changelog frontend/src/content/updates README.md README*.md CLAUDE.md
git status --short
rg -n "docs/changelog/update-log|update-log-[0-9]{4}" .
find '/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs' -maxdepth 1 -type f -print
```

确认：

1. 只有一份仓库内 changelog：`docs/changelog/CHANGELOG.md`
2. 旧的 `docs/changelog/update-log-*.md` 文件已经不再作为仓库内入口
3. `/updates` 三语条目的 `docPath` 都指向统一 changelog 锚点
4. README 与项目级说明文件没有继续传播旧路径
5. 外部 Update Logs 目录只保留统一 changelog 与 workflow 副本
6. 工作区内容就是准备提交的内容

### 11. commit

只有在用户要求提交时执行：

```powershell
git add -A
git commit
```

提交信息必须遵守 Lore Commit Protocol。

### 12. push

只有在用户要求推送时执行：

```powershell
git branch --show-current
git push origin <branch>
```

如果远端提示仓库迁移，记录提示内容；只要 push 成功就不需要重复操作。

## 交付时的标准回复内容

完成后汇报至少包含：

1. 统一 changelog 路径
2. 已更新的 workflow 路径
3. 已同步的外部 Update Logs 目录
4. 已同步的 `/updates`、README、CLAUDE 等文件
5. 实际跑过哪些验证
6. 是否还有未处理风险

## 禁止事项

- 不要再新建 `docs/changelog/update-log-*.md`
- 不要在外部 Update Logs 目录继续保留 `update-log-*.md`
- 不要让 `/updates` JSON 继续指向旧的 `update-log-*.md`
- 不要只改 `docs/changelog` 而漏掉 `/updates`
- 不要只改 `docs/changelog` 而漏掉外部 Update Logs 镜像
- 不要只改 `/updates` JSON 而漏掉首页 i18n hint
- 不要在确认更新内容无误前提前改 `CLAUDE.md`、agent 说明文件或 README
- 不要把未执行的验证写成已通过
- 不要在工作区有未知冲突时直接提交

## 快速清单

执行前：

- `git status --short --branch`
- `git diff --stat`
- `git diff`

写文档：

- 更新 `docs/changelog/CHANGELOG.md`
- 同步 `/Users/ze/Documents/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs`
- 更新 `frontend/src/content/updates/zh.json`
- 更新 `frontend/src/content/updates/en.json`
- 更新 `frontend/src/content/updates/ja.json`
- 更新 `frontend/src/lib/i18n-zh.ts`
- 更新 `frontend/src/lib/i18n-en.ts`
- 更新 `frontend/src/lib/i18n-ja.ts`
- 确认上述内容无误后，更新 `CLAUDE.md`
- 确认上述内容无误后，如果存在则更新 `AGENTS.md` / `AGENT.md` / `agent.md`
- 确认上述内容无误后，更新 `README.md` 和已存在的 README 变体

验证：

- JSON parse
- 外部 changelog 副本 SHA256
- 相关前端 typecheck / build
- 相关后端测试

提交：

- 仅在用户要求时 `git add -A`
- Lore commit message
- 仅在用户要求时 `git push origin <branch>`
