# PicSpeak Changelog Workflow

> 当前有效文件是 `Update Logs\CHANGELOG_WORKFLOW.md`。
> 旧写法 `Update Logs\CHANGELOG\_WORKFLOW\.md` 不存在，后续命令、引用和 Obsidian 链接不得继续使用该路径。

## 目的

把“阅读当前改动 -> 提炼用户能感受到的变化 -> 写成简短更新公告 -> 同步站内更新记录 -> 完成内部验证 -> 需要时 commit / push”固定成可重复执行的流程。

最终更新公告是写给 PicSpeak 用户看的。用户应该一眼看懂“更新了什么、对我有什么帮助、是否需要我做什么”。后台实现、文件清单、测试数量和部署术语属于内部验证信息，默认不写入对外公告。

PicSpeak 现在只维护一份仓库内 changelog：

- `docs/changelog/CHANGELOG.md`

外部文档库的 Update Logs 目录只作为仓库内 changelog 目录的镜像副本。Windows 与 WSL 表示分别为：

- `E:\Project Code\docs\01 - Projects\PicSpeak\09 - Changelog\Update Logs`
- `/mnt/e/Project Code/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs`

不要再新建 `docs/changelog/update-log-YYYY-MM-DD-topic.md` 或外部 `Update Logs\update-log-YYYY-MM-DD-topic.md`。历史拆分文件已经合并进统一 changelog，`/updates` 的 `docPath` 通过锚点定位到对应条目。

## 适用场景

- 用户要求“阅读今天的更新并写更新文档”
- 用户要求“同步首页更新记录”
- 用户要求“整理 release / 更新说明 / changelog”
- 用户要求“确认无误后 commit / push”

## 对外文案标准

每条更新记录都应像正常的产品公告，而不是开发日志：

- 标题直接说用户获得了什么，例如“评图更懂你的照片风格”，避免“评分器 v4 与 writer v8 契约升级”。
- 开头用一句话交代变化和价值；正文保留 2 到 4 条最重要的用户可见变化即可。
- 用日常语言描述结果，例如“评语更少套用固定模板”，不要罗列模型版本、缓存策略、数据库字段或内部任务状态。
- 只有用户需要采取行动时，才增加“你需要做什么”；没有操作要求就不写这一节。
- 技术改动只有在影响隐私、费用、兼容性、数据保留或服务可用性时才转写成用户能理解的影响。
- 未部署的内容不能写成“现已上线”。如需提前记录，明确标为“准备中”或“即将推出”。
- 不写文件路径、commit、hash、测试命令、测试数量、migration revision、worker、outbox、cache key、内部模型快照等后台细节。
- 不使用“全面提升、完美解决、革命性”等无法由实际结果证明的宣传话术。

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
11. 对外公告只保留用户可感知的变化；技术证据留在 PR、CI、发布检查或内部记录中。
12. 同一件事在 changelog、`/updates` 和首页提示中使用一致的用户语言，不把后台名词逐层复制到产品页面。

## 数据库迁移与部署类更新的附加规则

本节是内部发布检查清单，不是对外公告模板。执行时必须保留这些证据，但公开更新记录只说明用户实际会感受到的变化，以及是否涉及停机、数据处理、兼容性、隐私或必要操作。

当工作区涉及以下任一内容时，除标准 changelog 步骤外，还必须执行本节：

- `backend/alembic/` revision
- SQLAlchemy model 或 database bootstrap
- `backend/Dockerfile`
- `cloudbuild.yaml`
- Cloud Run service / job
- GitHub CI 中的 PostgreSQL service 或 migration cycle
- `deploy/deploy-backend.bat` 等手动生产部署入口

### 必须区分的状态

文档中必须分别说明，不得合并成一句“已完成”：

1. **本地实现**：代码是否只存在于 working tree。
2. **验证完成**：是否跑过真实 PostgreSQL upgrade / downgrade / re-upgrade。
3. **Job 已配置**：Cloud Run migration job 是否已经创建或更新。
4. **触发器已启用**：Cloud Build trigger 是否已经指向仓库内 `cloudbuild.yaml`。
5. **代码已推送**：相关文件是否已 commit 并 push。
6. **生产已部署**：新的 Cloud Run revision 是否已经接收流量。
7. **生产 schema 已验证**：`alembic_version` 是否确实等于当前 head。

