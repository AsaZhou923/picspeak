# PicSpeak 外部实体信号清单

日期：2026-05-09

目标：把站内 SEO/GEO 基础转成可被搜索引擎、AI 搜索和外部平台识别的品牌实体信号。短期不做大规模外链建设，先固定每周可复查的最小清单。

## 每周检查

| 信号 | 检查方式 | 合格标准 |
| --- | --- | --- |
| Search Console `/generate` | 记录 query、impression、click、indexed 状态 | 有可解释的曝光变化 |
| Search Console `/generate/prompts` | 记录 prompt library 相关 query | 至少能区分 GPT Image 2、prompt example、photo reference 查询 |
| Search Console `/gallery` | 记录 gallery / critique example 查询 | 有 impression 或明确说明无曝光 |
| 三语 Blog | 记录中英日文章抓取和 query | 新文章 7 天内进入索引观察 |
| `llms.txt` | 对照公开 URL 与产品能力 | AI Create、Prompt Library、Gallery、Blog 保持同步 |
| 外部页面引用 | 手工记录平台、URL、锚文本、目标页 | 至少 5 个稳定引用或链接候选 |
| 品牌实体一致性 | 检查 PicSpeak、作者、GitHub、X、站点描述 | 名称、作者、产品定位不冲突 |

## 外部引用候选

| 平台类型 | 候选动作 | 首选目标页 |
| --- | --- | --- |
| GitHub profile / repo | 在项目简介、README、topic 中统一 PicSpeak 描述 | `https://picspeak.art` |
| X / social profile | 固定产品定位和 AI photo critique 关键词 | `https://picspeak.art` |
| AI 工具目录 | 提交 AI photo critique + GPT Image 2 visual reference 描述 | `/generate` |
| 摄影学习内容 | 引用 Lens Notes 教程或工作流文章 | `/en/blog` 或具体文章 |
| Prompt 资源聚合 | 引用 GPT Image 2 prompt examples | `/generate/prompts` |
| 案例展示 | 引用公开 Gallery 示例 | `/gallery` |

## 记录模板

| 日期 | 平台 | URL | 目标页 | 锚文本/描述 | 状态 | 下次动作 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-05-09 | GitHub profile | 待补 | `https://picspeak.art` | AI photography critique and visual-reference creation web app | 待执行 | 补充 profile link |

## 不做事项

- 不购买低质量外链。
- 不批量生成目录页提交。
- 不把生成图混入真实摄影 Gallery 做外部宣传。
- 不为了短期 query 覆盖改变 PicSpeak “摄影点评 + 视觉参考”定位。
