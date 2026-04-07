# PicSpeak Update Log

日期：2026-04-07

## 概览

这次更新围绕中文用户的 Pro 开通与续期链路展开，目标是把“国内购买 -> 收到激活码 -> 站内兑换 -> 自动同步会员状态”这条路径补完整，同时把相关入口同步到首页、评图页、营销卡片和账户页。

- 后端新增激活码订阅能力，支持 30 天 Pro 开通与续期
- 中文环境下的 Pro 购买入口统一改为前往爱发电，下单后通过激活码在站内兑换
- 账户页能够识别激活码来源的 Pro，正确展示到期时间、无自动续费状态和续期入口
- 鉴权与 webhook 现在复用同一套订阅权限判断，过期订阅会正确回落到 `free` 或 `guest`
- 同步补上激活码生成脚本、后端测试覆盖，以及首页更新记录

## 激活码订阅链路

- 新增 `billing_activation_codes` 表，用来存储激活码哈希、批次、时长、兑换状态和过期信息
- 新增 `/billing/activation-code/redeem` 接口，登录用户可直接提交激活码完成开通
- 激活码兑换后会生成或复用 `activation_code` 类型订阅，并把 Pro 到期时间顺延 `30` 天
- 如果用户已经有激活码 Pro 且尚未到期，新兑换的时长会接在原到期时间之后，而不是覆盖
- Lemon Squeezy 订阅与激活码订阅现在共用 `billing_access.py` 内的权限判断与计划同步逻辑

## 中文购买与账户页

- 中文环境下的 Pro 购买按钮统一改为跳转爱发电商品页
- 购买提示从“微信联系购买”改为“下单后输入激活码开通 30 天 Pro”
- 账户额度页新增“国内支付与激活码开通”说明区，明确展示购买、收码、兑换三步流程
- 额度页新增激活码兑换弹窗，支持直接输入激活码并在成功后刷新当前套餐状态
- 当 Pro 来源于激活码时，账户页会展示“当前账号通过激活码开通，无自动续费”，并将原订阅管理按钮替换为续费入口

## 页面入口与工程补充

- 首页定价区按钮、通用 Pro 转化卡和额度页都新增“输入激活码”入口
- 评图详情页复用同样的中文 Pro 转化文案，支持直接走购买或兑换路径
- 新增 `backend/scripts/generate_activation_codes.py`，可批量生成激活码与 SQL 种子数据
- 新增 `backend/tests/test_billing_activation_access.py`，覆盖到期降级、guest 保持 guest、激活码续期等场景
- 评图详情页的大量文案与解析辅助函数抽离到 `frontend/src/lib/review-page-copy.ts`
- `frontend/next.config.js` 为非开发构建切换到内存缓存，减少写盘缓存带来的构建环境问题

## 首页更新记录同步

- `/updates` 最新一条记录已切换到本次“激活码开通与订阅同步”更新
- 首页底部“更新记录”提示文案已改为指向本次激活码与国内支付链路更新

## 影响文件

### 后端

- `backend/app/api/deps.py`
- `backend/app/api/routes.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/schemas.py`
- `backend/app/services/billing_access.py`
- `backend/app/services/lemonsqueezy_webhooks.py`
- `backend/scripts/generate_activation_codes.py`
- `backend/tests/test_billing_activation_access.py`
- `create_schema.sql`

### 前端

- `frontend/next.config.js`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/components/billing/ActivationCodeModal.tsx`
- `frontend/src/components/home/HomeCheckoutButton.tsx`
- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/lib/review-page-copy.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/updates-data.ts`

### 文档

- `docs/changelog/update-log-2026-04-07-activation-code-billing.md`

## 验证

- `cd backend && python -m unittest tests.test_billing_activation_access`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
