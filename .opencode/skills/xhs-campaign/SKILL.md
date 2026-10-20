---
name: xhs-campaign
description: 操作 xhs-upload 的「有理想的创作者」创作营：给素材打活动标签、按积分/字数规则批量生成探店文案、自动排期并由调度器发布。用于检查状态、批量打标、生成排期、调整每周篇数/创作者等级/发布时间、排查未发布和不合规问题。
metadata:
  audience: xhs-upload operators
  workflow: campaign
  opencode/slash: "true"
---

# 有理想的创作者 · 创作营

本项目的创作营是 xhs-upload 内置功能，入口在 `http://127.0.0.1:3000/campaign`。它把带活动标签的图片交给 AI 分组写文案，按天排期，并复用现有 Playwright 发布器和调度器自动发布。

积分口径：**10 积分 = 1 元**。页面和接口里的积分字段都是积分，不是元。

活动硬性约束：
- 每周最多 4 篇，每天最多 1 篇，按自然周统计；调度器会同时执行日上限和周上限。
- 图文至少 **6 张图 + 50 字**，图片实拍率 ≥80%，车辆相关内容 ≥50%；视频至少 30 秒 + 20 字 + 高清（本工具只支持图文）。
- 探索者 150 积分/篇、每周上限 600；共创者（1001 粉以上 + 2 篇小眼睛超 1500）300 积分/篇、每周上限 1200。
- 明确禁止 AI 痕迹。AI 文案只能作为草稿，发布前需要人工改写；代写/抄袭/非本人笔记会取消资格。
- 本项目账号已在官方群，已移除「登记拉群」发布门禁；如果换新号，仍需按官方流程先登记再发帖。
- 官方话题已改版：**车型词 + AI 自动三选一赛道**，每篇只带一组：
  - `#车型词 #我的智系车`
  - `#车型词 #开车出去玩`
  - `#车型词 #车内躺平计划`
  - 旧话题 `#有理想的生活` 已停用，不要再带；也不要三组全加。
- 搬运、图文不符、同质化、流水账、车辆内容<50%、商城种草、无实质内容、影视/游戏/行车记录仪占比高、AI 痕迹、图片转视频都按水帖处理，不计积分；水贴会通知车主且不支持修改，水帖超 25% 取消资格。
- 危险驾驶、诋毁品牌、刷量、提前删除/隐藏（需公开至活动结束后 90 天）、PS 作假、负面/不实信息也会不计分或取消资格。

## 前置检查

1. 服务在跑：`GET /api/campaign` 返回 200。
2. AI 已配置：`GET /api/settings` 的 `configured` 为 `true`，否则只会生成演示文案。
3. 小红书已登录：`GET /api/xhs/status` 的 `loggedIn` 为 `true`，且 `publishing` 为 `false`。
4. 已设置 `campaign_model`（车型词）。赛道由 AI 按内容自动选择，不需要手动设置。

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/campaign | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:3000/api/xhs/status | ConvertTo-Json
```

## 每周标准流程

1. **上传并打标**：打开 `/library?campaign=1`，上传时勾选「归入活动『有理想的创作者』」。也可以给已有图片批量打标：
   ```powershell
   $body = @{ ids = @("<图片id>"); action = "campaign" } | ConvertTo-Json
   Invoke-RestMethod http://127.0.0.1:3000/api/images/bulk -Method Post -ContentType "application/json" -Body $body
   ```
2. **生成排期**：页面点「全部排期」，或调用：
   ```powershell
   Invoke-RestMethod http://127.0.0.1:3000/api/campaign/plan -Method Post -ContentType "application/json" -Body '{"all":true}'
   ```
   返回 `created`、`warnings`、`remaining`。正文不足最少字数、标题重复的条目会被跳过并写入 `warnings`。
3. **自动发布**：调度器每分钟检查一次，到 `campaign_time` 后按 `ready` 状态逐篇发布。活动开启「自动补齐队列」时，未来排期少于 `campaign_buffer_weeks × campaign_weekly_posts` 会自动再生成一批。
   调度器会跳过：配图少于 6 张、正文少于 50 字、缺少车型话题、缺少赛道话题、带了旧话题或多组赛道、今天已发过活动作品、本周已发满 4 篇的活动作品。
4. **验收**：`GET /api/campaign` 看 `counts` 和 `next`；`GET /api/posts?status=published` 看发布结果。

## 拍摄灵感（拍什么）

页面：`/campaign/inspiration`。当用户不知道该拍什么时，先打开这里看「素材缺口」和清单。

- `GET /api/campaign/inspiration`：返回 `coverage`（按素材摘要粗略统计的分类覆盖）、`gaps`、已保存的 `ideas`。
- `POST /api/campaign/inspiration`：追加一批拍摄任务。
  ```json
  { "count": 8, "category": "补能充电", "city": "杭州", "focus": "想拍家庭出行" }
  ```
  AI 失败会自动回退内置灵感库；`mock: true` 表示用了内置库。
- `PATCH /api/campaign/inspiration/<id>`：`{ "done": true }` 标记已拍。
- `DELETE /api/campaign/inspiration/<id>`：删除单条。
- `DELETE /api/campaign/inspiration`：清空当前活动清单。
- 城市会写入 `campaign_city`，下次生成继续使用。
- 分类：门店探店、外观质感、内饰空间、家庭出行、试驾智驾、补能充电、生活方式、细节特写、夜间氛围、视频素材。
- 缺口分析会根据图片摘要/标签里的汽车关键词判断，属于粗略统计；不要把它当成精确的图片分类。

## 常用设置

`PUT /api/campaign`，只传要改的字段：

```json
{
  "campaign_enabled": "1",
  "campaign_auto_plan": "1",
  "campaign_auto_publish": "1",
  "campaign_model": "理想i6",
  "campaign_tier": "explorer",
  "campaign_weekly_posts": "4",
  "campaign_time": "19:30",
  "campaign_body_min": "220",
  "campaign_city": "杭州",
  "campaign_buffer_weeks": "2",
  "campaign_batch_images": "30",
  "campaign_points_per_post": "150",
  "campaign_points_cap": "600",
  "campaign_start_date": ""
}
```

- `campaign_tier` 只能是 `explorer`（0-1000 粉，150/篇、600/周）或 `creator`（1001 粉以上，300/篇、1200/周）；只传 tier 时后端会自动带出积分值。共创者还要求至少 2 篇小眼睛超 1500 的笔记，最终以官方晋级结果为准。
- `campaign_model` 填自己的车型词（不带 #，例如 `理想i6`、`理想L6`、`理想MEGA`）。
- 赛道不再手动选：AI 根据图片和文案从 `我的智系车`、`开车出去玩`、`车内躺平计划` 中选一个最贴合的，并结合最近 30 篇的使用次数尽量均衡；缺失或无效时用关键词打分兜底。
- 生成和发布时会自动组合成 `#车型词 #赛道`，并移除旧话题 `#有理想的生活` 和其他赛道；每篇只保留一组。
- `campaign_weekly_posts` 范围 1-4，系统强制不超过 4 篇/周；排期默认周一/三/五/六。
- `campaign_body_min` 最低 50，默认 220（活动要求正文 ≥50 字，但“优质内容”仍建议写够 200 字以上）。
- `campaign_buffer_weeks` 是提前储备周数，默认 2 周；队列目标 = 周数 × 每周篇数。
- `campaign_points_cap` 是**每周积分上限**，不是单篇上限。
- `campaign_batch_images` 是一次交给 AI 的图片数，30 张左右约生成 5-8 篇；每组必须至少 6 张图。
- `campaign_start_date` 留空表示从明天开始；填了过去的日期会被忽略。
- `campaign_auto_publish=0` 时只生成草稿，便于人工改写和审核。

