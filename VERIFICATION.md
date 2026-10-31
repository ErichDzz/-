# 验证记录

时间：2026-10-31（Asia/Shanghai）。

## 已通过

- TypeScript 严格类型检查与 Vite 生产构建。
- Vitest：2 个测试文件，10 项通过。实际在 PGlite/Postgres 执行同一 SQL migration，验证权限、答案隐藏、锁定、重复提交、旧轮次、统计、胜利、再来一局、退出防单人胜利、房主转移和离线接管、人数上限、揭晓后补位。
- 本地双身份浏览器：创建、邀请、开始、刷新恢复、不同词 50% 揭晓、下一轮同词 100% 胜利和再来一局。
- 生产 Supabase：已执行迁移、启用匿名登录。两个独立匿名身份真实验证创建/加入/开始、未揭晓答案不出现在其他玩家响应、全员原子揭晓、同词胜利、主动退出。
- 生产 Realtime：成员频道正常订阅并收到更新；载荷仅包含 code 和 revision。客户端启动身份后显式初始化频道 token。
- Sites：版本 1 发布状态 succeeded，访问权限 public，地址 https://same-word-meet-erichdzz.famedonyx.chatgpt.site。
- 公开网站实际浏览器：普通 Chrome 窗口创建房间，无痕 Chrome 在无 ChatGPT 登录态下直接打开邀请链接、输入昵称并加入；房主开始和提交后刷新恢复身份及锁定答案；无痕玩家只见提交标记，提交相同词后双方进入成功页并显示 100% 默契。测试房间 836627。
- GitHub：源码与实时身份修正已通过 GitHub Desktop 推送到 feat/game-v1，未直接覆盖 main。

## 限制和未完成项

- Vercel 的原邮箱重新验证无法完成，未发布 Vercel 版本。用户已明确选择使用 Sites 公开上线，Supabase 后端保留。
- GitHub 集成创建 PR 仍返回 403，浏览器 GitHub 登录尚未完成，因此 PR 尚未创建。开发分支已可访问。
- 本机命令行的无 Cookie HTTP 抓取受到 Cloudflare 403 限制；公开访问能力已通过真正无痕浏览器验证。内置浏览器自动控制连接超时，公开页面改由 Chrome 验证。
- 未进行真实多手机、微信/QQ 内置浏览器、广域网断网恢复及压力测试。PGlite 的顺序事务测试不能替代真正多连接并发压力测试。
