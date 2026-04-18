# PicSpeak 仓库重构 / 拆分方案

日期：2026-04-18  
角色视角：技术负责人

## 1. 这次为什么该动

PicSpeak 当前不是“工程不可维护”，而是已经来到一个典型拐点：

- 功能足够多，继续叠加会明显放大单文件复杂度。
- 当前验证是健康的，但健康主要靠人工纪律维持。
- 文档和真实实现开始出现偏差，后续会拖慢协作和决策。

这次评估中，我已经验证了当前仓库仍然具备较好的可交付性：

- 后端测试通过：`..\ .venv\Scripts\python.exe -m pytest -q`，`56 passed`
- 前端检查通过：`npm run lint`
- 前端类型检查通过：`npm run typecheck`
- 前端生产构建通过：`npm run build`

所以这不是“救火式重构”，而是“趁系统还稳，提前拆边界”。

## 2. 当前仓库的结构信号

## 2.1 后端边界已经过载在单一路由文件

`backend/app/api/routes.py` 当前承载了几乎全部业务入口，至少包括：

- 认证：`backend/app/api/routes.py:855` 到 `backend/app/api/routes.py:1037`
- 上传与照片确认：`backend/app/api/routes.py:1200`、`backend/app/api/routes.py:1268`
- 点评创建与任务查询：`backend/app/api/routes.py:1834`、`backend/app/api/routes.py:2048`、`backend/app/api/routes.py:2065`
- Blog 浏览量：`backend/app/api/routes.py:2078`、`backend/app/api/routes.py:2100`
- Gallery 与点赞：`backend/app/api/routes.py:2136`、`backend/app/api/routes.py:2247`、`backend/app/api/routes.py:2275`
- Review 详情、历史、导出、分享、收藏、删除：`backend/app/api/routes.py:2296` 到 `backend/app/api/routes.py:2611`
- 照片代理与缩略图：`backend/app/api/routes.py:2632`、`backend/app/api/routes.py:2664`
- 使用量与 Billing：`backend/app/api/routes.py:2692`、`backend/app/api/routes.py:2825`、`backend/app/api/routes.py:2856`、`backend/app/api/routes.py:2882`
- WebSocket：`backend/app/api/routes.py:2916`

这个文件本身约 `2573` 行。它的问题不只是“长”，而是把多个独立变更面绑在一个文件里，任何一个域的改动都更容易引入无关冲突。

## 2.2 前端关键页面已经演变成状态机+展示层混合体

### 工作台页面

`frontend/src/app/workspace/page.tsx` 约 `822` 行，单页同时处理了：

- 登录态与套餐态：`frontend/src/app/workspace/page.tsx:177` 到 `frontend/src/app/workspace/page.tsx:193`
- 选图、预览、EXIF、上传进度：`frontend/src/app/workspace/page.tsx:194` 到 `frontend/src/app/workspace/page.tsx:201`
- 模式、图片类型、复用历史照片、配额弹窗：`frontend/src/app/workspace/page.tsx:203` 到 `frontend/src/app/workspace/page.tsx:210`
- 使用量拉取与同步：`frontend/src/app/workspace/page.tsx:214` 到 `frontend/src/app/workspace/page.tsx:231`
- 根据 URL 恢复复拍上下文：`frontend/src/app/workspace/page.tsx:233` 到 `frontend/src/app/workspace/page.tsx:260`

这说明该页已经是“上传域的应用层”，不再只是一个页面组件。

### 结果页

`frontend/src/app/reviews/[reviewId]/page.tsx` 约 `1106` 行，单页同时处理了：

- 建议卡片渲染与交互：`frontend/src/app/reviews/[reviewId]/page.tsx:47` 到 `frontend/src/app/reviews/[reviewId]/page.tsx:183`
- 页面导航、鉴权、文案态：`frontend/src/app/reviews/[reviewId]/page.tsx:187` 到 `frontend/src/app/reviews/[reviewId]/page.tsx:220`
- 数据读取、图片恢复、Zoom、使用量、分享、导出、收藏、加入 Gallery：`frontend/src/app/reviews/[reviewId]/page.tsx:222` 到 `frontend/src/app/reviews/[reviewId]/page.tsx:260`

这已经不是单纯的视图文件，而是“点评结果域控制器 + UI”的耦合体。

## 2.3 文档与真实实现存在偏差

架构文档写的是：

- 前端使用 `React Query`，见 `docs/architecture/系统架构.md:3`、`docs/architecture/系统架构.md:17`
- 存储层包含 `Redis`，见 `docs/architecture/系统架构.md:7`

