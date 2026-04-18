# PicSpeak 阶段 A 事件与指标字典

日期：2026-04-18  
范围：`阶段 A：先把数据和漏斗补齐`

## 1. 归因来源

统一使用以下 `source` 口径：

| source | 含义 |
| --- | --- |
| `home_direct` | 从首页进入或首页上下文继续进入工作台 |
| `blog` | 从 Blog 文章或 Blog 列表进入工作台 |
| `gallery` | 从 Gallery 浏览上下文进入工作台 |
| `share` | 从分享页上下文进入工作台 |
| `checkout` | 结算与支付链路内部事件 |
| `unknown` | 无法确认来源的保底值 |

前端会在会话级别保存最近一次有效来源；工作台、结果页、升级链路会继承该来源。

## 2. 核心事件

| 事件名 | 触发时机 | 说明 |
| --- | --- | --- |
| `home_viewed` | 首页渲染完成 | 阶段 A 顶部漏斗起点 |
| `blog_post_viewed` | Blog 文章或 Blog 列表渲染完成 | 内容来源口径 |
| `gallery_viewed` | Gallery 页面渲染完成 | 长廊来源口径 |
| `share_viewed` | 分享页渲染完成 | 分享来源口径 |
| `workspace_viewed` | 工作台渲染完成 | 进入上传工作台 |
| `image_selected` | 用户选中图片 | 进入上传流程 |
| `upload_succeeded` | 照片确认成功，状态为 `READY` | 上传完成 |
| `start_review_clicked` | 用户点击开始点评 | 评图 CTA 点击 |
| `review_requested` | 后端成功接受评图请求 | 成功发起点评 |
| `review_result_viewed` | `/reviews/[reviewId]` 渲染完成 | 成功查看点评结果 |
| `reanalysis_clicked` | 结果页点击再分析 | 复用闭环入口 |
| `share_clicked` | 结果页点击分享 | 分享动作 |
| `export_clicked` | 结果页点击导出 | 导出动作 |
| `upgrade_pro_clicked` | 点击任一升级 Pro CTA | 付费意图 |
| `checkout_started` | 后端成功创建 checkout URL | 进入结算页 |
| `paid_success` | Lemon Squeezy 支付成功 webhook 到达 | 支付成功 |
| `payment_success_viewed` | 支付成功页渲染完成 | 前端支付完成反馈页 |
| `sign_in_completed` | Clerk 交换 token 成功 | guest -> sign-in 转化 |

## 3. 指标口径

| 指标 | 定义 |
| --- | --- |
| `DAU` | 当日去重活跃身份数，优先用 `device_id`，否则 `user_public_id/session_id` |
| `WAU` | 截至当日向前 7 天的去重活跃身份数 |
| `首评完成率` | `review_result_viewed / review_requested` |
| `7 日二次使用率` | 某日首次完成评图的用户中，7 天内再次产生评图记录的占比 |
| `guest -> sign-in` | 当日 guest 活跃身份中完成 `sign_in_completed` 的占比 |
| `free -> checkout` | 当日 free 活跃身份中产生 `checkout_started` 的占比 |
| `checkout -> paid` | 当日产出 `checkout_started` 的身份中，完成 `paid_success` 的占比 |
| `Home -> Workspace` | `source=home_direct` 的 `workspace_viewed / home_viewed` |
| `Blog -> Workspace` | `source=blog` 的 `workspace_viewed / blog_post_viewed` |
| `Gallery -> Workspace` | `source=gallery` 的 `workspace_viewed / gallery_viewed` |
| `Share -> Workspace` | `source=share` 的 `workspace_viewed / share_viewed` |

## 4. 实现位置

- 前端归因与埋点：`frontend/src/lib/product-analytics.ts`
- 页面级自动埋点：`frontend/src/components/providers/ProductAnalyticsProvider.tsx`
- 后端事件入库：`backend/app/api/routes.py`
- 事件聚合与快照导出：`backend/app/services/product_analytics.py`
- 快照导出脚本：`backend/scripts/export_product_analytics_snapshot.py`

## 5. 导出方式

生成阶段 A 快照：

```powershell
cd backend
..\.venv\Scripts\python.exe scripts\export_product_analytics_snapshot.py --start-date 2026-04-18 --end-date 2026-04-24
```

如果环境里没有可用数据库或还未产生真实流量，输出文件会成为零基线快照。
