# PicSpeak

PicSpeak 是一个面向真实交付场景的 AI 摄影点评项目，包含：

- 后端服务：FastAPI + PostgreSQL + S3 兼容对象存储
- 前端应用：Next.js 14
- 业务闭环：游客/登录鉴权、图片直传、照片入库、AI 点评、任务轮询、历史查询、额度控制

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
- 支持统一错误码响应模型和请求追踪 ID
- 支持独立 worker 进程部署
- 支持任务重试、死信队列和任务事件编排日志

## 2. 技术栈

### 后端

- Python 3.10+
- FastAPI
- SQLAlchemy 2.x
- PostgreSQL
- boto3（S3 兼容对象存储）
- 进程内异步点评 Worker

### 前端

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS

## 3. 目录结构

```text
app/
  api/          # 路由、鉴权依赖
  core/         # 配置、安全、网络工具
  db/           # ORM 模型、数据库会话
  services/     # AI、对象存储、审核、限流、worker
  main.py       # 后端入口

frontend/
  src/app/      # Next.js App Router 页面
  src/components/
  src/lib/      # 前端 API 封装、类型、上下文

create_schema.sql                # 初始化建表脚本
migration_*.sql                  # 增量 SQL
后端接口文档_v1.md               # 当前接口文档
系统架构.md                      # 架构说明
业务数据数据库定义.md            # 数据库设计说明
全流程测试文档.md                # 测试流程说明
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
- `GET /api/v1/ws/tasks/{task_id}`（WebSocket）
- `GET /api/v1/reviews/{review_id}`
- `GET /api/v1/me/reviews`
- `GET /api/v1/photos/{photo_id}/reviews`
- `GET /api/v1/me/usage`
- `GET /healthz`

详细协议见 [后端接口文档_v1.md](/e:/Project%20Code/PicSpeak/后端接口文档_v1.md)。

## 6. 环境要求

### 基础依赖

- Python 3.10 或更高版本
- Node.js 18 或更高版本
- PostgreSQL 14+
- S3 兼容对象存储

### 第三方服务

- SiliconFlow API Key
- Google OAuth Client（如果启用 Google 登录）

## 7. 后端环境变量

后端通过根目录 `.env` 加载配置，建议以 `.env.example` 为模板。

### 必填项

- `DATABASE_URL`：PostgreSQL 连接串
- `OBJECT_BUCKET`：对象存储桶名
- `OBJECT_BASE_URL`：图片对外访问基础地址
- `OBJECT_S3_ENDPOINT`：S3 兼容端点
- `OBJECT_ACCESS_KEY_ID`
- `OBJECT_SECRET_ACCESS_KEY`
- `SILICONFLOW_API_KEY`

### 重要配置项

- `APP_ENV`：`dev` / `test` / `prod`
- `APP_SECRET`：应用签名密钥
- `MAX_UPLOAD_BYTES`：上传大小限制，默认 20MB
- `DEFAULT_DAILY_QUOTA`：`free` 用户每日额度基线
- `RATE_LIMIT_PER_MINUTE`：用户维度基线限流
- `IP_RATE_LIMIT_PER_MINUTE`：IP 维度限流
- `GUEST_BURST_LIMIT_PER_10S`：游客短时间突发限制
- `OAUTH_JWT_SECRET`：JWT 签名密钥，非 `dev` 环境必须设置为非默认值
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `FRONTEND_ORIGIN`：Google 登录完成后的前端跳转地址来源
- `BACKEND_CORS_ORIGINS`：允许跨域的前端来源，JSON 数组字符串
- `IMAGE_AUDIT_ENABLED`：是否开启图片审核
- `AI_MODEL_NAME` / `FLASH_MODEL_NAME` / `PRO_MODEL_NAME`：点评模型配置
- `RUN_EMBEDDED_WORKER`：是否由 API 进程内启动 worker
- `REVIEW_WORKER_NAME`：worker 实例名
- `REVIEW_RETRY_BASE_DELAY_SECONDS`：重试基础退避时间
- `REVIEW_RETRY_MAX_DELAY_SECONDS`：重试最大退避时间
- `WS_TASK_POLL_INTERVAL_MS`：WebSocket 推送时服务端轮询数据库间隔

### 用户等级与额度规则

- `guest`：额度为 `DEFAULT_DAILY_QUOTA` 的一半，至少 1 次
- `free`：额度等于 `DEFAULT_DAILY_QUOTA`
- `pro`：额度为 `DEFAULT_DAILY_QUOTA` 的 2 倍

## 8. 前端环境变量

建议在 `frontend/.env.local` 中配置：

- `NEXT_PUBLIC_API_URL`：后端服务地址，例如 `http://localhost:8000`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`

其中 `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`、`GOOGLE_OAUTH_REDIRECT_URI`、Google Console 中的回调地址必须保持一致。

## 9. 本地启动

### 9.1 初始化数据库

```bash
psql "$DATABASE_URL" -f create_schema.sql
psql "$DATABASE_URL" -f migration_20260305_daily_quota.sql
psql "$DATABASE_URL" -f migration_20260306_review_final_score.sql
```

### 9.2 启动后端

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端健康检查地址：

```text
GET http://localhost:8000/healthz
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

- 使用 `uvicorn` 多进程或 `gunicorn + uvicorn workers` 部署
- 通过 Nginx / 网关暴露 HTTPS
- PostgreSQL 与对象存储使用独立生产实例
- 生产环境建议关闭 `RUN_EMBEDDED_WORKER`，并单独启动 worker 进程
- 生产环境务必替换默认 `APP_SECRET` 与 `OAUTH_JWT_SECRET`
- `BACKEND_CORS_ORIGINS` 仅保留正式站点域名
- 如果服务部署在反向代理后，只有在可信代理环境下才开启 `TRUST_X_FORWARDED_FOR=true`

示例：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

独立 worker：

```bash
python -m app.worker_main
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
- `.env` 中生产配置已填写完整
- 对象存储桶已创建，且 CORS 已正确放行
- `OBJECT_BASE_URL` 可被前端直接访问
- Google OAuth 回调地址三处一致
- `SILICONFLOW_API_KEY` 已生效
- 前端 `NEXT_PUBLIC_API_URL` 已指向正式后端域名
- 后端 `BACKEND_CORS_ORIGINS` 已配置正式前端域名
- `/healthz` 可正常返回 `{"status":"ok"}`

## 12. 当前实现边界

以下能力在 README 中明确标注，便于上线时评估风险：

- 数据库任务队列已支持重试和死信，但当前仍基于 PostgreSQL，不是 Redis / MQ 中间件
- `/api/v1/me/usage` 当前只返回配额信息，`rate_limit` 结构仍为空对象
- 游客身份通过 Cookie `ps_guest_token` 维持，会受前后端域名和 Cookie 策略影响

如果要进入正式生产，优先建议补齐：

- 完整监控告警
- 自动化部署与回滚
- 更细粒度的权限与风控

## 13. 相关文档

- [后端接口文档_v1.md](/PicSpeak/后端接口文档_v1.md)
- [系统架构.md](/PicSpeak/系统架构.md)
- [Google登录接入指南.md](/PicSpeak/Google登录接入指南.md)
