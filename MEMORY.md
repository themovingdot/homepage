# MEMORY.md — homepage

## 架构决策
- 2026-10-12：首页改为商业主页。transport.themovingdot.com 的内容（原 themovingdot/transport 仓库）搬进本仓库作为 index.html，transport 子域名退役、整站跳回 themovingdot.com。原哲学首页移到 /philosophy（philosophy.html），取消「点哪里都跳走」。
- 2026-10-12：用户决定：不公开客户/项目名；市场面向全球（英国 + 海湾 + 其他）；transport 子域名跳回主域名。
- 2026-10-12：联系表单不需要后端：填完后打开访客自己的邮件程序，内容已预填，发往 info@themovingdot.com。
- 首页业绩数字「30+ web applications in production」按 Netlify 账户里约 30 个在线站点估算，待用户确认（沿用 transport 站）。

- 2026-10-16：用户要求推翻 10-12 版，重做全新首页：主打业务、创新和 AI；做成可交互的看板（交通计数、交通建模、工具、服务四个模块）；首页要有能「控制/引导访客」的 AI 助手。10-12 版的 PR（#34）未合并，新版直接在同一分支上替换。
- 用户口述的「transformer modelling」按「transport modelling（交通建模）」理解（语音转写误差），已在汇报里说明。
- 助手架构：沿用已部署的 Worker（不需要重新部署）。Worker 只放行固定几种动作，所以看板控制都编码成 show_card 的 id：module-* / scenario-* / close-<路段> / open-<路段> / demand-<60..160> / counting-*。快捷按钮和 Worker 不可用时由页面内置的本地应答兜底。
- 2026-10-16：Worker 用的模型（llama-4-scout）不给示例就不输出动作，系统提示里必须保留 Examples 段；它还会编造数字（看板版时编过建模结果），所以提示词禁止它报价格、工期、统计数字。
- 看板版（已撤下，代码在 commit 7b39fe6 里可找回）：计数动画 + 7 节点路网实时均衡分配（BPR + MSA）。

- 2026-10-16（同日第二轮）：用户反馈「不要太多文字、图形、图片、地图、GIS，要极简」，并要求聊天机器人用他已有的模板（悬浮、自动最小化、主动提示、接 API）。看板版（计数动画、路网模型）整体撤下，换成纯文字极简页：标题 + 一句话 + 四个可展开条目 + 邮箱。
- 聊天模板位置：Google Drive 里的 AIChatbot.tsx（多份副本，最新一份文件 ID 1wZxfnJ5oLjvpMEhKDGYpYYSTqIxxkWrC）。原版是 React + Tailwind，给调查表单用（带进度条、表单自动填写）。移植成 assets/chatbot.js（纯 JS），保留：悬浮按钮 + 闪光角标、渐变标题栏、最小化/展开/关闭、欢迎语、空闲主动提示、时间戳、加载转圈、「Try:」示例、操作时弹出小提示。新增：点页面或滚动时自动最小化；手机上执行动作后自动最小化让出页面。
- 主动提示时间：模板是空闲 3 分钟；首页访问时间短，改成空闲 40 秒，每个浏览会话只弹一次，打开过就不再弹。
- 模型（llama-4-scout）对语言规则不敏感：必须在提示词前面单列 LANGUAGE 规则并给一个西班牙语示例，才会用访客的语言回答。

