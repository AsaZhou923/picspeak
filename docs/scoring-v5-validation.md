# v5 本地评分验证

日期：2026-09-08。先完成本地评分代码、隔离测试数据库与少量模型诊断；随后按用户要求执行 changelog 工作流并 push，自动发布结果见下方记录。未改变长廊、历史分数或用户额度。

## 真实原图诊断

从公开长廊读取图片原始字节，在本地直接调用同一 canonical scorer。没有创建线上 review/task，没有调用 writer，没有注入 EXIF。OpenAI 图像输入仍为 `detail=high`。图片内容 SHA-256、提示词全文与哈希、模型返回名、参数、每次输出和调用用量保存在本地实验记录中。

原图 `pho_ccfc9ad4fb8b4a4c`（用户截图中的尖拱石窗与粉花）使用完全相同的原始图片字节。新旧调用均为配置中的 `gpt-5.6-luna` / `xhigh`；v4 提示词从提交版本读取，v5 使用当前候选代码。

| 实验 | 构图 | 光线 | 色彩 | 感染力 | 技术 | 总分 | scorer 调用数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| v4 重新调用 | 9 | 8 | 8 | 9 | 8 | 8.4 | 1 |
| v5 第一次 | 8 | 7 | 8 | 8 | 7 | 7.6 | 1 |
| v5 第二次 | 8 | 7 | 8 | 8 | 7 | 7.6 | 1 |
| v5 第三次 | 8 | 7 | 8 | 8 | 7 | 7.6 | 1 |

三次 v5 五维与总分完全相同，极差为 0。证据既保留了框景、拱形重复和花色关系的优点，也指出窗洞亮白、深暗区域和边缘枝叶干扰。这只证明本例的行为与重复结果，不证明整体模型稳定性或专业人评一致率。

另外两件公开作品用于检查控制流程：

- `rev_4380c0945dcf42e8`：当前长廊旧结果为 8.6；v5 首轮候选 8.4，触发一次复核后为 7.6，共两次 scorer 调用。证明真实高分复核路径可完成，并按最终维度重算。
- `rev_700c1c07b5e54dee`：当前长廊旧结果为 4.6；v5 为 4.8，共一次 scorer 调用。没有统一减分。这两例的旧分没有重新调用，不能作为严格控制的 v4/v5 对照。

全部线上数据只读；实验产物位于 `.local-backups/scoring-v5-20260908/`，包括 `run_probe.py` 与逐次 JSON。运行原有 ID 会拒绝覆盖，重跑应提供新的 run_id。

## 校准状态

尚未通过正式审美校准。三件问题定向样本归入 `calibration`，没有冒充独立 `test`；`human_ratings` 保持为空。

离线评测器读取这些真实诊断记录后应返回 `INSUFFICIENT_INVALID`（退出码 2），明确缺少真人标签、独立测试集和足够重复。未伪造 120 张样本或人评标签。正式评测按 [校准协议](scoring-calibration.md) 执行，需另备覆盖六类题材的独立留出数据。

## 工程验证与独立复审

- 发布前全新临时 PostgreSQL 17 数据库升级到当前 schema 后：完整 backend `365 passed, 19 subtests passed`。
- 前端最终：163 tests、typecheck、lint、116/116 页 production build 通过。v5 的 7.6/7.9 显示 7 档，8.0 才开始 8 档；legacy/unknown 不混入成长统计。
- 全部 5 个成功 v5 原始实验结果经最终加强后的合同验证器回放通过；最终补充的 bool/空模型版本校验没有改变有效样本的评分逻辑或提示词。
- 独立代码复审提出导出 API 遗漏证据，新增回归先失败后通过，已经修复；代码/规格/安全复审结论为 APPROVE，最终无遗留发现。
- 架构复审提出锁竞争错误未标记 scoring stage，已在异常来源处修复；实际异步 processor 回归确认不调用 AI，并归类为 retryable `AI_SCORING_FAILED`。
- 架构最终结论：WATCH，无实现阻断。剩余 WATCH 仅为同模型复核相关性与缺少真人盲评 holdout；不要求扩张实现，也不构成正式校准通过。
- 发布前补充了校准门槛的浮点舍入回归：数学上等于 0.4 的极差和等于 0.6 的 MAE 不再被微小浮点误差误判超限；仅容忍 `1e-12`，真实超限仍失败。发布文案与此窄修复经独立复审 APPROVE。
- 环境没有提供独立 LSP / ast-grep；没有把编译、类型检查和测试当作该工具检查通过。

