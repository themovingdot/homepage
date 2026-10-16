# MEMORY.md — homepage

## 架构决策
- 2026-10-12：首页改为商业主页。transport.themovingdot.com 的内容（原 themovingdot/transport 仓库）搬进本仓库作为 index.html，transport 子域名退役、整站跳回 themovingdot.com。原哲学首页移到 /philosophy（philosophy.html），取消「点哪里都跳走」。
- 2026-10-12：用户决定：不公开客户/项目名；市场面向全球（英国 + 海湾 + 其他）；transport 子域名跳回主域名。
- 2026-10-12：联系表单不需要后端：填完后打开访客自己的邮件程序，内容已预填，发往 info@themovingdot.com。
- 首页业绩数字「30+ web applications in production」按 Netlify 账户里约 30 个在线站点估算，待用户确认（沿用 transport 站）。

- 2026-10-16：用户要求推翻 10-12 版，重做全新首页：主打业务、创新和 AI；做成可交互的看板（交通计数、交通建模、工具、服务四个模块）；首页要有能「控制/引导访客」的 AI 助手。10-12 版的 PR（#34）未合并，新版直接在同一分支上替换。
- 用户口述的「transformer modelling」按「transport modelling（交通建模）」理解（语音转写误差），已在汇报里说明。
- 助手架构：沿用已部署的 Worker（不需要重新部署）。Worker 只放行固定几种动作，所以看板控制都编码成 show_card 的 id：module-* / scenario-* / close-<路段> / open-<路段> / demand-<60..160> / counting-*。快捷按钮和 Worker 不可用时由页面内置的本地应答兜底。
- 2026-10-16：Worker 用的模型（llama-4-scout）不给示例就不输出动作，系统提示里必须保留 Examples 段；它还会编造建模数字，所以由页面在动作后自动贴出真实计算结果。
- 建模演示：7 个节点、10 条路（+1 条 2035 新桥），BPR 路阻 + 逐次平均法（MSA）均衡分配，浏览器内实时计算；场景：今天 / 活动高峰 +30% / 中央桥封闭 / 2035 增长 + 新桥。
- 车辆分类配色经 dataviz 校验脚本验证（深浅两套），道路负荷用状态色并配文字标签。

## 待用户提供
- 创始人介绍（姓名、照片、一句话背景、资历）——About 区目前只写公司层面。
- 是否加 WhatsApp 联系方式（号码）。
- 调查平台要不要起正式产品名。

## 踩坑
- www.themovingdot.com 返回 525（Cloudflare 与源站之间 SSL 握手失败），需在 Cloudflare 后台处理：最简单是加一条 Redirect Rule 把 www 跳到主域名。
- transport 站没有接 GitHub 自动部署（见 transport 仓库 MEMORY.md），所以子域名跳转要在 Cloudflare 后台用 Redirect Rule 做，改 transport 仓库没用。
- Cloudflare Pages 会把仓库根目录原样公开，AGENTS.md / MEMORY.md 用 `_redirects` 挡住。
- 本地截图时 Google Fonts 会因代理证书报错，是环境问题。
- 本地用 Playwright 测助手时，浏览器连不上外网：用 page.route 把 /chat 请求转给 curl 发出去。

## 外部资源位置
- 客户项目站点都在 Netlify（zhwlxl 团队），源码不在本仓库。
- 聊天助手后端：workers/cloudflare-llm-worker（地址写在 chat.js 和 assets/assistant.js 的 API_URL）。
