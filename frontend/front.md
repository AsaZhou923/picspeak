# 前端说明

`frontend` 目录是 PicSpeak 的前端项目，基于 Next.js 14 + React 18 + Tailwind CSS，实现了页面规划文档中的主要页面和基础交互框架。

## 1. 技术栈

- Next.js 14（App Router）
- React 18
- TypeScript
- Tailwind CSS
- `lucide-react` 图标库

## 2. 目录结构

```text
frontend/
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── page.tsx
    │   ├── workspace/page.tsx
    │   ├── auth/callback/google/page.tsx
    │   ├── tasks/[taskId]/page.tsx
    │   ├── reviews/[reviewId]/page.tsx
    │   ├── photos/[photoId]/reviews/page.tsx
    │   ├── account/usage/page.tsx
    │   └── error/page.tsx
    ├── components/
    │   ├── layout/
    │   ├── ui/
    │   └── upload/
    └── lib/
        ├── types.ts
        ├── api.ts
        └── auth-context.tsx
```

## 3. 主要文件说明

### `src/app`

- `layout.tsx`：全局布局，通常用于挂载全局字体、头尾结构和认证上下文。
- `globals.css`：全局样式、设计变量、动画和基础视觉风格。
- `page.tsx`：首页，对应产品落地页。
- `workspace/page.tsx`：评图工作台，对应上传图片、查看额度、发起点评的主页面。
- `auth/callback/google/page.tsx`：Google 登录回调页。
- `tasks/[taskId]/page.tsx`：异步任务处理中页面，负责轮询任务状态。
- `reviews/[reviewId]/page.tsx`：点评结果页。
- `photos/[photoId]/reviews/page.tsx`：单张照片的历史点评列表页。
- `account/usage/page.tsx`：账户额度与套餐状态页。
- `error/page.tsx`：通用错误页。

### `src/components`

- `layout/`：页面级公共布局组件，例如页头、页脚。
- `ui/`：通用 UI 组件，例如分数环、加载器、标签。
- `upload/`：上传相关组件，目前核心是 `ImageUploader.tsx`。

### `src/lib`

- `types.ts`：前端使用的 TypeScript 类型定义。
- `api.ts`：后端接口封装，统一处理请求和返回结构。
- `auth-context.tsx`：前端认证上下文，负责保存和分发登录状态。

## 4. 页面与业务映射

当前前端实现与业务页面规划的对应关系如下：

- `/`：首页
- `/workspace`：上传与评图工作台
- `/auth/callback/google`：Google OAuth 回调
- `/tasks/[taskId]`：任务处理中
- `/reviews/[reviewId]`：点评结果
- `/photos/[photoId]/reviews`：照片历史点评
- `/account/usage`：额度与账户状态
- `/error`：错误页

这套路由结构已经覆盖当前后端提供的核心能力：

- 游客进入与身份兜底
- Google 登录
- 图片上传与确认
- 发起 AI 点评
- 查询任务状态
- 查看点评结果
- 查看照片历史点评
- 查看额度与限流信息

## 5. 环境变量说明

请基于 `.env.local.example` 创建本地文件：

```bash
cp .env.local.example .env.local
```

需要关注的变量：

- `NEXT_PUBLIC_API_URL`：后端服务地址，例如 `http://localhost:8000`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`：Google OAuth Client ID
- `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`：Google 登录回调地址，必须与 Google Console 和后端配置保持一致

本地开发示例：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=你的 Google Client ID
NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback/google
```

## 6. 启动方式

在 `frontend` 目录下执行：

```bash
npm install
npm run dev
```

默认访问地址：

- 前端：http://localhost:3000
- 后端：http://localhost:8000

## 7. 协作约定

- 提交代码时不要提交 `node_modules`、`.next`、`.env.local` 等本地产物。
- 如新增页面，优先放在 `src/app` 对应路由目录下。
- 如新增接口调用，统一收敛到 `src/lib/api.ts`。
- 如新增全局身份逻辑，优先复用 `src/lib/auth-context.tsx`。
- 如新增通用视觉组件，优先放入 `src/components/ui/`。