本地测试、容器构建、Job no-op 成功都不能单独写成“每次 push 已自动迁移”；只有代码进入触发分支，并且 Cloud Build trigger 已使用对应配置后，自动化才算正式启用。

### 发布顺序要求

自动发布必须保持以下依赖顺序：

```text
Build immutable image
  -> Push image
  -> Run migration from the same image and wait for success
  -> Deploy the API image
  -> Verify production schema and API
```

要求：

- migration 失败必须阻断 API deploy，禁止 `continue-on-error`、静默 fallback 或只记录 warning 后继续发布。
- migration runner 必须串行化并发执行；PostgreSQL 使用 advisory transaction lock。
- Cloud Run migration job 固定使用单 task、单并行度，并显式等待终态。
- Web service startup 不得自动执行 migration，避免多实例启动竞争和启动风暴。
- 手动部署入口必须遵守同一 migration-first 顺序，不得保留绕过路径。
- 镜像标签必须能追溯到 commit；手动部署不得从 dirty working tree 构建生产镜像。
- 破坏性 schema 变化使用 expand / contract，多版本完成；不得在同一次发布里让旧 revision 立即失去兼容性。

### 环境变量与 secret 记录

- 明确说明是否新增、删除或重命名环境变量。
- 数据库连接必须引用 Secret Manager 中的 `DATABASE_URL`，不得把真实连接串、密码或 token 写入 changelog、命令示例或日志摘录。
- 如果 migration job 只需要数据库连接，应保持最小配置面，不复制无关的认证、AI、支付或对象存储 secret。
- 检查 Cloud Build 与 Cloud Run runtime service account 是否具备所需的 Artifact Registry、Cloud Run、`iam.serviceAccounts.actAs` 和 Secret Manager 权限。
- secret 曾出现在终端、工具输出或构建日志时，必须单独标记为待轮换风险；不能因为未写入 Git 就视为未暴露。

### 最低验证证据

数据库与部署类发布检查至少保留以下内部实际结果：

```powershell
cd backend
python -m alembic heads
python scripts/ensure_runtime_schema.py
python -m alembic downgrade <previous-safe-revision>
python -m alembic upgrade head
```

并补充：

- disposable PostgreSQL 的最终 `alembic_version`
- migration image 内是否包含 `alembic.ini`、`alembic/` 和 runner script
- 并发 migration 是否实际等待同一 advisory lock
- Cloud Build YAML 与 GitHub Actions YAML 是否可解析
- migration gate 是否位于 Deploy 之前并使用 `--wait`
- 后端完整测试结果，以及 PostgreSQL 专项测试是否真实运行而非 skipped
- 如果触碰生产：Cloud Run Job execution 名称、终态、生产 `alembic_version` 和受影响 API 的只读 smoke result

生产查询必须使用只读事务并回滚；生产 migration 只在用户明确授权后执行。未执行的生产验证必须在内部交付记录中写成“未验证”，不得用本地结果代替，也不得把未上线功能写进对外公告。

## 涉及文件

### changelog 文档

- `docs/changelog/CHANGELOG.md`
- `docs/changelog/CHANGELOG_WORKFLOW.md`

### 外部 Update Logs 归档

- `E:\Project Code\docs\01 - Projects\PicSpeak\09 - Changelog\Update Logs\CHANGELOG.md`
- `E:\Project Code\docs\01 - Projects\PicSpeak\09 - Changelog\Update Logs\CHANGELOG_WORKFLOW.md`

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
rg -n "getProductUpdates|updates_hint_home|updates_hint_latest|updates_label|/updates" frontend/src
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

阅读时先提炼用户视角，再整理内部证据：

1. 用户能感知到的变化
2. 这项变化解决了用户原来遇到的什么问题
3. 用户是否需要做任何操作
4. 是否影响费用、隐私、历史数据、兼容性或服务可用性

后端结构、影响文件和验证结果继续检查，但只作为真实性与发布状态的依据，不直接复制到公告正文。

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

面向用户的建议结构：

