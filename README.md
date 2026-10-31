# 同词相遇 V1.0

手机优先的中文联想游戏。React + Vite + TypeScript + Tailwind CSS；Supabase 匿名身份、Postgres RPC、Realtime；可部署到 Vercel。

## 本地启动

要求 Node.js 22.12+、pnpm 11（或 npm）。

```sh
cp .env.example .env.local
pnpm install
pnpm dev
```

填写 `.env.local` 中 Supabase 项目的 URL 和 publishable/anon key。没有配置时显示配置提示，不会用假联机代替真实后端。不要把 `service_role`、数据库密码放进任何 `VITE_` 变量或前端代码。

## 配置 Supabase

1. 创建 Supabase 项目。在 Authentication → Sign In / Providers 中启用 Anonymous Sign-Ins；玩家只输入昵称，匿名身份由 SDK 创建并保存在当前浏览器。
2. 在 SQL Editor 执行 `supabase/migrations/202610310001_game.sql`，或使用 Supabase CLI `supabase db push` 应用迁移。迁移只执行一次。公开 API schema 保持 `public`，不要暴露 `game_private`。
3. 迁移会把 `public.game_rooms` 加入 `supabase_realtime` publication。只发布房间号与 revision；答案不进入任何 Realtime 消息。前端收到通知后重新请求授权快照，并每 5 秒补偿轮询、上报心跳。
4. 从 Project Settings → API 获取 URL 与 publishable/anon key，填入两个示例环境变量。
5. 公网使用前在 Authentication 配置匿名登录限流和 CAPTCHA；如启用 CAPTCHA，需给客户端 `signInAnonymously` 接入对应的 token 获取界面。当前版本不包含 CAPTCHA 界面，请勿启用后直接忽略 token。

官方参考：[匿名身份](https://supabase.com/docs/guides/auth/auth-anonymous)、[数据库函数](https://supabase.com/docs/guides/database/functions)。匿名身份在刷新后恢复；清除浏览器数据、退出匿名账号或换设备不能恢复原身份。

## 玩法与边界

- 2–10 人，昵称 1–16 字，6 位房间号或 `?room=123456` 邀请。只有房主可开始、进入下一轮和再来一局。昵称允许重复，身份按匿名 UID 区分。
- 第一轮自由联想；之后看上一轮全部词语继续联想。每次输入 1–20 个汉字，去除首尾 Unicode 空白后按完全相同判定，不合并同义词，不转简繁。内部空格、标点、拉丁字母不接受。
- 提交原子锁定，重试相同答案幂等，无法修改已提交答案；轮号和局号避免延迟请求落到新一轮。
- 严格等待所有在席玩家提交，没有超时跳过。最高相同词人数等于全员时胜利。挑战模式展示每轮 `最高同词人数 / 本轮人数 × 100%`（四舍五入到整数）及趋势；经典模式也保留词语历史。
- 心跳超过 45 秒标记离线，但仍占席、仍需提交。房主可明确移除离线席位；房主离线超过 45 秒，其他在线玩家可接管。房主主动退出时按加入顺序转交；离线的房主不终止游戏。
- 主动退出或被移除后，本轮未揭晓答案一并撤回，剩余在席玩家重新满足全员条件时揭晓。至少 2 人才能揭晓。只剩 1 人时保留当前阶段并允许通过邀请补入一人（已揭晓或胜利时也可补位，再由房主继续）；已揭晓历史保持当轮实际玩家快照。
- 已开始且人数不少于 2 时不允许新身份中途加入；本来就在席的身份可以恢复。全部退出后房间关闭；再来一局清空当前历史并增加局号。
- 本局历史保存在数据库；V1 不提供跨局历史查询。`game_private.games.created_at` 可用于运营留存清理；删除私有房间会级联删除 revision 行，清理前需自行决定保留期限。

## 安全与并发

`game_private.games` 保存完整状态；私有 schema 和表撤销 `anon`/`authenticated` 权限并启用 RLS。浏览器不能直接读取、修改答案。唯一写入入口 `game_command` 是固定空 search_path 的 SECURITY DEFINER 函数，校验 `auth.uid()`、成员资格、房主、阶段和输入，再锁定单个房间行执行事务。创建房间每个身份每小时上限 10 个，房间号碰撞重试。

RPC 显式构造响应：当前轮只返回自己的 `mine` 和其他人的 submitted 标志。只有原子全员揭晓时，答案才进入 history。成员 RLS 只允许读取自己房间的公开 revision。不要为方便调试给私有表增加前端 SELECT 策略，不要发布私有表的 Realtime。

6 位房间号是邀请凭据，知道房间号的人可以在允许加入的阶段加入；不适合存放敏感信息。该版本是朋友间游戏，不包含防机器人、房间密码或按 IP 限流网关。

## 测试与构建

```sh
pnpm test
pnpm build
pnpm preview
```

Vitest 单元测试验证空白和匹配比例；PGlite 在真实 Postgres 引擎中加载同一 SQL migration，以模拟 auth.uid 和数据库角色验证权限、隐藏答案、重复提交、轮次校验、退出、房主转移、离线接管和成功条件。PGlite 不替代线上 Supabase Auth、网络、Realtime 和真实多连接并发验证。

部署前用两个独立浏览器会话（普通窗口 + 隐身窗口）确认：创建/邀请/开始；先提交者的词在其他会话网络响应中不可见；最后一人提交后同步揭晓；刷新已提交者仍锁定；断网至少 45 秒不自动揭晓；接管/移除明确生效；两人退出一人后不胜利；同词成功及再来一局；挑战趋势；10 人容量和手机 Safari/微信/QQ 内置浏览器。真实项目验证结果见 `VERIFICATION.md`。

## Vercel 部署

1. 将源码提交至 GitHub 后在 Vercel Import Git Repository，选择该仓库；Framework 选择 Vite，Root Directory 为项目根目录。
2. Build Command `pnpm build`，Output Directory `dist`。仓库包含 `pnpm-lock.yaml` 时会自动使用 pnpm；也可安装后用 npm 构建。
3. 在 Production 和 Preview 环境设置 `.env.example` 的两个变量，随后部署；更新变量后重新部署。
4. 确保 Supabase 项目匿名登录已启用、SQL 已应用，按上述双会话清单验收后分享公开链接。

本地源码不等于线上部署。没有 Supabase/Vercel 项目凭证时无法代为创建项目、执行远程 SQL 或确认公网联机。

## GitHub 提交与权限恢复

目标 `ErichDzz/-` 的 API 元数据显示为空仓库（size=0），账号拥有 push/admin，但实际集成创建 README 与分支均返回 403 `Resource not accessible by integration`。这说明账号权限不能代表集成令牌有写入能力；本交付未上传、未创建远程分支、未提交 PR。

最小操作：在 GitHub 的 Installed GitHub Apps / 对应 ChatGPT/Codex GitHub 连接中，让集成获得此仓库的 **Contents: Read and write** 和 **Pull requests: Read and write** 权限（若应用本身不提供这些权限，需更换有写权限的连接或使用本机 GitHub Desktop）。重新连接后可继续让 Codex 初始化并提交 PR，无需重新授权开发。提交附带 GitHub Actions 工作流时还可能需要 Workflows 写权限；也可先不上传该工作流。

也可在已登录 GitHub Desktop 的机器上手动完成：先在 main 创建仅含项目标题的 README 初始提交；从 main 创建 `feat/game-v1`；将本目录源文件复制进去（不复制 node_modules、dist 或 .env.local），提交并推送，创建指向 main 的 PR。main 只放初始化提交，完整实现进入开发分支。
