# v5 评分修复与校准计划

状态：实现、工程验证和独立复审完成，评分修复已推送并验证自动发布；代码 APPROVE、架构 WATCH（同模型偏差与真人校准限制）。未重评历史；真人盲评尚未完成。发布证据见 [验证记录](scoring-v5-validation.md)。

## 已批准的目标

- 收紧缺少证据的高分，保留黑白、剪影、安静、颗粒、模糊、留白等有可见表达效果的作品。
- 5–6 为基本成立但有限，7 为明显优秀，8 为精选作品级，9–10 需要充分的卓越表现证据。漂亮题材、电影感和风格标签本身不能代替摄影控制与表达。
- 维持五维整数和服务端算术均值，不全局减分、不按单个弱维度机械封顶。
- 保存各维度的可见优势、主要限制、高分理由。候选总分 >=8 时仅额外复核一次；最终分可以升降，仍按最终维度重新求均值。复核失败不得将未复核候选作为成功结果保存。
- 新评分版本与旧缓存隔离；普通点评与复拍比较保留不同版本标识，不把跨标尺差异报告为进步。
- 提供可复现的离线校准工具和独立测试集规范。真人标签必须来自真实评审，不能用模型自评代替。

## 实现边界与接口

- 新版本：`score-v5-evidence-calibrated` / `photo-score-v5-evidence-calibrated`。
- 模型选择和 writer 既有行为保留。高分复核使用同一 canonical scorer，最多一次额外调用；统计两次实际消耗，缓存和 checkpoint 只保存完成的评分。
- `CanonicalScore.score_evidence` 与 `ReviewResult.score_evidence` 保存同一结构：`dimensions`（五维，各有 `strength`、`limitation`、`high_score_justification`）、`overall_justification`、`high_score_audited`（服务端写入，模型不能自报）。
- 每维 >=8 必须有非空高分理由，总分 >=8 必须有总体理由且已复核；证据结构检查不等于审美正确性证明。
- 已完成的旧记录允许没有证据，新版本缓存/检查点不允许缺少有效证据。复核调用失败按 scoring failure 处理，不掩盖供应商错误。
- 复用现有 JSON 结果与任务 checkpoint 存储，无新依赖、无数据库迁移、无生产或历史写入。

## 文件与验证分工

1. scorer：`ai_prompts.py`、`ai.py`、`schemas.py` 及其测试；严格评分证据、一次高分复核、消耗汇总与新版本。
2. 持久化：`review_score_cache.py`、`review_task_processor.py`、`review_support.py` 及相应测试；证据 round trip、缓存隔离、writer 重试复用。
3. 评测：离线 calibration 脚本、使用说明及测试；验证真实多评审标签、版本、重复实验、独立测试集，输出指标及缺失证据。
4. 成长统计：前端同版本统计与版本提示；不同复拍/普通评分口径不连接为连续趋势。

## 验收

- 回归：高分必须复核；低分不增加调用；复核失败不能成功；writer 不能修改分数和证据；复核前后分数变化的最终均值与费用正确。
- 缓存：v4 / 无证据 / 未复核高分 / 不一致的均值不可作为 v5 命中；合法证据经过 checkpoint、数据库结果、API 返回后保持一致。
- 兼容：旧点评仍可读；复拍比较继续保留自身配对评分口径；新旧版本不混算进步。
- 校准候选门槛：人评中位 <=6.5 被判 >=8 的比例 <=5%；人评 >=8 的召回 >=80%；MAE <=0.6；三次独立评分的极差 P95 <=0.4。指标必须同时报告样本数和适用版本，缺少标签不能判 PASS。
- 正式工具默认要求 120 张独立留出测试图、六类题材、每张 2–3 名独立评审；已用于开发的问题定向样本另归 calibration。降低样本门槛必须显式选择 diagnostic，不可冒充正式校准。
- 本地定向和完整测试、适用的 lint/typecheck/static checks、代码与架构独立复审。部署与历史重评另行处理。

## 完成证据

- 发布前完整后端验证：全新临时 PostgreSQL 17 数据库升级到当前 schema 后，`365 passed, 19 subtests passed`。
- 前端最终验证：`163 passed`、typecheck、lint、`116/116` 页 production build 通过。
- 证据持久化回归先在旧实现上得到 `7 failed, 1 passed`，修复后相关持久化、缓存、任务和 hardening 测试 `32 passed`。
- 当前工具环境未提供独立 LSP / ast-grep；不将编译与测试结果表述为 LSP 检查通过。
- 真实图片诊断：同原图 v4 重新调用 8.4；v5 三次均 7.6。另一件作品真实触发高分复核，首轮 8.4、复核 7.6；低分对照 v5 为 4.8。详见 [验证记录](scoring-v5-validation.md)。
- 独立代码复审：导出遗漏证据、锁竞争错误分类均已回归修复，代码/规格/安全最终结论为 APPROVE。
- 独立架构复审：WATCH，无实现阻断；剩余限制仅为同模型复核可能存在相关偏差、独立真人 holdout 尚未完成。不能把工程验证通过表述为正式审美校准通过。
- 发布前增量复审：三语准备中公告与文档镜像已对齐；校准门槛忽略不超过 `1e-12` 的浮点舍入误差，0.4 极差与 0.6 MAE 边界回归通过，真实超限仍失败；独立代码复审 APPROVE。

## 接口参考

- [OpenAI Structured Outputs 支持的 schema](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)：嵌套对象采用 `additionalProperties: false`，模型输出 schema 的所有字段均为 required，服务端复核标志不属于模型输出字段。
