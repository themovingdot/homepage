# MEMORY.md — homepage

## 架构决策
- 2026-10-12：首页改为商业主页。transport.themovingdot.com 的内容（原 themovingdot/transport 仓库）搬进本仓库作为 index.html，transport 子域名退役、整站跳回 themovingdot.com。原哲学首页移到 /philosophy（philosophy.html），取消「点哪里都跳走」。
- 2026-10-12：用户决定：不公开客户/项目名；市场面向全球（英国 + 海湾 + 其他）；transport 子域名跳回主域名。
- 2026-10-12：新首页不挂聊天助手（风格偏诗意，不适合商业首页）；lab / flow / philosophy 等页面保留。
- 2026-10-12：联系表单不需要后端：填完后打开访客自己的邮件程序，内容已预填，发往 info@themovingdot.com。
- 首页业绩数字「30+ web applications in production」按 Netlify 账户里约 30 个在线站点估算，待用户确认（沿用 transport 站）。

## 待用户提供
- 创始人介绍（姓名、照片、一句话背景、资历）——About 区目前只写公司层面。
- 是否加 WhatsApp 联系方式（号码）。
- 调查平台要不要起正式产品名。

## 踩坑
- www.themovingdot.com 返回 525（Cloudflare 与源站之间 SSL 握手失败），需在 Cloudflare 后台处理：最简单是加一条 Redirect Rule 把 www 跳到主域名。
- transport 站没有接 GitHub 自动部署（见 transport 仓库 MEMORY.md），所以子域名跳转要在 Cloudflare 后台用 Redirect Rule 做，改 transport 仓库没用。
- Cloudflare Pages 会把仓库根目录原样公开，AGENTS.md / MEMORY.md 用 `_redirects` 挡住。
- 本地截图时 Google Fonts 会因代理证书报错，是环境问题。

## 外部资源位置
- 客户项目站点都在 Netlify（zhwlxl 团队），源码不在本仓库。
- 聊天助手后端：workers/cloudflare-llm-worker（地址写在 chat.js 的 API_URL）。
