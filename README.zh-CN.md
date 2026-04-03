# PicSpeak

[English](README.md) | [简体中文](README.zh-CN.md)

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**PicSpeak** 是一款基于 AI 的摄影点评 Web 应用。上传一张照片，几秒钟内即可收到来自 AI 的专业构图、光线与色彩分析。无需注册，直接以游客身份开始使用。

---

## 截图

| 主页 | 点评结果 |
|------|---------|
| ![主页](https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/screenshots/home.jpg) | ![点评结果](https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/screenshots/review.jpg) |

| 影像长廊 | 移动端 |
|---------|---------|
| ![影像长廊](https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/screenshots/gallery.jpg) | ![移动端](https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/screenshots/mobile.jpg) |

---

## 功能

- `游客模式` — 无需注册，即开即用
- `Google 登录` — 一键授权，解锁更高额度
- `图片直传` — 前端直接上传至对象存储，极速不经后端中转
- `AI 分类点评` — 对不同种类的作品围绕构图、光线、色彩、情绪冲击与技术完成度进行分维度打分与建议，支持轻量（Flash）与深度（Pro）两种模式
- `使用额度` — 按日 / 按月控额，游客与注册用户独立计量
- `点评历史` — 随时查看过去的所有点评记录，支持分页、时间范围、评分区间、图片类型筛选
- `实时推送` — WebSocket 订阅任务进度，无需手动刷新
- `分享与导出` — 评图结果可生成分享链接或导出结构化数据便于复用
- `再次分析` — 复用历史照片直接再次发起分析，或换新照片重新点评
- `收藏功能` — 收藏喜欢的评图结果，独立收藏页面集中管理
- `影像长廊` — 展示社区精选的优秀作品

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 · React 18 · TypeScript · Tailwind CSS |
| 后端 | Python 3.11 · FastAPI · SQLAlchemy 2.x |
| 数据库 | PostgreSQL |
| 存储 | S3 兼容对象存储 |

## 快速开始

### 前置依赖

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- S3 兼容对象存储（如 Cloudflare R2、MinIO）
- AI API Key（兼容 OpenAI 协议）

### 1. 克隆仓库

```bash
git clone https://github.com/AsaZhou923/picspeak.git
cd picspeak
```

### 2. 初始化数据库

```bash
psql "$DATABASE_URL" -f create_schema.sql
```

### 3. 配置后端

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入数据库、对象存储、AI API 等配置
```

### 4. 启动后端

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. 配置并启动前端

```bash
cp frontend/.env.example frontend/.env.local
# 编辑 frontend/.env.local，填入 NEXT_PUBLIC_API_URL 等配置

cd frontend
npm install
npm run dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)。

## 部署

后端与前端均可容器化部署，后端 `Dockerfile` 已包含在 `backend/` 目录中。

```bash
# 后端
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
python -m backend.app.worker_main   # 可选：独立 worker 进程

# 前端
cd frontend && npm run build && npm run start
```

## 文档

- [更新日志](docs/changelog/update-log-2026-03-21-strict-scoring.md)
- [后端接口文档](docs/api/后端接口文档_v1.md)
- [系统架构说明](docs/architecture/系统架构.md)
- [Google 登录接入指南](docs/guides/Google登录接入指南.md)

## Contributing

欢迎提交 Issue 和 Pull Request。

## License

[MIT](LICENSE)
