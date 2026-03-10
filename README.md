# PicSpeak

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**PicSpeak** 是一款基于 AI 的摄影点评 Web 应用。上传一张照片，几秒钟内即可收到来自 AI 的专业构图、光线与色彩分析。无需注册，直接以游客身份开始使用。

---

## 截图

> 📸 将应用截图放入 `docs/screenshots/` 文件夹后，取消下方注释即可在 README 中展示。

<!--
| 主页 | 点评结果 |
|------|---------|
| ![主页](docs/screenshots/home.png) | ![点评结果](docs/screenshots/review.png) |

| 历史记录 | 移动端 |
|---------|-------|
| ![历史记录](docs/screenshots/history.png) | ![移动端](docs/screenshots/mobile.png) |
-->

---

## 功能

- 🚀 **游客模式** — 无需注册，即开即用
- 🔑 **Google 登录** — 一键授权，解锁更高额度
- 🖼️ **图片直传** — 前端直接上传至对象存储，极速不经后端中转
- 🤖 **AI 点评** — 支持轻量（Flash）与深度（Pro）两种点评模式
- 📊 **使用额度** — 按日 / 按月控额，游客与注册用户独立计量
- 📋 **点评历史** — 随时查看过去的所有点评记录
- ⚡ **实时推送** — WebSocket 订阅任务进度，无需手动刷新

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
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

- [后端接口文档](后端接口文档_v1.md)
- [系统架构说明](系统架构.md)
- [Google 登录接入指南](Google登录接入指南.md)

## Contributing

欢迎提交 Issue 和 Pull Request！

## License

[MIT](LICENSE)