验证过程曾因重复使用测试数据库触发生图全局并发测试失败：该既有测试上一次留下 1 条 RUNNING 任务，下一次两次 claim 都被正确拒绝。已通过只读查询确认原因；未改无关生图代码，在全新测试数据库重跑完整套件通过。后续全量测试应继续使用全新一次性数据库。

## 主要变更文件

- 评分与证据：`backend/app/services/ai.py`、`ai_prompts.py`、`backend/app/schemas.py`。
- 保存与返回：`backend/app/services/review_score_cache.py`、`review_task_processor.py`、`backend/app/api/routers/review_support.py`。
- 校准工具：`backend/scripts/evaluate_score_calibration.py`、`docs/scoring-calibration.md`。
- 版本与等级显示：`frontend/src/lib/score-display.ts`、`review-page-copy.ts`、`review-growth.ts`、`review-history-copy.ts`、`retake-progress.ts`、`types.ts`；点评详情页、评分面板、历史与复拍进度面板。
- 回归：backend scorer/cache/task/export/evidence/calibration 测试与 synthetic fixture，frontend score-display/growth/retake 测试。
- 操作说明：`CLAUDE.md`、`docs/scoring-v5-fix.md`、本验证记录。

保留既有五维均值、writer 分离、JSON 结果和 checkpoint 存储；没有新增依赖或数据库迁移。后续自动发布更新了服务镜像，未改评分环境变量或历史结果。

## 后续发布验证

按用户明确要求执行 `CHANGELOG_WORKFLOW.md` 并 push，评分代码提交为 `4e2727f004866d41edb89aabd40fdd6ef39c7e84`。发布前公告明确标为准备中，确认自动发布后才改为已发布语态。

- [GitHub CI 34219801982](https://github.com/AsaZhou923/picspeak/actions/runs/34219801982)：backend 与 frontend 均成功，包含 PostgreSQL migration cycle 与前端 production routing 检查。
- [Vercel 自动发布](https://vercel.com/asazhou923s-projects/picspeak/23gXYYof6Q3Fau9M9gYm4CeyRpYN)：提交状态为 success，三语更新数据已进入站点。
- Cloud Build `a30cc67f-45e2-4a7e-942e-36f3f73c631e`：Pull、Build、Push、Migrate、Deploy 均成功，依赖顺序正确。
- Cloud Run migration execution `picspeak-db-migrate-7gqsm`：1 task 成功。本次没有新 migration。
- Cloud Run `picspeak-api-00198-c7h` 接收 100% 流量，`commit-sha` 与上述评分代码提交一致。
- 使用生产 Secret Manager 对应数据库执行只读事务：`transaction_read_only=on`，`alembic_version=20260901_0006`，查询后 rollback。未执行人工生产写入。
- 线上 OpenAPI 返回 200，`ReviewResult` 与 `ReviewExportData` 均包含 `score_evidence`；公开长廊查询返回 200，目标旧记录仍为 v4 的 8.4，证明本轮没有重评该历史记录。
- `/zh/updates` 返回 200 且含本次 release ID。`/healthz` 在自定义域名和服务域名均返回 Google 404，因此没有把该路径计作成功健康检查；应用只读 smoke 使用 OpenAPI 与 gallery。
- 外部 Update Logs 两个文件与仓库副本 SHA256 一致。初次镜像由文档库自动备份提交 `2f18325` 推送，已核对远端提交内容完全一致。

上面的发布证明代码已交付，不替代正式真人盲评校准；架构 WATCH 继续保留。

## 局限

- 同一模型的高分复核仍可能存在相关偏差；结构化理由并不等于理由正确。
- `score-v5-evidence-calibrated` 是软件契约标识，不是“已完成真人校准”的认证。供应商模型别名仍可能漂移，需要持续保存真实返回名、输入与提示词版本，并重复基准评测。
- 高分首次请求最多增加一次评分调用；评分完成后的 writer 重试继续复用分数及其证据。历史结果仍保留原评分版本。