但当前依赖清单中：

- `frontend/package.json:14` 到 `frontend/package.json:32` 没有 `@tanstack/react-query`
- `backend/requirements.txt:1` 到 `backend/requirements.txt:10` 没有 `redis` 相关依赖

这类偏差会直接影响后续协作，因为别人会根据文档对系统做错误假设。

## 2.4 命名和品牌仍有历史残留

后端应用标题仍然是 `AiPingTu Backend`，见 `backend/app/main.py:32`，但仓库和站点已经统一为 `PicSpeak`，见 `README.md:1`、`README.md:9`。这类残留不是功能 bug，但说明历史上下文还没有被完全清理。

## 2.5 好消息：核心异步链路和 AI 核心已经具备可保留基础

无需推翻重来，现有基础是能复用的：

- 嵌入式 worker 生命周期已经接入应用启动，见 `backend/app/main.py:23` 到 `backend/app/main.py:43`
- 请求级审计已经存在，见 `backend/app/main.py:135` 到 `backend/app/main.py:191`
- 异步任务过期、重试、抢占逻辑已经成形，见 `backend/app/services/review_task_processor.py:108` 到 `backend/app/services/review_task_processor.py:257`
- Cloud Tasks 分发边界清晰，见 `backend/app/services/task_dispatcher.py:13` 到 `backend/app/services/task_dispatcher.py:54`
- AI Prompt 和分数锁定已有测试保护，见 `backend/tests/test_ai_prompt.py:27` 到 `backend/tests/test_ai_prompt.py:164`
- Gallery 排序与游标逻辑已有测试保护，见 `backend/tests/test_public_gallery_route.py:27` 到 `backend/tests/test_public_gallery_route.py:228`

所以本次方案的原则不是重写，而是“把现有可用能力重新摆放到正确边界”。

## 3. 重构目标

本轮重构建议只追求四个目标：

1. 让后端按业务域拆开，`routes.py` 只做装配。
2. 让前端关键页面回到“页面入口”角色，把状态机和动作抽出去。
3. 让文档、依赖、品牌命名重新对齐。
4. 在不引入行为回归的前提下，降低未来 2-3 个月的维护成本。

## 4. 重构原则

1. 不做大爆炸重写，只做域切片迁移。
2. 先保行为，再谈优雅。
3. 第一阶段不引入新依赖。
4. 让页面 / 路由变薄，让服务 / hook 变清晰。
5. 每一阶段都必须可独立验证并可回退。

## 5. 目标结构

## 5.1 后端目标结构

建议把 `backend/app/api/routes.py` 拆成一个装配文件加多个领域路由文件。

### 建议目录

```text
backend/app/api/
  __init__.py
  deps.py
  router.py
  routers/
    auth.py
    uploads.py
    photos.py
    reviews.py
    tasks.py
    gallery.py
    billing.py
    blog.py
    webhooks.py
    realtime.py
```

### 边界建议

- `auth.py`
  - guest token
  - Google login / callback
  - Clerk exchange
  - guest migrate
- `uploads.py`
  - presign
  - confirm photo
- `photos.py`
  - image proxy
  - thumbnail
  - photo -> reviews
- `reviews.py`
  - create review
  - get review
  - share / export / meta / delete
  - me/reviews
- `tasks.py`
  - task status
  - internal execution
- `gallery.py`
  - public gallery
  - likes
  - gallery recommendation support
- `billing.py`
  - usage
  - checkout
  - activation code
  - billing portal
- `blog.py`
  - list views
  - increment views
- `webhooks.py`
  - Clerk
  - Lemon Squeezy
- `realtime.py`
  - websocket task stream

### 服务层建议

不需要一次性把所有逻辑再拆一层，但建议至少把这些组合逻辑从路由文件里挪出去：

- 画廊排序 / 推荐相关逻辑
- review export payload 构造
- photo proxy / thumbnail 相关逻辑
- billing portal 选择与刷新逻辑
- blog view 读写逻辑

## 5.2 前端目标结构

建议把当前以 `app/` 为中心的厚页面拆成“页面入口 + feature 目录”。

### 建议目录

