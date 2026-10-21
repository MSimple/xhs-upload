# 功能与菜单

## 导航

| 分组 | 菜单 | 路径 | 说明 |
| --- | --- | --- | --- |
| 总览 | 工作台 | `/` | 素材、待办、活动与最近作品 |
| 内容创作 | 素材库 | `/library` | 上传、识别、筛选、组合素材 |
| 内容创作 | 创作营 | `/campaign` | 活动规则、生成排期、体检和公告 |
| 内容创作 | 活动 | `/events` | 临时活动、截止时间、收集表 |
| 内容创作 | 拍什么 | `/campaign/inspiration` | 素材缺口与拍摄清单 |
| 发布运营 | 作品库 | `/posts` | 编辑作品，标记/撤回手动发布 |
| 发布运营 | 发布中心 | `/publish` | 今日/本周待发与最近发布 |
| 发布运营 | 发布日历 | `/calendar` | 月视图与排期 |
| 系统 | 设置 | `/settings` | AI 模型、内容人设、环境与数据 |

## 作品库 `/posts`

- 按全部/草稿/待发布/已发布筛选，支持搜索和排序。
- 每张作品卡片都有「标记已发布」快捷按钮；已发布作品显示「撤回标记」。
- 作品详情支持编辑标题、正文、标签、配图、封面、排期、AI 重写、复制文案、导出发布包。
- 发布是手动的：在小红书发布后回到作品里标记，作品会锁定配图并计入已发布数据。

## 发布中心 `/publish`

- 展示今日、逾期和未来 7 天的待发布队列。
- 队列行内可直接复制文案、导出发布包、打开小红书发布页、标记已发布。
- 展示已发布作品和笔记链接。
- 不读取账号数据，不执行自动发布。

## 设置 `/settings`

- **AI 模型**：Base URL、API Key、视觉/文本模型、连接测试。
- **内容人设**：账号人设、语气、签名、默认发布时间、每日篇数。
- **环境与数据**：Node/ffmpeg 状态、数据目录、访问令牌退出。

## API 路由

| 页面 | 主要接口 |
| --- | --- |
| `/` | `/api/stats`、`/api/settings`、`/api/images`、`/api/events` |
| `/posts` | `/api/posts`、`/api/posts/[id]`、`/api/posts/[id]/publish` |
| `/publish` | `/api/posts` |
| `/calendar` | `/api/calendar`、`/api/posts` |
| `/campaign` | `/api/campaign`、`/api/campaign/plan`、`/api/campaign/progress` |
| `/events` | `/api/events`、`/api/events/[id]` |
| `/settings` | `/api/settings`、`/api/health` |

手动发布状态接口：

```http
POST /api/posts/:id/publish
Content-Type: application/json

{ "published": true, "url": "https://www.xiaohongshu.com/explore/..." }
```

撤回本地标记：

```json
{ "published": false }
```
