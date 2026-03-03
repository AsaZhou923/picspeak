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

3. 初始化数据库

```bash
psql "$DATABASE_URL" -f create_schema.sql
```

4. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

## 开发说明

- 当前鉴权为开发态简化方案：
  - `Authorization: Bearer dev-<user_public_id>`
  - 首次请求会自动创建测试用户
- AI 点评已接入 SiliconFlow，默认模型为 `Qwen/Qwen3-VL-8B-Instruct`（需配置 `SILICONFLOW_API_KEY`）。
- 异步任务当前为进程内 worker，生产建议迁移到独立队列（如 Redis + Celery/RQ）。

## 数据与设计文档

- 系统架构：`系统架构.md`
- 接口设计：`后端接口文档_v1.md`
- 数据库定义：`业务数据数据库定义.md`
- 建表 SQL：`create_schema.sql`