## 群公告 / 收集表

- 每个月初把群公告整段粘贴到 `/campaign` 的「群公告 / 本月收集表」卡片，点「解析并保存」。
- `POST /api/campaign/announcement`，body `{"text":"群公告全文"}`：自动提取飞书链接、月份，保存 `campaign_announcement_raw/links/month/at`。
- `GET /api/campaign/announcement`：读取当前公告和已解析链接。
- 个人微信群没有稳定的官方接口，无法直接监控；需要自动监控时，只有企业微信群机器人/webhook 或实验性桌面 UI 自动化，前者需要群管理员权限，后者不可靠，不建议。
- 飞书收集表目前只提供直达链接，不自动提交；要自动填写需要表单字段映射和登录态，必须先拿到表单结构再评估。

## 规则与实现细节

- 活动标签就是 `campaign` 字段，写入图片和作品；每篇第一个话题是 `#车型词`，第二个是所选赛道，只保留一组。
- 普通「AI 智能策划」默认排除活动图片，避免抢占活动素材；手动勾选图片时仍可强制使用。
- 文案要求：正文 ≥ `campaign_body_min`（活动底线 50）、标题 ≤20 字、每组 6-9 张图（少于 6 张整组跳过）、避开最近已发布标题、不使用绝对化表述、不编造地址价格。
- 发布前检查：`GET /api/campaign` 的 `issues` 同时返回硬性 `issues` 和自查 `warnings`。
  - 硬性：配图<6、正文<50、缺车型话题、缺赛道话题、带旧话题/多组赛道、同日/同周超限；调度器会跳过。
  - 自查：车辆内容<50%、素材含 AI/游戏/影视/插画痕迹、正文像流水账；不阻止发布，但可能不计积分。
- 现有作品如果配图不足 6 张，不要直接改成 `ready`；先补图或合并，否则不会发布也不会产生有效积分。
- AI 痕迹无法自动检测；`campaign_auto_publish=1` 时务必人工改写文案后再让它发布。
- 手动点作品里的「自动发布」也会走同一套合规门禁（6 图、50 字、车型词+单个赛道）；不合规会直接报错，不能绕过。
- 作品需保持公开可见至活动结束后 90 天；提前删除、隐藏、设为仅自己可见都会影响积分。
- 发布车型必须与账号认证车型一致，认证手机号要和 App 手机号一致；不要发竞品、危险驾驶、负面或不实信息。
- 活动接口只支持 `POST /api/campaign/plan`，没有 GET。
- 「填文档」步骤尚未实现，不要凭空调用相关接口。

## 排查

- `created: []`：没有未使用的活动素材，或素材没识别；看 `counts.unused` 和 `counts.pendingAnalysis`。
- 一直不发布：依次检查 `/api/xhs/status` 的登录状态、`xhs_scheduler` 是否为 `1`、作品是否为 `ready` + `autoPublish: true`，以及 `GET /api/campaign` 的硬性 `issues` 是否为空。
- 文案被跳过：看 `warnings`，通常是字数不足或标题重复；可补充图片后重试。
- 服务重启：`npm run build` 后 `npm start`，调度器会随服务启动。
