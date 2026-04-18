# PicSpeak 产品路线图（未来 1-2 个月）

日期：2026-04-18  
角色视角：产品负责人

## 1. 当前判断

PicSpeak 已经完成了从「可用 Demo」到「可持续运营产品雏形」的跃迁，但主线开始变宽，接下来 1-2 个月最重要的不是继续横向加功能，而是把核心闭环跑顺、把增长与付费数据补齐。

当前仓库已经具备的能力说明它不是一个早期空壳产品：

- 核心价值明确：上传照片后获得 AI 摄影点评，支持游客直接开始使用，见 `README.md:9`、`README.md:27`。
- 主流程已经完整：上传、异步点评、任务状态、历史、分享、导出、再分析、收藏、画廊、博客，见 `README.md:29` 到 `README.md:38`。
- 变现路径已经存在：后端已有结算、激活码兑换、账单门户接口，见 `backend/app/api/routes.py:2825`、`backend/app/api/routes.py:2856`、`backend/app/api/routes.py:2882`。
- 内容和分发能力已经启动：最近迭代集中在 Gallery 排序、多语言 SEO、`llms.txt`、Blog 浏览量、Updates 页面，见 `docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md`、`docs/changelog/update-log-2026-04-10-locale-seo-and-gallery-refactor.md`、`docs/changelog/update-log-2026-04-12-llms-seo-schema.md`、`docs/changelog/update-log-2026-04-13-blog-view-counts.md`。

这意味着 PicSpeak 当前最需要解决的不是“缺功能”，而是三件事：

1. 让用户更稳定地从第一次点评走到第二次点评。
2. 让增长动作和站内转化可以被量化。
3. 让 Pro 的价值从“更贵的模型”升级成“更强的进步工具”。

## 2. 未来 1-2 个月的核心目标

本阶段建议只围绕一个主线闭环推进：

`上传照片 -> 获得可执行点评 -> 再次拍摄/再次分析 -> 对比进步 -> 分享结果`

### 本阶段北极星目标

- 让 PicSpeak 从“单次 AI 点评工具”向“持续摄影进步工具”靠拢。

### 本阶段业务目标

- 提高首评完成率。
- 提高 7 天内二次使用率。
- 明确游客、登录用户、Pro 用户之间的转化漏斗。
- 让 Blog / Gallery / SEO 流量真正回流到上传工作台。

## 3. 产品原则

1. 主线优先于功能面扩张。
2. 数据优先于直觉，所有关键决策先补观测再优化。
3. 付费卖“结果与成长”，不是只卖“模型档位”。
4. 内容、画廊、首页都要服务上传和复用，而不是变成孤立页面。
5. 未来 8 周避免再开新的大模块，优先打磨现有闭环。

## 4. 分阶段路线图

## 阶段 A：第 1-2 周，先把数据和漏斗补齐

> 状态：已完成（2026-04-18）

### 目标

建立产品运营最小观测面，结束“有更新但很难判断是否有效”的状态。

### 要做什么

- 补全关键事件埋点和转化漏斗：
  - 进入首页
  - 点击开始点评
  - 选择图片
  - 上传成功
  - 成功发起点评
  - 成功查看点评结果
  - 点击再分析
  - 点击分享 / 导出
  - 点击升级 Pro
  - 进入结算页
  - 支付成功
- 按身份区分漏斗：
  - guest
  - free
  - pro
- 按流量来源区分漏斗：
  - 首页直接进入
  - Blog 进入
  - Gallery 进入
  - 分享页进入
- 统一看板口径：
  - DAU / WAU
  - 首评完成率
  - 7 日二次使用率
  - guest -> sign-in 转化
  - free -> checkout 发起率
  - checkout -> paid 成功率

### 为什么优先做

当前项目已经有工作台、历史、收藏、画廊、博客、定价和账单入口，但没有形成完整的产品经营视图。工作台页面本身已经在同时承担配额读取、上传、复用历史照片、发起点评等职责，见 `frontend/src/app/workspace/page.tsx:177` 到 `frontend/src/app/workspace/page.tsx:260`。如果没有漏斗数据，后续首页改版、定价改版、Blog 导流都很难判断收益。

