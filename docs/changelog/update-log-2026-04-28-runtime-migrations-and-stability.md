# PicSpeak Update Log

日期：2026-04-28

## 概览

这次更新把运行时数据库维护从散落的手写建表/补列逻辑收拢到 Alembic 迁移，并补上认证、游客创建、审计日志、AI 生图下载、公开长廊推荐和前端本地化默认值上的稳定性修正。用户可感知到的结果是博客阅读数、公开长廊推荐、AI 生图历史/下载、首页语言和演示点评文案更稳定；部署侧则获得可重复执行的 schema 迁移和更明确的连接池配置。

- 后端运行时 schema 改由 Alembic baseline 与增量迁移管理，`ensure_runtime_schema()` 会升级到 head
- 游客创建、登录时间刷新、请求审计、转发 IP、Cloud Tasks secret 和 JWT 解析补上低风险加固
- 博客阅读数、公开长廊推荐、图片生成分页/下载、评图详情查询和重复上传判断改为更稳定的实现
- 前端 API base、WebSocket、OAuth、下载链接统一构造，生产环境缺少 API 地址会在构建期暴露
- 首页语言默认、`html lang`、三语演示点评和图片处理工具补齐回归保护

## 数据库迁移与运行时基础设施

- 新增 `backend/alembic.ini`、`backend/alembic/env.py` 和两份 `20260428` 迁移，建立当前运行时 schema baseline，并单独补上公开长廊与用量流水的低风险索引
- `backend/app/db/bootstrap.py` 不再维护一长串手写 DDL，而是通过 Alembic `upgrade head` 完成 runtime schema 检查
- `backend/app/db/models.py` 同步补齐 gallery 推荐索引、usage ledger 索引、`updated_at` 的 `onupdate` 行为，并把 Numeric 字段类型标注调整为 `Decimal`
- `backend/app/db/session.py` 增加非 SQLite 连接池参数，`backend/app/core/config.py` 提供 pool size、overflow、recycle 配置项
- `README.md` 与 `README.zh-CN.md` 从手动执行 `create_schema.sql` 改为安装依赖后运行 `python scripts/ensure_runtime_schema.py` 或 `alembic upgrade head`

## API 稳定性与安全

- 游客 token TTL 调整为 14 天，游客创建新增独立分钟级限速，登录时间刷新增加 5 分钟间隔，减少依赖阶段的重复写入
- 请求中的当前用户 public id 统一通过 `backend/app/api/request_state.py` 读写，错误日志、审计日志、Clerk/Lemon Squeezy webhook 都复用同一入口
- 审计日志的 fire-and-forget 写入现在会登记任务并在应用关闭时等待或取消，避免后台任务静默遗留
- `X-Forwarded-For` 只接受合法首个 IP，Cloud Tasks secret 使用 `secrets.compare_digest`，JWT 分段解析不再被额外分隔符误判为 malformed
- 博客阅读数改为 PostgreSQL upsert，公开长廊推荐百分位改为数据库窗口函数，图片生成历史游标改为 `created_at|id` 稳定游标并兼容旧 public id 游标
- AI 生图下载会校验对象 `ContentLength`，超出配置上限或大小未知时返回明确错误，同时响应带回 `Content-Length`
- 评图详情和公开分享查询合并照片与用户 join，上传重复检测只复用 READY 照片，避免被 REJECTED 记录挡住重新上传

## 前端语言、入口与图片处理

- `frontend/src/lib/api.ts` 统一构造 API、下载、WebSocket 和 Google OAuth 地址，支持 `NEXT_PUBLIC_API_URL` 已带 `/api` 或 `/api/v1` 的部署形态
- `frontend/src/proxy.ts` 按 URL 语言段写入 `x-picspeak-locale`，`frontend/src/app/layout.tsx` 用该值设置 `html lang`
- i18n 默认语言改为英文，路径语言优先于本地偏好，并通过 `picspeak-locale-sync` 事件同步未固定语言路由
- 新增 `frontend/src/lib/locale.ts` 统一 locale normalize 逻辑，`content-conversion` 与 `pro-conversion` 不再各自维护一份
- 首页演示图支持 `NEXT_PUBLIC_DEMO_IMAGE_URL` 覆盖，中文/日文演示点评文案补齐并修复日文乱码式措辞
- 新增 `frontend/src/lib/canvas.ts` 复用 canvas blob 转换；压缩流程限制 resize pass，EXIF 扫描上限提升到 1 MB，缩略图缓存失败会输出可诊断 warning
- Pro checkout 遇到已开通状态会直接转到账户用量页，主题切换和 outside-click hook 也收紧 hydration 与闭包行为

