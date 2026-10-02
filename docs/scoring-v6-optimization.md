# v6 评分流程优化与本地验证

日期：2026-10-01。范围为本地源码、隔离测试与公开图片的 scorer-only 对照。不部署、不推送，不创建线上 review/task，不重算历史分数。

本文件保留 v6 实验的历史结果。后续真正更换评分模型的 v7 修改与发布核验见 [v7 验证记录](scoring-v7-validation.md)。

## 问题与结论边界

最近 30 天的只读数据库快照中，V5 普通评图共 410 条：382 条处于 `6 <= 分数 < 8`，5 条恰好 8.0，23 条低于 6，没有超过 8.0。全部总分与五维均分一致。这个分布提示可能存在区分度不足，但没有人工真值，不能证明照片应该更高分。

当前流程的可直接确认问题是二审看到首轮分数、理由和“高分候选”的提示。这样二审并非独立读图。v6 删除这一信息输入，保留原有证据门槛和算分规则。它移除了一个可避免的锚定来源，不保证审美准确性或分布改善。

## 保留的实现

- 评分版本：`score-v6-evidence-independent`；评分提示词版本：`photo-score-v6-evidence-independent`。
- 继续使用配置中的 canonical scorer；writer 仍为 `photo-review-v8-image-led`，不参与决定分数。
- 五维仍为 0–10 的整数；服务端算术均分，天然产生 0.2 分步长。
- 首轮总分 >=8 才额外评分一次。二审只接收相同原图、题材、EXIF 和相同评分规则，不包含初评分或初评证据，也不告知触发高分审核。二审独立输出完整五维与证据，结果可升、可保留、可降。
- 最终分由二审五维重新计算；高分证据、失败关闭、用量和延迟汇总、writer 重试复用均保留。不额外增加每次评图的调用上限。
- v5 缓存与 checkpoint 不满足 v6 合同；v5 历史记录继续可读，v5/v6 均保持 8.0 开始高分显示。成长统计按精确评分版本分组，复拍 `retake-paired-v1` 不变。
- 无新依赖、无数据库迁移、无全局加减分或分布拉伸。

## 已撤回的候选：细分评分锚点

最初候选将原来的 5–6 合并说明整体改为分别描述 5、6、7、8、9、10。对三张公开原图，每张用两个版本各独立评分三次，同样的图片字节、题材、无 EXIF、`detail=high`、配置模型 `gpt-5.6-luna` / `xhigh`，全部绕过产品缓存。

| 公开样本 | v5 三次总分 | 锚点候选三次总分 | v5 极差 | 候选极差 |
|---|---|---|---:|---:|
| `rev_6a00766961cb4032` | 7.4 / 7.8 / 7.6 | 7.8 / 7.8 / 7.6 | 0.4 | 0.2 |
| `rev_d1b54ee057304ce6` | 6.4 / 6.0 / 6.2 | 6.4 / 6.2 / 6.8 | 0.4 | 0.6 |
| `rev_646aee93fe1f40a8` | 7.6 / 7.6 / 7.6 | 7.6 / 7.4 / 7.6 | 0.0 | 0.2 |

其中一张图的重复波动超过既有 0.4 候选稳定性门槛，其他样本也没有一致收益。样本太少，不能推断整体退化，但不足以支持采用这组新锚点。因此最终 v6 恢复 v5 初评锚点，不将候选描述为改进。

同一静物图的严重信息损失变体（48 倍缩小后放大、模糊、JPEG quality=8）各跑一次：v5 技术分 1 / 总分 3.0；锚点候选技术分 2 / 总分 4.8。两者都识别了技术损伤；没有依据说候选给分更准确。该变体和原图属于同一 content group。

上述候选记录虽用了开发中的 v6 名称，但不是最终 v6 提示词。记录含提示词全文和 SHA-256；最终验证另用 `blind-final-*` run_id。不得按版本名字将两种提示词混成同一评测组。

## 最终盲复核诊断

最终代码对公开样本 `rev_4380c0945dcf42e8` 做了 v5/v6 各三次 scorer-only 请求。两组使用相同原图和模型参数，不使用存储的旧分冒充重新调用结果。