### 交付物

- 一份可复用的核心事件字典。
- 一张日常可看的转化漏斗表。
- 一份第 1 周的基线数据快照。

### 完成标记

- 已完成阶段 A 埋点与归因实现，覆盖首页、Blog、Gallery、分享页、工作台、评图结果、升级 Pro、结算与支付成功链路。
- 已新增阶段 A 事件与指标字典：`docs/analytics/2026-04-18-stage-a-event-dictionary.md`
- 已新增阶段 A 基线快照文档：`docs/analytics/2026-04-18-stage-a-baseline-snapshot.md`
- 已新增快照导出脚本：`backend/scripts/export_product_analytics_snapshot.py`

## 阶段 B：第 3-4 周，强化“第一次点评 -> 第二次点评”闭环

### 目标

把 PicSpeak 的核心价值从“点评一次”升级为“帮助你持续进步”。

### 要做什么

- 优化结果页的下一步动作优先级：
  - 第一优先：再次拍摄 / 再分析
  - 第二优先：收藏 / 分享
  - 第三优先：升级 Pro
- 为结果页新增“下次拍摄清单”视图：
  - 从建议中提炼 3 条最可执行动作
  - 强调“下次拍摄请先做这几件事”
- 增加“同一张照片再次分析”与“新照片复拍对比”的引导文案。
- 在历史页中增加“连续进步”的感知：
  - 最近 3 次点评
  - 平均分走势
  - 最常见问题维度
- 优先把 Flash 输出做得更可执行，而不只是更短。

### 为什么优先做

当前产品已经支持 `Re-analysis`、历史和导出，见 `README.md:34`、`README.md:35`。结果页本身也已经承担分享、导出、收藏、加入画廊、再次点评等多个动作，见 `frontend/src/app/reviews/[reviewId]/page.tsx:187` 到 `frontend/src/app/reviews/[reviewId]/page.tsx:239`。这说明能力已经在，只是还没有被包装成“成长闭环”。

### 交付物

- 新的结果页 CTA 排序。
- “下次拍摄清单”模块。
- 历史页的趋势与复盘增强。

## 阶段 C：第 5-6 周，重做 Pro 价值表达与转化路径

### 目标

让 Pro 不再只是“更深度点评”，而是“更快进步、更有复盘价值”的套餐。

### 要做什么

- 重构 Pro 的价值表达：
  - 从“更详细”
  - 改成“更能指导下一次拍摄”
- 重新定义 Free / Pro 的边界：
  - Free：快速诊断 + 基础建议
  - Pro：更细颗粒度建议 + 更完整复盘 + 进步追踪
- 优化升级触发点：
  - 配额触底时
  - 结果页看到更深建议时
  - 历史页想看趋势时
  - 复拍对比时
- 把 Usage / Billing 页面从“账户页面”改成“升级决策页面”。

### 为什么优先做

当前仓库已经具备套餐、账单、激活码和使用量能力，但更像“技术上可用”，还不像“产品上有强动机”。相关后端能力可见 `backend/app/api/routes.py:2692`、`backend/app/api/routes.py:2825`、`backend/app/api/routes.py:2856`、`backend/app/api/routes.py:2882`。

### 交付物

- 一版新的套餐对比文案。
- 一版新的升级触发位策略。
- 一版更清晰的付费前后体验差异。

## 阶段 D：第 7-8 周，打通内容增长与产品转化

### 目标

让 Blog、Gallery、SEO 和首页流量更稳定地回流到工作台，而不是停留在浏览层。

### 要做什么

- 为 Blog 增加更明确的产品入口：
  - 文章底部对应题材的上传 CTA
  - “立即试试同类点评”按钮
- 为 Gallery 增加从作品到工作台的跳转：
  - 同题材模仿练习入口
  - “用这套标准点评我的照片”入口
- 首页按用户意图拆分入口：
  - 新用户：立刻上传
  - 回访用户：继续上次点评 / 查看历史
  - 内容流量：从文章直接进入工作台
