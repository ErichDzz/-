# 部署记录

- 公开地址：https://same-word-meet-erichdzz.famedonyx.chatgpt.site
- 前端：Sites，访问权限 public，版本 1。
- Sites project_id：appgprj_6ae6047a87648191928b2dd44c95fc55
- 发布版本：appgprj_6ae6047a87648191928b2dd44c95fc55~appgver_3e56d5de5b488191a5384d2b78b4a9bf
- 部署 ID：appgdep_6ae604f769d8819197d030c3cfbbe6cd
- 静态发布源码提交：ee28a37e89af153168778c085ff30c5964ce0d46
- React 功能源码：GitHub ErichDzz/-，分支 feat/game-v1；本次构建基于 0e1b617。
- 后端：Supabase，project ref mqmoowbbdejahvktbdvr，ap-northeast-1（Tokyo）。
- 已执行迁移：supabase/migrations/202610310001_game.sql；匿名登录已启用。

## 更新网站

在 React 源码目录配置两个 VITE 环境变量，执行构建。Sites 当前发布的是 dist 静态文件；GitHub 分支更新不会自动发布。后续发布应复用上述 project_id，将同一构建的 dist 同步到该 Site 的源码工作目录，保留 .openai/hosting.json，再通过 Sites 的源码同步、保存版本、部署流程发布。不要另建重复 Site。

公开配置只使用 Supabase publishable/anon key。service_role 或 secret key 不得进入浏览器构建产物。

## 验证

线上 Supabase 双匿名身份测试通过：创建/加入/开始、隐藏答案、锁定、全员统一揭晓、同词胜利、退出。Realtime 验证通过，成员频道只收到 code 和 revision。Sites 返回部署状态 succeeded，公开访问权限为 public。已在普通 Chrome 和无痕 Chrome 完成真实双人浏览器验证：公开邀请加入、全员等待、锁定后刷新恢复、统一揭晓和 100% 同词胜利。

Vercel 未创建可用线上版本；其原邮箱验证问题不会影响当前 Sites 与 Supabase 服务。
