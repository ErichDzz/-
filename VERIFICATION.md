# 验证记录

时间：2026-10-31（Asia/Shanghai）。

- TypeScript 严格类型检查：通过。
- Vite 生产构建：通过，73 modules，主 JS 456.40 kB / gzip 131.95 kB；未设置远程项目环境变量，产物不包含测试接口或任何 service_role 密钥。
- Vitest：2 个测试文件，10 项通过。包括真实 PGlite/Postgres 执行迁移、RLS/数据库权限、未揭晓答案不泄露、锁定和幂等提交、旧局/轮次拒绝、统计比例、全员同词胜利、再来一局、离线接管与明确移除、退出防单人胜利、揭晓后补位、人数上限。
- 浏览器：实际检查 376 px 手机页面及桌面布局；两个不同 origin 的独立匿名身份，连接隔离的本地 PGlite HTTP 测试适配器，跑通创建 → 邀请加入 → 开始 → 隐藏提交 → 刷新保留锁定 → 第一轮不同词揭晓（50%）→ 第二轮同词胜利（100%）→ 再来一局（局号增加、历史清空）。测试适配器放在工作目录，不属于生产源码，测试配置已删除。
- GitHub：仓库 API 可读取，size=0，账号报告 push/admin 权限。实际 create_file（初始化 README）和 create_branch（feat/game-v1）均返回 403 `Resource not accessible by integration`；可访问的 GitHub App installations 列表为空。无法验证集成写权限、初始化远端或创建 PR。本地存在 feat/game-v1 分支，未推送。

## 尚未实际验证

没有用户 Supabase/Vercel 项目配置，因此没有执行远程迁移、没有上线、没有远程 Realtime WebSocket 验证。PGlite 的事务顺序测试不能替代多连接并发压力测试；真正的 JWT 签发、浏览器断网重连、跨手机联机和微信/QQ 内置浏览器兼容性，需要部署后验收。README 提供了操作清单。

安装期间遇到本机 sandbox 与已下载 pnpm 缓存路径不一致，直接用已安装的本地 Vitest、TypeScript、Vite 入口运行以上最终检查；`pnpm --config.verify-deps-before-run=false test` 也已运行通过。标准环境按 README 执行 pnpm install/test/build 即可。