```text
frontend/src/
  app/
    workspace/page.tsx
    reviews/[reviewId]/page.tsx
  features/
    workspace/
      hooks/
        useWorkspaceUsage.ts
        useUploadFlow.ts
        useReplayContext.ts
      components/
        WorkspaceShell.tsx
        UploadPanel.tsx
        ModePicker.tsx
        QuotaBanner.tsx
        ReplayBanner.tsx
    review-detail/
      hooks/
        useReviewDetail.ts
        useReviewActions.ts
        useReviewPhoto.ts
      components/
        ReviewHeader.tsx
        ReviewImagePanel.tsx
        ReviewScoreSummary.tsx
        CritiqueSection.tsx
        ReviewActionBar.tsx
        ReviewGalleryPanel.tsx
```

### 页面职责调整

- `app/.../page.tsx`
  - 只处理路由参数、页面级布局和组合
- `features/.../hooks`
  - 处理 API 调用、状态机、错误态、恢复逻辑
- `features/.../components`
  - 处理纯展示或低耦合交互
- `lib/...`
  - 保留通用工具、类型、i18n、轻量数据适配

## 6. 推荐执行顺序

## Phase 0：冻结行为与建立护栏 ✅ 已完成（2026-04-18）

### 目标

在动结构之前先确保可验证。

### 要做什么

- 保留现有后端测试为第一层护栏：
  - `backend/tests/test_ai_prompt.py`
  - `backend/tests/test_public_gallery_route.py`
  - `backend/tests/test_blog_post_views.py`
  - `backend/tests/test_app_startup.py`
