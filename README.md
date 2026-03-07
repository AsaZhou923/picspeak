# PicSpeak

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)

PicSpeak 是一个面向真实交付场景的 AI 摄影点评项目，包含：

- 后端服务：FastAPI + PostgreSQL + S3 兼容对象存储
- 前端应用：Next.js 14
- 业务闭环：游客登录、Google 登录、图片直传、照片入库、AI 点评、任务轮询、历史查询、额度控制

当前代码库已经具备从本地开发到测试环境上线的基础能力，适合作为摄影点评类产品的 MVP 或内部版本。

## 1. 功能概览

- 支持游客模式，无需先注册即可开始评图
- 支持 Google 登录，登录后默认升级为 `free` 用户
- 支持对象存储预签名上传，前端直传图片，不经过后端转发文件
- 支持照片确认入库和用户资源隔离
- 支持 AI 点评同步 / 异步两种调用方式
- 支持点评历史、单图点评记录、使用额度查询
- 支持幂等键、防重复提交
- 支持每日额度控制、基础限流、API 审计日志
- 支持可选图片审核开关
- 支持 WebSocket 任务状态推送
- 支持独立 worker 进程部署
- 支持任务重试、死信队列和任务事件日志

## 2. 技术栈

### 后端

- Python 3.10+
- FastAPI
- SQLAlchemy 2.x
- PostgreSQL
- boto3

### 前端

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS

## 3. 目录结构

```text
backend/
  app/
    api/
    core/
    db/
    services/
    main.py
    worker_main.py
  requirements.txt
  .env.example

frontend/
  src/app/
  src/components/
  src/lib/

create_schema.sql
后端接口文档_v1.md
系统架构.md
Google登录接入指南.md
```

## 4. 当前业务流程

1. 客户端获取游客令牌，或通过 Google 登录换取访问令牌
2. 客户端调用 `/api/v1/uploads/presign` 获取对象存储上传地址
3. 客户端直接上传图片到对象存储
4. 客户端调用 `/api/v1/photos` 确认上传并生成照片记录
5. 客户端调用 `/api/v1/reviews` 发起 AI 点评
6. 异步模式下轮询 `/api/v1/tasks/{task_id}` 获取任务进度
7. 客户端可通过 `/api/v1/ws/tasks/{task_id}` 订阅任务状态推送
8. 完成后通过 `/api/v1/reviews/{review_id}` 或历史接口读取结果

## 5. 已实现接口

- `POST /api/v1/auth/guest`
- `POST /api/v1/auth/google/login`
- `GET /api/v1/auth/google/callback`
- `POST /api/v1/uploads/presign`
- `POST /api/v1/photos`
- `POST /api/v1/reviews`
- `GET /api/v1/tasks/{task_id}`
- `GET /api/v1/reviews/{review_id}`
- `GET /api/v1/me/reviews`
- `GET /api/v1/photos/{photo_id}/reviews`
- `GET /api/v1/me/usage`
- `GET /api/v1/ws/tasks/{task_id}`（WebSocket）
- `GET /healthz`

详细协议见 [后端接口文档_v1.md](/e:/Project%20Code/PicSpeak/后端接口文档_v1.md)。

## 6. 环境要求

### 基础依赖

- Python 3.10 或更高版本
- Node.js 18 或更高版本
- PostgreSQL 14+
- S3 兼容对象存储

### 第三方服务

- AI Provider API Key
- Google OAuth Client（如启用 Google 登录）

## 7. 后端环境变量

后端优先加载 `backend/.env`，同时兼容仓库根目录 `.env`。建议以 [backend/.env.example](/e:/Project%20Code/PicSpeak/backend/.env.example) 为模板。

### 必填项

- `DATABASE_URL`
- `OBJECT_BUCKET`
- `OBJECT_BASE_URL`
- `OBJECT_S3_ENDPOINT`
- `OBJECT_ACCESS_KEY_ID`
- `OBJECT_SECRET_ACCESS_KEY`
- `AI_API_KEY`

### 常用配置