- 2026-10-16（第三轮）：询盘改成「一个邮箱框 + 可选一句需求 + Send」，直接存进数据库，不再打开访客的邮件程序（只在保存失败时兜底）。聊天里：要报价/联系时弹出同样的小表单；访客直接在聊天里打出邮箱，自动记成一条询盘。
- 存储位置（10-16 改为中央表）：Supabase 项目 project_database（ref tbfmcxsbiybtyytbgyic，eu-west-1）的 public.feedback，所有网站共用：site（哪个网站）、kind（enquiry / chat / feedback / bug）、email、message、reply、meta、status（new/replied/closed）、notified_at（已发提醒邮件的时间）。网页公钥只能新增，不能读改删（已用 anon 角色实测 8 项）。选 Supabase 而不是 Google 表格：免费、已可用、各网站同样一行代码就能写入；Google 表格要手动部署 Apps Script 才能接收网页写入。
- 当天先建的 website_chat_log / website_enquiries 两张表已被 feedback 取代，都是空表；删除操作通过连接器一直超时（删表可能需要确认），留着无害，可在后台手动删。
- 网页要填 Supabase 的 publishable key 才会真正保存：assets/chatbot.js 顶部 CONFIG.supabaseKey（目前为空，聊天照常工作但不保存，页面表单退回邮件程序）。会话里读取 key 被权限拦下，需用户自己粘贴。
- 用户以为有一个 Supabase 反馈库：两个项目（GCC_HHS_v0、project_database）里都没有 feedback 表或数据，只有调查表。之前唯一的「问题记录」是 ADTGM 聊天机器人写进 Google 表格「ATTGM Chatbot Test Questions」（Apps Script）。
- ADTGM demo：用户最终只要求「从本网站去掉链接」，站点本身保留。查过仓库、main 分支和线上各页面，已经没有任何 ADTGM 链接（PR #33 已删）。
- 风险：两个 Supabase 项目的 riyadh_metro_survey 表都对所有人开放了读、写、改、删（public 策略）。用户 10-16 决定不改。

## 待用户提供
- Supabase publishable key（粘贴到 assets/chatbot.js 的 CONFIG.supabaseKey）。
- 新询盘邮件提醒：用户选 Google Apps Script（10-16）。代码 workers/enquiry-alert/Code.gs（部署步骤见同目录 README）。表格「Website enquiries — The Moving Dot」已建在用户 Drive（文件 ID 1tR02DEG2mDT9rnH14Qn1Qv9JnoAoH4dvt1oS20MiRog）。待用户：在表格里粘贴脚本、部署成 Web app、把 /exec 网址发来，填进 assets/chatbot.js 的 CONFIG.alertUrl。
- 用户 10-16 发来的 publishable key 被 Supabase 拒绝（Invalid API key，两个项目都不认），疑似复制时少了最后一个字符；CONFIG.supabaseKey 仍为空，待用户重发。
- 创始人介绍（姓名、照片、一句话背景、资历）——About 区目前只写公司层面。
- 是否加 WhatsApp 联系方式（号码）。
- 调查平台要不要起正式产品名。

## 踩坑
- www.themovingdot.com 返回 525（Cloudflare 与源站之间 SSL 握手失败），需在 Cloudflare 后台处理：最简单是加一条 Redirect Rule 把 www 跳到主域名。
- transport 站没有接 GitHub 自动部署（见 transport 仓库 MEMORY.md），所以子域名跳转要在 Cloudflare 后台用 Redirect Rule 做，改 transport 仓库没用。
- Cloudflare Pages 会把仓库根目录原样公开，AGENTS.md / MEMORY.md 用 `_redirects` 挡住。
- 本地截图时 Google Fonts 会因代理证书报错，是环境问题。
- 本地用 Playwright 测助手时，浏览器连不上外网：用 page.route 把 /chat 请求转给 curl 发出去。

- 用户提到「交通计数 explorer 的反馈存在 Supabase」：Vehicle Counter 仓库（themovingdot/vehicle-detection）里没有反馈功能，两个 Supabase 项目里也没有反馈数据，没找到。

## 外部资源位置
- 客户项目站点都在 Netlify（zhwlxl 团队），源码不在本仓库。
- 聊天助手后端：workers/cloudflare-llm-worker（地址写在 chat.js 和 assets/chatbot.js 的 apiUrl）。
- 风险（不在本仓库）：adtgmdemo.themovingdot.com 的 gemini_config.js 把 Gemini API 密钥明文放在网页里。已要求下线，见上。