- 建立内容到产品的转化评估机制：
  - 文章浏览 -> 工作台点击率
  - 文章来源用户的首评完成率
  - Gallery 浏览 -> 上传转化率

### 为什么优先做

最近版本已经在持续做 Blog、SEO、`llms.txt`、多语言和 Updates，说明增长面已经在搭建，但目前更偏“可被发现”，下一步要转向“可被转化”。Blog 浏览量和节流逻辑也已经存在，见 `backend/app/api/routes.py:2078`、`backend/app/api/routes.py:2100`、`frontend/src/lib/blog-view-stats.ts:9` 到 `frontend/src/lib/blog-view-stats.ts:43`。

### 交付物

- Blog 到工作台的转化入口改版。
- Gallery 到工作台的回流入口。
- 一套内容来源转化周报。

## 5. 关键指标建议

第一周先建立基线，第二周开始看改善。

### 建议重点盯的指标

- 首页到工作台点击率
- 选图到上传成功率
- 上传成功到成功发起点评率
- 成功发起点评到成功查看结果率
- 首次使用后 7 天内二次点评率
- guest -> 登录转化率
- free -> checkout 发起率
- checkout -> 付费成功率
- Blog -> 工作台点击率
- Gallery -> 工作台点击率

### 本阶段建议目标

在没有基线前先用区间目标，不要假装精确：

- 首评完成率提升到 70%-80%
- 7 日二次使用率达到 20%-30%
- guest -> 登录转化率达到 8%-15%
- 已登录用户的 checkout 发起率达到 3%-8%
- Blog / Gallery 到工作台的点击率达到 5%-10%

## 6. 本阶段明确不做

为了保证 1-2 个月内能见结果，以下事项建议暂缓：

- 暂不扩新的内容大类。
- 暂不做复杂社区机制。
- 暂不做多角色协作或团队产品。
- 暂不追求一次性补完所有运营系统。
- 暂不在没有数据的情况下频繁改套餐价格。

## 7. 风险与依赖

### 风险

- 路线图容易被零散页面需求打断。
- 如果没有统一事件定义，后面数据会不可比。
- 如果 Pro 的价值仍然模糊，新增升级位也不会明显提高转化。
- 如果内容页只做阅读不做转化承接，SEO 流量价值会被低估。

### 依赖

- 前端需要补事件埋点和更稳定的 CTA 布局。
- 后端需要保证使用量、账单、任务状态等接口稳定。
- 需要至少每周复盘一次漏斗数据。

## 8. 结论

未来 1-2 个月，PicSpeak 不建议继续横向扩张成功能集合，而应该围绕“点评 -> 复拍 -> 进步 -> 分享”这条主线，把数据、复用、转化三件事做扎实。

如果这条路线跑通，PicSpeak 会从一个“好看的 AI 摄影点评站”变成一个“用户愿意反复回来使用的摄影成长工具”。

## 9. 本次评估依据

- 产品能力清单：`README.md:25` 到 `README.md:38`
- 工作台主流程：`frontend/src/app/workspace/page.tsx:177` 到 `frontend/src/app/workspace/page.tsx:260`
- 结果页动作复杂度：`frontend/src/app/reviews/[reviewId]/page.tsx:187` 到 `frontend/src/app/reviews/[reviewId]/page.tsx:260`
- 账单与套餐能力：`backend/app/api/routes.py:2692`、`backend/app/api/routes.py:2825`、`backend/app/api/routes.py:2856`、`backend/app/api/routes.py:2882`
- 内容与流量能力：`backend/app/api/routes.py:2078`、`backend/app/api/routes.py:2100`、`frontend/src/lib/blog-view-stats.ts:9` 到 `frontend/src/lib/blog-view-stats.ts:43`
- 近期版本方向：`docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md`、`docs/changelog/update-log-2026-04-10-locale-seo-and-gallery-refactor.md`、`docs/changelog/update-log-2026-04-12-llms-seo-schema.md`、`docs/changelog/update-log-2026-04-13-blog-view-counts.md`
