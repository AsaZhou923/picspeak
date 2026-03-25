# PicSpeak Update Log

日期：2026-03-25

## 概览

这次更新围绕 Pro 首发优惠和购买链路展开，目标是让用户从看到优惠、理解权益到进入支付的路径更短、更清晰。

- 全站统一 Pro 首发优惠文案，当前价格调整为 `$2.99/月`，并明确为网站运营初期 `25% OFF`
- 工作台、结果页、影像长廊、额度页与首页定价区统一补强 Pro 入口
- 促销按钮不再先跳到额度页，而是直接请求 `checkout_url` 后进入支付流程
- 中文环境下增加国内支付提示，告知用户可通过微信 `Asa-180` 联系购买，并提供优惠价
- 修复开发环境启动前清空 `.next` 带来的不稳定问题

## Pro 优惠表达统一

- 首页定价区、页内促销卡、额度页等位置统一展示 `$2.99/月` 与划线原价 `$3.99`
- 统一强调“网站运营初期 25% OFF”的首发优惠语境
- Pro 用户文案改成面向真实用户的权益确认，不再出现内部验收式表达

## 转化入口增强

- 工作台新增更靠下的 Pro 转化卡片，减少对上传主流程的打断
- 结果页保留升级入口，并根据额度与结果状态强化升级理由
- 影像长廊新增从案例浏览切换到深度分析的转化入口
- 额度页、首页定价区同步升级为首发优惠表达

## 购买链路更新

- 所有促销卡和首页 Pro 购买按钮改为直接拉取 `checkout_url`
- 用户点击“领取 Pro 首发价”后直接进入支付，不再先绕到 `/account/usage`
- 额度页原有购买按钮保留，但与其他入口使用同一条 checkout 链路

## 中文支付提示

- 当用户语言为中文时，在所有直达 checkout 的“领取 Pro 首发价”按钮下方补充提示
- 提示内容为：当前暂未接入国内支付渠道，国内用户可添加微信 `Asa-180` 购买，另有优惠价

## 开发与文档

- `frontend/package.json` 中的 `dev` 脚本改为直接执行 `next dev`
- 新增 `dev:clean` 以便在需要时手动清理 `.next`
- 联盟资料、多语言文案与首页更新记录同步更新

## 影响文件

### 文案与前端

- `frontend/src/components/marketing/ProPromoCard.tsx`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/app/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/gallery/page.tsx`
- `frontend/src/app/account/usage/page.tsx`
- `frontend/src/lib/i18n.tsx`

### 配置与文档

- `frontend/package.json`
- `docs/marketing/affiliate-program-profile.md`
- `docs/changelog/update-log-2026-03-25-pro-launch-checkout.md`

## 验证

- `cd frontend && npm run build` 通过