- `APP_ENV`
- `APP_SECRET`
- `MAX_UPLOAD_BYTES`
- `RATE_LIMIT_PER_MINUTE`
- `GUEST_BURST_LIMIT_PER_10S`
- `DEFAULT_DAILY_QUOTA`
- `AI_API_BASE_URL`
- `AI_MODEL_NAME`
- `FLASH_MODEL_NAME`
- `PRO_MODEL_NAME`
- `AI_TIMEOUT_SECONDS`
- `REVIEW_WORKER_CONCURRENCY`
- `REVIEW_WORKER_IDLE_SLEEP_MS`
- `RUN_EMBEDDED_WORKER`
- `REVIEW_WORKER_NAME`
- `REVIEW_RETRY_BASE_DELAY_SECONDS`
- `REVIEW_RETRY_MAX_DELAY_SECONDS`
- `WS_TASK_POLL_INTERVAL_MS`
- `IMAGE_AUDIT_ENABLED`
- `BACKEND_CORS_ORIGINS`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `FRONTEND_ORIGIN`

## 8. 前端环境变量

建议在 `frontend/.env.local` 中配置：

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`

其中 `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`、后端 `GOOGLE_OAUTH_REDIRECT_URI`、Google Console 中的回调地址必须保持一致。

## 9. 本地启动

### 9.1 初始化数据库

```bash
psql "$DATABASE_URL" -f create_schema.sql
```

如果有新增迁移 SQL，按顺序继续执行对应脚本。

### 9.2 启动后端

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

后端健康检查地址：

```text
GET http://localhost:8000/healthz
```

独立 worker：

```bash
python -m backend.app.worker_main
```

### 9.3 启动前端

```bash
cd frontend
npm install
npm run dev
```

本地默认访问：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:8000`

## 10. 生产部署建议

### 后端

- 使用 `uvicorn` 多进程，或 `gunicorn + uvicorn workers`
- 通过 Nginx 或网关暴露 HTTPS
- PostgreSQL 与对象存储使用独立生产实例
- 生产环境建议关闭 `RUN_EMBEDDED_WORKER`，并单独启动 worker 进程
- 必须替换默认的 `APP_SECRET` 和 OAuth 相关密钥
- `BACKEND_CORS_ORIGINS` 仅保留正式站点域名

启动示例：

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
python -m backend.app.worker_main
```

### 前端

```bash
cd frontend
npm install
npm run build
npm run start
```

### 对象存储

需要允许前端来源对存储桶执行：

- `PUT`
- `GET`
- `HEAD`
- `OPTIONS`

否则前端直传会因为 CORS 失败。

## 11. 上线检查清单

- 数据库已执行建表脚本和迁移脚本
- `backend/.env` 或根目录 `.env` 中生产配置已填写完整
- 对象存储桶已创建，且 CORS 已正确放行
- `OBJECT_BASE_URL` 可被前端直接访问
- Google OAuth 回调地址三处一致
- `AI_API_KEY` 已生效
- 前端 `NEXT_PUBLIC_API_URL` 已指向正式后端域名
- 后端 `BACKEND_CORS_ORIGINS` 已配置正式前端域名
- `/healthz` 可正常返回 `{"status":"ok"}`

## 12. 当前实现边界

- 任务队列当前基于 PostgreSQL，不是 Redis / MQ
- `/api/v1/me/usage` 当前主要返回配额信息，`rate_limit` 结构为空对象
- 游客身份通过 Cookie `ps_guest_token` 维持，会受前后端域名和 Cookie 策略影响

如果要进入正式生产，建议优先补齐：

- 监控与告警
- 自动化部署与回滚
- 更细粒度的权限与风控

## 13. 相关文档

- [后端接口文档_v1.md](/e:/Project%20Code/PicSpeak/后端接口文档_v1.md)
- [系统架构.md](/e:/Project%20Code/PicSpeak/系统架构.md)
- [Google登录接入指南.md](/e:/Project%20Code/PicSpeak/Google登录接入指南.md)
