# PicSpeak

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

PicSpeak 是一个 AI 摄影点评 Web 应用。用户可以直接上传照片，获得围绕构图、光线、色彩、氛围和技术完成度的即时反馈。

当前版本已经完成 Clerk 登录接入：
- 新用户统一走 Clerk
- 支持 Google 登录和邮箱登录
- 老用户首次使用 Clerk 登录时，会按邮箱自动匹配并绑定旧账号
- 游客登录后升级为正式账号时，会自动迁移最近的游客记录

## 功能概览

- 游客模式：无需注册即可先试用
- Clerk 登录：统一承接 Google 登录和邮箱登录
- AI 点评：支持 `flash` 和 `pro` 两种点评模式
- 额度控制：游客、免费用户、Pro 用户分层计量
- 历史记录：登录用户可查看自己的点评历史
- 异步任务：支持任务轮询和 WebSocket 状态推送

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 15 / React 18 / TypeScript / Tailwind CSS |
| 认证 | Clerk |
| 后端 | FastAPI / SQLAlchemy 2.x / Python 3.11 |
| 数据库 | PostgreSQL |
| 存储 | S3 兼容对象存储 |

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/AsaZhou923/picspeak.git
cd picspeak
```

### 2. 初始化或升级数据库

新库初始化：

```bash
psql "$DATABASE_URL" -f create_schema.sql
```


### 3. 配置后端

```bash
cp backend/.env.example backend/.env
```

至少需要配置这些变量：

```env
DATABASE_URL=postgresql+psycopg2://pic:password@localhost:5432/postgres
APP_ENV=dev
APP_SECRET=replace-me
OAUTH_JWT_SECRET=replace-me

OBJECT_BUCKET=your-bucket
OBJECT_BASE_URL=https://object.example.com
OBJECT_S3_ENDPOINT=
OBJECT_ACCESS_KEY_ID=
OBJECT_SECRET_ACCESS_KEY=
OBJECT_REGION=auto

AI_API_KEY=
AI_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL_NAME=Qwen/Qwen3-VL-8B-Instruct

FRONTEND_ORIGIN=http://localhost:3000
BACKEND_CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","https://picspeak.art","https://www.picspeak.art"]

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

CLERK_SECRET_KEY=sk_test_xxx
CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxx
```

说明：
- `CLERK_SECRET_KEY` 用于后端验证 Clerk session 并拉取用户信息
- `CLERK_WEBHOOK_SIGNING_SECRET` 用于校验 Clerk Webhook
- `FRONTEND_ORIGIN` 和 `BACKEND_CORS_ORIGINS` 需要包含真实前端域名

### 4. 配置前端

在 `frontend/.env.local` 中至少配置：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

说明：
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 必须和后端的 `CLERK_SECRET_KEY` 属于同一个 Clerk application
- 项目默认已经在中间件中配置了 `authorizedParties`
- 本地默认允许：
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
- 生产默认允许：
  - `https://picspeak.art`
  - `https://www.picspeak.art`

### 5. 启动后端

```bash
python -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate

pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 6. 启动前端

```bash
cd frontend
npm install
npm run dev
```

浏览器访问：

```text
http://localhost:3000
```

## Clerk 配置

### 登录

前端已经接入 Clerk，默认提供：
- Google 登录
- 邮箱注册 / 登录
- 用户菜单

### Webhook

在 Clerk Dashboard 中新增一个 Webhook Endpoint，地址填：

```text
https://your-api-domain/api/v1/webhooks/clerk
```

本地调试时可以替换为你的隧道地址，例如：

```text
https://your-ngrok-domain/api/v1/webhooks/clerk
```

勾选这些事件：

- `user.created`
- `user.updated`
- `user.deleted`

说明：
- 后端 Webhook 路由是 `POST /api/v1/webhooks/clerk`
- 如果 Clerk 日志里出现 `POST / 404`，通常是 Endpoint URL 少了 `/api/v1/webhooks/clerk`

## 用户同步规则

- 新用户：首次通过 Clerk 登录时，自动在 PicSpeak 后端创建账号
- 老用户：首次通过 Clerk 登录时，按邮箱匹配已有账号，匹配成功则自动绑定
- 游客迁移：登录时会自动迁移最近的游客点评记录
- Webhook 同步：Clerk 侧的用户资料更新和删除会同步到本地数据库

## 发布前检查

- 前端 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 已配置
- 后端 `CLERK_SECRET_KEY` 已配置
- 后端 `CLERK_WEBHOOK_SIGNING_SECRET` 已配置
- Clerk Webhook Endpoint 已配置为 `/api/v1/webhooks/clerk`
- `FRONTEND_ORIGIN` 与 `BACKEND_CORS_ORIGINS` 已覆盖真实站点域名
- 已执行数据库升级 SQL 或使用最新 `create_schema.sql`

## 常用命令

后端编译检查：

```bash
cd backend
python -m compileall app
```

前端构建检查：

```bash
cd frontend
npm run build
```

## 文档

- [后端接口文档](后端接口文档_v1.md)
- [系统架构说明](系统架构.md)
- [Google 登录接入指南](Google登录接入指南.md)

## License

[MIT](LICENSE)