| 流程 | run_id | 初评分 | 最终分 | scorer 调用数 |
|---|---|---:|---:|---:|
| v5 | audit-1 | 8.6 | 7.8 | 2 |
| v5 | audit-2 | 8.6 | 7.6 | 2 |
| v5 | audit-3 | 7.6 | 7.6 | 1 |
| 最终 v6 | blind-final-1 | 7.6 | 7.6 | 1 |
| 最终 v6 | blind-final-2 | 8.0 | 7.8 | 2 |
| 最终 v6 | blind-final-3 | 7.6 | 7.6 | 1 |

两组最终分极差均为 0.2，均值均约 7.67。本例没有显示分布或稳定性优于 v5；真实二审依然可以降低分数，去掉候选输入不等于保证涨分。请求追踪确认最终 v6 二审没有接收首轮结果；该实验只验证真实控制路径，不能证明锚定偏差已消失。

还逐字比较了全部六类题材的初评提示词，最终 v6 与 v5 完全一致。全部实验共 26 次完成的评分流程、29 次 scorer API 调用，包含已撤回候选；没有 writer 或产品写入。最终结果和记录哈希汇总在 `behavior-summary.json`。

## 工程验证

- 一次性 PostgreSQL 17 数据库升级到当前 schema 后，第一轮完整 backend：535 passed、57 subtests passed。三个既有 Alembic `path_separator` 弃用警告不影响结果。最终回退仅改变评分提示词及相关测试，复用未受影响检查，重跑相关回归见下方。
- 完整 frontend Node 测试：244 passed；TypeScript typecheck、ESLint、production build（124/124 静态页）、production Blog routing（12 passed）通过。
- 新增回归覆盖初评分数/理由不进入二审请求，二审结果可升/保留/降，>=8 无数学封顶，证据不足或供应商失败不保存成功结果，用量汇总，v5 缓存/checkpoint 隔离，以及前端 v5/v6 显示和成长分组。
- 初次独立复审未发现阻断问题。复审工具没有独立 LSP / ast-grep，因此采用编译、pytest、Node、tsc 和文本检查，不将这些称为 LSP 检查。
- 最终锚点回退与中性二审提示词修改后，scorer / cache / evidence / quality / task / history / OpenAI / calibration 相关回归：131 passed、5 subtests passed；独立复审再次确认没有阻断项。`git diff --check` 通过。
- 用四个开发样本的真实模型重复记录和空 `human_ratings` 调用正式校准评测器：报告仍为 `INSUFFICIENT_INVALID`，`exit_code=2`，false-high / recall / MAE 为 null，没有将缺失标签转换为成功。
- 新增排序诊断评估器 `backend/scripts/evaluate_scoring_rank_benchmark.py`，读取固定 manifest 和 scorer-only 结果目录，以聚合投票直方图的 `human_mean` 排序作为参考，比较 baseline/candidate 在同一 holdout、同一 repeat_index 下的 Spearman 与大差距 pair accuracy，并检查重复极差 P95。该工具只输出 `DIAGNOSTIC_IMPROVEMENT` / `NO_IMPROVEMENT` / `INSUFFICIENT_INVALID`，`human_calibration_status` 永远不是正式通过。

## 实验产物与复现

本地原始记录在 `.local-backups/scoring-v6-20261001/`：`manifest.json`、公开原图、变体、HEAD 的 v5 提示词源码、`probe.py` 和逐次 JSON。每次记录含输入 SHA-256、完整提示词与哈希、真实返回模型名、参数、用量、五维分数、理由和状态。不含凭据；实验失败只输出错误类别。已有 run_id 会拒绝覆盖。

复现单次 scorer-only 请求（消耗配置供应商的 API 额度）：

```powershell
rtk proxy .\.venv\Scripts\python.exe .local-backups\scoring-v6-20261001\probe.py --version v6 --sample rev_4380c0945dcf42e8 --run-id new-independent-run
```

## 仍未证明的部分

- 去掉初评分输入，并不能消除同一模型的相关偏差；首轮 >=8 才复核的选择机制仍存在。
- 当前样本是开发诊断样本，覆盖题材不完整，不能称为独立留出集。
- 原模型返回的是别名 `gpt-5.6-luna`，不代表能够验证供应商内部快照没有变化。
- 不以高分数量增加、分布变宽、多个模型同意或模型理由完整作为准确性证明。
- 没有人工标签；false-high、优秀样本召回、对人评 MAE 均无法计算。[正式校准工具](scoring-calibration.md)继续缺证据即 `INSUFFICIENT_INVALID`，不降低门槛。
- 本地源码与工程测试不代表线上评分或用户体验已经改善。尚未发布。
