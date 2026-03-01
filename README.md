# AI 摄影点评后端

## 快速启动

1. 创建虚拟环境并安装依赖

```bash
pip install -r requirements.txt
```

2. 配置环境变量（可复制 `.env.example`）

3. 初始化数据库

```bash
psql "$DATABASE_URL" -f create_schema.sql
```

4. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

## 默认说明

- 所有接口前缀：`/api/v1`
- 鉴权：`Authorization: Bearer dev-<user_public_id>`
- 若用户不存在，系统会按 `dev` token 自动创建测试用户