```markdown
<a id="YYYY-MM-DD-short-topic"></a>

## YYYY-MM-DD - short topic

日期：YYYY-MM-DD

### 这次更新

用一句话说明变化解决了什么，以及用户会得到什么。

- 用户可见变化 1
- 用户可见变化 2
- 必要时再补 1 到 2 条

### 你需要做什么（仅在确实需要时保留）

- 用一句话说明操作或注意事项
```

写作要求：

1. 第一段讲清这次更新解决了什么问题，并使用普通用户能理解的语言。
2. 每个要点只表达一个变化，先说结果，再说明它带来的好处。
3. 默认不写后台模块、影响文件、测试命令、验证数量和部署过程。
4. 只有隐私、价格、兼容性、历史数据或用户操作受到影响时，才补充相应说明。
5. 内部验证仍必须实际执行并在交付回复、PR 或发布检查中记录；未执行的验证不得冒充通过。
6. 写完 `CHANGELOG.md` 后先执行下一步同步外部归档，再继续更新 `/updates`。

### 5. 同步外部 Update Logs 归档

仓库内 `docs/changelog` 是事实来源，外部目录是镜像副本。每次更新 `CHANGELOG.md` 后，立刻执行：

```bash
archive='/mnt/e/Project Code/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs'
find "$archive" -maxdepth 1 -type f -name 'update-log-*.md' -delete
cp docs/changelog/CHANGELOG.md docs/changelog/CHANGELOG_WORKFLOW.md "$archive"/
sha256sum docs/changelog/CHANGELOG.md "$archive/CHANGELOG.md" docs/changelog/CHANGELOG_WORKFLOW.md "$archive/CHANGELOG_WORKFLOW.md"
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
4. `summary` 用一句话说清用户价值；通常不补 `sections`。只有一句话无法解释用户可见的多个变化时，才增加不超过 2 组、每组不超过 3 条的 `sections`。
5. 复查 `frontend/src/lib/updates-data.ts` 是否仍从三份 JSON 导入；除非 loader 结构变化，通常不需要改它。

### 7. 更新首页“更新记录”入口

编辑：

- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-ja.ts`

做法：

1. 搜索 `updates_hint_home`、`updates_hint_latest` 与 `updates_label`。
2. 打开 `frontend/src/components/home/HomeContactSection.tsx`，确认底部 `/updates` 链接实际读取的 key；当前真实入口使用 `t('updates_hint_home')`。
3. 更新最终生效的 zh / en / ja `updates_hint_home`，用一句自然、简短的话说明本次用户可见主题。
4. 如果兼容字段 `updates_hint_latest` 仍存在，也同步更新，避免旧组件或后续重构重新显示过期主题。

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
find '/mnt/e/Project Code/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs' -maxdepth 1 -type f -print
```

### 9. 运行验证

先按改动范围选择针对性验证，再跑必要的基础验证。

文档和 JSON 路径改动至少验证 JSON 能被解析：

```powershell
node -e "for (const f of ['zh','en','ja']) JSON.parse(require('fs').readFileSync(`frontend/src/content/updates/${f}.json`, 'utf8'));"
```

changelog 或 workflow 改动至少验证外部归档副本一致：

```bash
archive='/mnt/e/Project Code/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs'
sha256sum docs/changelog/CHANGELOG.md "$archive/CHANGELOG.md" docs/changelog/CHANGELOG_WORKFLOW.md "$archive/CHANGELOG_WORKFLOW.md"
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
find '/mnt/e/Project Code/docs/01 - Projects/PicSpeak/09 - Changelog/Update Logs' -maxdepth 1 -type f -print
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

完成后给维护者的内部交付回复至少包含：

1. 统一 changelog 路径
2. 已更新的 workflow 路径
3. 已同步的外部 Update Logs 目录
4. 已同步的 `/updates`、README、CLAUDE 等文件
5. 实际跑过哪些验证
6. 是否还有未处理风险

这些交付信息用于维护者审核，不要原样复制到面向用户的更新公告。

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

- 先写出“一句话变化 + 2 到 4 条用户收益”
- 删除后台模块名、文件清单、测试数字和部署术语
- 确认未上线内容标为“准备中”或“即将推出”
- 更新 `docs/changelog/CHANGELOG.md`
- 同步 `E:\Project Code\docs\01 - Projects\PicSpeak\09 - Changelog\Update Logs`
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
