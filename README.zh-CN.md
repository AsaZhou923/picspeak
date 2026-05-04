# PicSpeak

[English](README.md) | [简体中文](README.zh-CN.md)

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**PicSpeak** 是一款基于 AI 的摄影点评与视觉参考生成平台，旨在帮助各个水平的摄影爱好者提升拍摄技巧。只需上传一张照片，几秒钟内即可收到来自 AI 对构图、光线、色彩及情感表现等多维度的专业反馈，还可以继续生成 GPT Image 2 视觉参考图，规划下一次拍摄。无需注册，即可直接以游客身份开启体验。

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
- `AI 创作` — 基于模板、提示词、质量、画幅和风格生成视觉参考图，支持 OpenAI 兼容生图接口
- `提示词案例库` — 浏览可索引的 GPT Image 2 提示词案例，包含示例图、来源署名、本地化标题和静态详情页
- `复拍参考` — 在点评详情里把改进建议转成构图、光线、色彩或复拍方向的 AI 参考图
- `复拍练习闭环` — 把点评里的下一轮动作带回工作台，并保留来源点评与目标维度上下文
- `生成历史` — 查看生成结果、下载图片、复制提示词、再次生成，并可带回工作台作为复拍灵感
- `生图额度` — 展示每月 AI 生图点数，支持兑换码加点和购买额外点数包
- `使用额度` — 按日 / 按月控额，游客与注册用户独立计量
- `点评历史` — 随时查看过去的所有点评记录，支持分页、时间范围、评分区间、图片类型筛选
- `实时推送` — WebSocket 订阅任务进度，无需手动刷新
- `分享与导出` — 评图结果可生成分享链接或导出结构化数据便于复用
- `再次分析` — 复用历史照片直接再次发起分析，或换新照片重新点评
- `收藏功能` — 收藏喜欢的评图结果，独立收藏页面集中管理
- `影像长廊` — 展示社区精选作品，并提供服务端可见的点评摘要，便于公开浏览与搜索抓取
- `等待页阅读` — 评图和生图等待时可在任务页右侧直接阅读完整镜头手记文章

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
- 可选：OpenAI 兼容生图端点，以及 Lemon Squeezy Pro 和生图点数包结账链接

### 1. 克隆仓库

```bash
git clone https://github.com/AsaZhou923/picspeak.git
cd picspeak
```

### 2. 配置后端

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，按需填入数据库、对象存储、AI API、生图和计费配置
```

### 3. 安装后端依赖并运行迁移

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
python scripts/ensure_runtime_schema.py
# 也可以直接运行 Alembic:
# alembic upgrade head
cd ..
```

### 4. 启动后端

```bash
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

- [最新更新日志](docs/changelog/update-log-2026-05-04-analytics-retake-waiting-reader.md)
- [SEO / GEO 审计报告](docs/seo/seo-audit-2026-05-01.md)
- [后端接口文档](docs/api/后端接口文档_v1.md)
- [系统架构说明](docs/architecture/系统架构.md)
- [Google 登录接入指南](docs/guides/Google登录接入指南.md)

## Contributing

欢迎提交 Issue 和 Pull Request。

## License

[MIT](LICENSE)
