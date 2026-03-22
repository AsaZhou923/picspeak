# Google 登录接入指南（PicSpeak）

本文档用于指导你把前端接入到当前后端的 Google 登录体系。后端已经提供了 Google 登录换取业务 JWT 的能力：

- `POST /api/v1/auth/google/login`
- `GET /api/v1/auth/google/callback`
- `POST /api/v1/auth/guest`

> 设计原则：前端先拿 Google `id_token`，再调用后端登录接口换取业务 `access_token`；后续请求统一带 `Authorization: Bearer <access_token>`。

---

## 1. 前置准备

### 1.1 在 Google Cloud 创建 OAuth Client

1. 打开 Google Cloud Console。  
2. 进入 **APIs & Services** -> **Credentials**。  
3. 创建 **OAuth 2.0 Client ID**（Web / Android / iOS 按你的客户端类型选择）。  
4. 配置允许的来源（Web）或包名+SHA（Android）等平台参数。  
5. 记录 `client_id`，例如：`123xxx.apps.googleusercontent.com`。

### 1.2 后端环境变量

在后端 `.env` 配置以下字段：

```env
# 业务 JWT 签发/验签密钥（生产必须改成强随机值）
OAUTH_JWT_SECRET=replace-with-strong-secret

# 可选：业务 JWT 发行方和受众
OAUTH_JWT_ISSUER=your-issuer
OAUTH_JWT_AUDIENCE=your-audience

# 可选但强烈建议：校验 Google token aud
GOOGLE_OAUTH_CLIENT_ID=123xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
```

说明：

- 若配置了 `GOOGLE_OAUTH_CLIENT_ID`，后端会校验 Google `id_token` 的 `aud` 是否一致。
- 后端会通过 Google `tokeninfo` 接口验证 `id_token` 有效性与邮箱验证状态。

---

## 2. 时序流程

### 2.1 Google 登录流程（推荐）

1. 前端调用 Google SDK 发起登录，拿到 `id_token`。  
2. 前端请求后端：`POST /api/v1/auth/google/login`，body 为 `{"id_token":"..."}`。  
3. 后端返回业务 JWT：

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user_id": "google-sub",
  "plan": "free"
}
```

4. 前端保存 `access_token`（建议短期内存 + 安全持久化）。  
5. 访问业务接口时带：

```http
Authorization: Bearer <access_token>
```

### 2.2 游客流程（兜底）

未携带 Authorization 时后端会自动创建游客并下发 `ps_guest_token` Cookie，因此用户进入网站后可直接使用评图服务。


如果用户暂不登录 Google，可先调用：`POST /api/v1/auth/guest` 获取游客 token。

返回示例：

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user_id": "gst_xxx",
  "plan": "guest"
}
```

### 2.3 Google code 回调流程（无前端 SDK）

1. 浏览器跳转 Google 授权页获取 `code`。  
2. 前端/服务端请求：`GET /api/v1/auth/google/callback?code=...`。  
3. 后端用 `code` 向 Google 换 token，取 `id_token` 验证后签发业务 JWT。

---

## 3. 接口调用示例

## 3.1 Google 登录换 token

```bash
curl -X POST 'http://localhost:8000/api/v1/auth/google/login' \
  -H 'Content-Type: application/json' \
  -d '{"id_token":"<google-id-token>"}'
```

### 3.2 游客 token

```bash
curl -X POST 'http://localhost:8000/api/v1/auth/guest'
```

### 3.3 Google code 回调

```bash
curl "http://localhost:8000/api/v1/auth/google/callback?code=<google-code>"
```

### 3.4 带 token 调用评图接口

```bash
curl -X POST 'http://localhost:8000/api/v1/reviews' \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"photo_id":"pho_xxx","mode":"flash","async":true}'
```

---

## 4. 用户等级与额度说明

当前后端等级与策略：

- `guest`：分钟级限流为基线 1/2；每日评图额度 3 次。
- `free`：分钟级限流为基线；每日评图额度 6 次。
- `pro`：分钟级限流为基线 2 倍；每日评图额度 12 次。

说明：

- Google 登录新用户默认是 `free`。
- 游客用户升级为 Google 登录后，用户等级会提升到 `free`。

---

## 5. 前端实现建议

1. **统一 Auth Store**：存 `access_token / plan / user_id`。  
2. **请求拦截器**：自动注入 Bearer token。  
3. **401 处理**：收到 401 时清理本地 token，回到登录页或游客态。  
4. **游客升级**：当游客点击“登录 Google”后，用新的 `access_token` 覆盖旧 token。  
5. **额度提示**：在 `/api/v1/me/usage` 展示剩余额度，避免用户在提交点评前才收到 429。

---

## 6. 常见问题排查

### 6.1 `Invalid Google token audience`

- 检查后端 `GOOGLE_OAUTH_CLIENT_ID` 是否与前端实际使用的 Google OAuth Client ID 一致。
- 检查是否混用了 Android/iOS/Web 的 client_id。

### 6.2 `Google account email is not verified`

- 该 Google 账号邮箱未验证，需先在 Google 账号侧完成验证。

### 6.3 `Invalid access token: ...`

- 检查请求头是否为 `Authorization: Bearer <token>`。
- 检查后端 `OAUTH_JWT_SECRET` 是否在多实例中一致。

### 6.4 触发 429

- 达到分钟限流或每日评图额度。
- 通过 `/api/v1/me/usage` 查看当前额度与限流窗口。

---

## 7. 安全建议（生产）

- 使用强随机 `OAUTH_JWT_SECRET` 并定期轮换。  
- 开启 `GOOGLE_OAUTH_CLIENT_ID` 的受众校验。  
- 全站 HTTPS。  
- 前端不要把 `access_token` 暴露在 URL。  
- 如需更强安全性，可后续补充 refresh token 机制与设备会话管理。
