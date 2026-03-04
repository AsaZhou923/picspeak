# 图言 (PicSpeak)

图言（PicSpeak）是一个 AI 摄影点评后端服务，面向“上传照片 -> AI 点评 -> 历史查询”的完整业务闭环。

## 项目简介

图言聚焦摄影点评场景，提供结构化评分与文字建议，支持异步任务、幂等、防刷、配额控制，便于直接作为前端 Web/App 的后端服务。

核心能力：
- 照片上传签名与确认入库
- AI 点评任务（同步 / 异步）
- 点评结果查询与历史分页
- 用户配额与限流
- 幂等键防重复提交

## 技术栈

- Python 3.10+
- FastAPI
- PostgreSQL
- SQLAlchemy 2.x
- Background Worker（进程内线程版，便于快速启动）

## 项目结构

```text
app/
  api/        # 路由与依赖（鉴权）
  core/       # 配置、安全签名
  db/         # 数据库会话与 ORM 模型
  services/   # 任务 worker、限流配额、AI 服务
  main.py     # 应用入口
```

## 接口概览

- `POST /api/v1/uploads/presign`
- `POST /api/v1/photos`
- `POST /api/v1/reviews`
- `GET /api/v1/tasks/{task_id}`
- `GET /api/v1/reviews/{review_id}`
- `GET /api/v1/photos/{photo_id}/reviews`
- `GET /api/v1/me/usage`
- `GET /healthz`

详细协议见：`后端接口文档_v1.md`

## 快速启动

1. 安装依赖

```bash
pip install -r requirements.txt
```

2. 配置环境变量

复制 `.env.example` 为 `.env` 并按本地环境调整。
其中上传到对象存储需要至少配置：
- `OBJECT_BUCKET`
- `OBJECT_BASE_URL`（用于回显/读取图片 URL）
- `OBJECT_S3_ENDPOINT`（R2 S3 兼容端点，如 `https://<accountid>.r2.cloudflarestorage.com`）
- `OBJECT_ACCESS_KEY_ID`
- `OBJECT_SECRET_ACCESS_KEY`
- `OBJECT_REGION`（R2 可用 `auto`）

3. 初始化数据库

```bash
psql "$DATABASE_URL" -f create_schema.sql
```

4. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

## 开发说明

- 当前鉴权为 JWT Bearer Token：
  - `Authorization: Bearer <access_token>`
  - 访问令牌需包含 `sub` 声明并使用 `HS256` 签名
  - 可通过环境变量配置 `OAUTH_JWT_SECRET` / `OAUTH_JWT_ISSUER` / `OAUTH_JWT_AUDIENCE`（非 `dev` 环境必须设置 `OAUTH_JWT_SECRET` 且不能使用默认值）
- 上传签名接口 `/api/v1/uploads/presign` 会返回 S3 兼容 `PUT` 预签名 URL（默认 10 分钟过期），前端应使用返回的 `put_url + headers` 直接上传对象存储。
- AI 点评已接入 SiliconFlow，默认模型为 `Qwen/Qwen3-VL-8B-Instruct`（需配置 `SILICONFLOW_API_KEY`）。
- 异步任务当前为进程内 worker，生产建议迁移到独立队列（如 Redis + Celery/RQ）。
- 默认限流：用户维度 `10 次/分钟`，IP 维度 `30 次/分钟`（可通过环境变量覆盖）。
- 默认使用 `request.client.host` 识别客户端 IP；仅在显式开启 `TRUST_X_FORWARDED_FOR=true` 时才会信任 `X-Forwarded-For`。
- 服务会记录 API 请求审计日志到 `api_request_logs`（IP、路径、状态码、耗时、请求体截断等）。

## 数据与设计文档

- 系统架构：`系统架构.md`
- 接口设计：`后端接口文档_v1.md`
- 数据库定义：`业务数据数据库定义.md`
- 建表 SQL：`create_schema.sql`
