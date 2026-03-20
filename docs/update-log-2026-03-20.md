# PicSpeak Update Log

日期：2026-03-20

## 概览

这次更新围绕“历史记录与复盘能力”继续补齐了前后端闭环，并新增了收藏能力与站内整理入口。重点不在大改视觉，而在把已有后端能力真正接到前端，让历史筛选、分享导出、再次分析、收藏沉淀都能直接使用。

## 后端能力接入与同步

### 历史记录

- 支持分页查询历史记录
- 支持按时间范围筛选
- 支持按评分区间筛选
- 支持按图片类型筛选
- 历史卡片同步展示图片类型、分享状态、关联复盘状态

### 结果分享与导出

- 结果页分享按钮改为调用后端分享接口
- 分享时使用独立 `share_token` / 公开页面地址
- 结果页导出按钮改为调用后端简版导出接口
- 导出内容改为后端结构化结果数据，便于复用和归档

### 再次分析

- 结果页“再次点评”会携带 `source_review_id`
- 工作台支持复用上一条分析对应的照片直接再次发起分析
- 同时保留切换为重新上传新照片的入口

## 收藏能力

### 结果页

- 新增收藏 / 取消收藏按钮
- 收藏状态写入后端 `review meta`
- 收藏操作会即时更新当前页面状态反馈

### 我的收藏

- 新增“我的收藏”页面
- 展示已收藏的评图结果
- 支持在收藏列表中直接取消收藏
- 入口放到头像旁下拉菜单中，避免主导航过载

## 导航与页面整理

- 首页保留主转化路径不变
- 新增低曝光“更新记录”入口，不抢占主按钮注意力
- 新增站内更新记录页，方便查看近期变更

## 影响文件

### 文档

- `docs/update-log-2026-03-20.md`

### 前端

- `frontend/src/app/account/reviews/page.tsx`
- `frontend/src/app/account/favorites/page.tsx`
- `frontend/src/app/reviews/[reviewId]/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/app/updates/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`

## 验证

- `cd frontend && npm run build` 通过