## 首页更新记录同步

- `/updates` 最新条目已写入 `frontend/src/content/updates/zh.json`、`frontend/src/content/updates/en.json` 和 `frontend/src/content/updates/ja.json`
- 首页底部“更新记录”提示已通过 `frontend/src/lib/i18n-zh.ts`、`frontend/src/lib/i18n-en.ts` 和 `frontend/src/lib/i18n-ja.ts` 指向本次“运行时迁移与稳定性”主题
- 本次更新文档路径为 `docs/changelog/update-log-2026-04-28-runtime-migrations-and-stability.md`

## 影响文件

### 后端

- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/versions/20260428_0001_baseline_runtime_schema.py`
- `backend/alembic/versions/20260428_0002_low_risk_indexes.py`
- `backend/app/api/deps.py`
- `backend/app/api/request_state.py`
- `backend/app/api/routers/auth.py`
- `backend/app/api/routers/auth_support.py`
- `backend/app/api/routers/billing.py`
- `backend/app/api/routers/blog.py`
- `backend/app/api/routers/gallery_support.py`
- `backend/app/api/routers/generations.py`
- `backend/app/api/routers/review_queries.py`
- `backend/app/api/routers/tasks.py`
- `backend/app/api/routers/uploads.py`
- `backend/app/api/routers/webhooks.py`
- `backend/app/core/config.py`
- `backend/app/core/network.py`
- `backend/app/core/security.py`
- `backend/app/db/bootstrap.py`
- `backend/app/db/models.py`
- `backend/app/db/session.py`
- `backend/app/main.py`
- `backend/app/services/guard.py`
- `backend/requirements.txt`
- `create_schema.sql`

### 前端

- `frontend/.env.local.example`
- `frontend/src/app/layout.tsx`
- `frontend/src/content/updates/en.json`
- `frontend/src/content/updates/ja.json`
- `frontend/src/content/updates/zh.json`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/auth-context.tsx`
- `frontend/src/lib/canvas.ts`
- `frontend/src/lib/compress.ts`
- `frontend/src/lib/content-conversion.ts`
- `frontend/src/lib/demo-review.ts`
- `frontend/src/lib/exif.ts`
- `frontend/src/lib/hooks/useOnClickOutside.ts`
- `frontend/src/lib/i18n-en.ts`
- `frontend/src/lib/i18n-initial.ts`
- `frontend/src/lib/i18n-ja.ts`
- `frontend/src/lib/i18n-zh.ts`
- `frontend/src/lib/i18n.tsx`
- `frontend/src/lib/locale.ts`
- `frontend/src/lib/pro-checkout.ts`
- `frontend/src/lib/pro-conversion.ts`
- `frontend/src/lib/review-thumbnail-cache.ts`
- `frontend/src/lib/theme-context.tsx`
- `frontend/src/proxy.ts`

### 测试与文档

- `backend/tests/test_alembic_bootstrap.py`
- `backend/tests/test_api_surface_regressions.py`
- `backend/tests/test_auth_transaction_helpers.py`
- `backend/tests/test_blog_post_views.py`
- `backend/tests/test_image_generation_routes.py`
- `backend/tests/test_low_risk_regressions.py`
- `backend/tests/test_public_gallery_route.py`
- `frontend/test/demo-review.test.ts`
- `frontend/test/locale-default.test.ts`
- `README.md`
- `README.zh-CN.md`
- `docs/changelog/update-log-2026-04-28-runtime-migrations-and-stability.md`

## 验证

- `cd backend && ..\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"`
- `cd frontend && npm exec -- tsx --test test/demo-review.test.ts test/locale-default.test.ts`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