- 把今天验证过的命令固化为重构期间的最低验收集：
  - `..\ .venv\Scripts\python.exe -m pytest -q`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run build`
- 先不改接口契约，不改 URL，不改字段命名。

### 已完成工作

- 修复了 `ProductAnalyticsProvider` 中 `useSearchParams()` 未包裹 Suspense 边界导致的构建失败问题（`frontend/src/components/providers/AppProviders.tsx`）。

### 验收标准

- ✅ 重构前后接口行为一致。
- ✅ 重构前后构建和测试命令都通过：
  - `59 passed` (pytest)
  - lint 通过
  - typecheck 通过
  - build 通过

## Phase 1：先拆后端路由文件

### 原因

后端的耦合最集中，且它的业务边界天然更清晰，先拆更容易形成收益。

### 执行方式

1. 新建 `backend/app/api/router.py`，只做 `include_router(...)`
2. 以最小搬运方式把认证相关路由迁到 `routers/auth.py`
3. 再按 `uploads/photos/reviews/tasks/gallery/blog/billing/webhooks/realtime` 逐域迁移
4. 允许先保留共用私有函数在旧文件，再第二轮向服务层下沉
5. 最后把 `routes.py` 缩成兼容层或直接删除

### 验收标准

- `backend/app/api/routes.py` 不再承担主业务实现
- 每个 router 文件只负责一个业务域
- 迁移期间所有现有测试保持通过

## Phase 2：拆工作台页面

### 原因

工作台是最重要的入口页，也是后续产品实验最频繁的页面。如果不拆，任何改动都会反复碰上传、配额、复拍、鉴权这几类逻辑。

### 执行方式

先把页面分成三块：

1. `useWorkspaceUsage`
   - 拉 usage
   - 处理 plan / quota 同步
2. `useUploadFlow`
   - 选图
   - 压缩/哈希
   - presign
   - 对象上传
   - confirm
3. `useReplayContext`
   - 解析 URL 参数
   - 恢复 source review
   - 处理 replay photo

然后把 UI 拆成：

- `UploadPanel`
- `ModePicker`
- `QuotaBanner`
- `ReplayBanner`

### 验收标准

- `frontend/src/app/workspace/page.tsx` 控制在 250-350 行以内
- 上传链路行为不变
- 复拍 / replay 行为不变
- `npm run lint`、`npm run typecheck`、`npm run build` 保持通过

## Phase 3：拆结果页

### 原因

结果页已经同时承担“读取数据、恢复图片、评分展示、建议交互、分享导出、收藏、画廊提交、升级引导”。它是产品价值最集中的页面，也是最需要可持续演化的页面。

### 执行方式

先抽 hook，再拆组件：

#### hooks

- `useReviewDetail`
  - 拉取 review
  - 基础 loading / error
- `useReviewPhoto`
  - 处理本地缓存图片恢复
  - 处理 zoom / recover
- `useReviewActions`
  - share
  - export
  - favorite
  - gallery
  - replay

#### components

- `ReviewHeader`
- `ReviewImagePanel`
- `ReviewScoreSummary`
- `CritiqueSection`
- `ReviewActionBar`
- `ReviewGalleryPanel`

### 验收标准

- `frontend/src/app/reviews/[reviewId]/page.tsx` 控制在 300-400 行以内
- 结果页所有动作保持原有行为
- 分享 / 导出 / 收藏 / 加入画廊都保持可用

## Phase 4：文档与命名对齐

### 目标

消除“代码是真实的、文档是历史的”状态。

### 要做什么

- 修正架构文档中的已过期描述：
  - React Query
  - Redis
- 把文档中的“建议架构”和“当前实现”分开写
- 统一品牌命名：
  - `AiPingTu Backend` -> `PicSpeak Backend`
- 在 README 或 `docs/` 中新增一份真正对应当前实现的模块说明

### 验收标准

- 文档不再描述仓库中不存在的依赖
- 新成员仅看 README + architecture 即可建立正确心理模型

## 7. 文件体量预算

这轮重构建议给出明确预算，避免“拆了但还是很厚”。

### 后端

- `router.py`：< 120 行
- 每个领域 router：< 300 行
- 复杂逻辑进入 service / helper

### 前端

- 入口 `page.tsx`：< 350 行
- 单个 feature hook：< 200 行
- 单个展示组件：< 180 行

这不是绝对规则，但应该作为持续约束。

## 8. 风险与应对

### 风险 1：拆文件时引入隐式循环依赖

应对：

- 先搬路由，不急着二次抽象
- service 只向下依赖 `db/models/schemas/core`

### 风险 2：前端拆分后 props 爆炸

应对：

- 先抽 hook，再拆组件
- 保持页面作为局部组合层，不要过度全局化

### 风险 3：重构变成审美工程

应对：

- 每一阶段都绑定一个明确收益：
  - Phase 1 降低后端冲突面
  - Phase 2 提高工作台可改造性
  - Phase 3 提高结果页可演化性
  - Phase 4 提高文档可信度

### 风险 4：一次改太多导致验证成本激增

应对：

- 每个 Phase 独立提交
- 每个 Phase 单独跑完整验收命令

## 9. 这轮不建议做的事

- 不建议先上新状态管理库。
- 不建议先引入新的前端数据层框架。
- 不建议先大改数据库模型。
- 不建议先改 API 契约。
- 不建议先做“全仓库统一 feature-first 重写”。

先把最痛的文件和最明显的边界问题拆开，收益最大，风险最小。

## 10. 最终验收标准

如果这轮重构完成，应该至少达到以下状态：

1. 后端路由按业务域拆分完成。
2. 工作台和结果页不再是超厚控制器文件。
3. 架构文档与依赖清单一致。
4. 品牌命名无历史残留。
5. 后端测试、前端 lint、typecheck、build 持续通过。

## 11. 结论

当前 PicSpeak 最值得做的技术工作不是继续加抽象，而是把已经存在的产品复杂度重新放回清晰边界里。

这轮重构的目标应该是：

- 让产品继续迭代时更敢改
- 让多人协作时更少互相踩线
- 让文档重新成为可信入口

如果按这个顺序执行，1-2 个迭代内就能把仓库从“能持续推进，但越来越重”拉回到“能持续推进，而且越来越稳”的状态。

## 12. 本次评估依据

- 后端应用入口与审计：`backend/app/main.py:23` 到 `backend/app/main.py:43`、`backend/app/main.py:135` 到 `backend/app/main.py:191`
- 异步任务处理：`backend/app/services/review_task_processor.py:108` 到 `backend/app/services/review_task_processor.py:257`
- Cloud Tasks 分发：`backend/app/services/task_dispatcher.py:13` 到 `backend/app/services/task_dispatcher.py:54`
- 后端测试护栏：`backend/tests/test_app_startup.py:17` 到 `backend/tests/test_app_startup.py:25`、`backend/tests/test_ai_prompt.py:27` 到 `backend/tests/test_ai_prompt.py:164`、`backend/tests/test_blog_post_views.py:16` 到 `backend/tests/test_blog_post_views.py:70`、`backend/tests/test_public_gallery_route.py:26` 到 `backend/tests/test_public_gallery_route.py:228`
- 工作台页面：`frontend/src/app/workspace/page.tsx:177` 到 `frontend/src/app/workspace/page.tsx:260`
- 结果页：`frontend/src/app/reviews/[reviewId]/page.tsx:47` 到 `frontend/src/app/reviews/[reviewId]/page.tsx:260`
- 依赖清单：`frontend/package.json:14` 到 `frontend/package.json:32`、`backend/requirements.txt:1` 到 `backend/requirements.txt:10`
- 架构文档偏差：`docs/architecture/系统架构.md:3`、`docs/architecture/系统架构.md:7`、`docs/architecture/系统架构.md:17`
