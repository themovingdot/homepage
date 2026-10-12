# AGENTS.md — homepage

- 项目：homepage — The Moving Dot Ltd 主站 themovingdot.com
- 定位：交通软件 + 咨询的商业主页（Advise / Build / Run），面向全球客户；哲学、实验室作为次级页面
- 负责人：hongwei@themovingdot.com
- 创建：2026-10-12
- 技术栈：纯静态 HTML/CSS/JS，无构建步骤；首页地球用 three.js（已内置在 assets/）；workers/ 下是聊天助手用的 Cloudflare Worker
- 部署：Cloudflare Pages，合并到 main 后约一分钟自动上线

## 规则
- 默认中文沟通，代码/命令/变量名用英文；汇报用白话，不讲实现细节。
- 改动前先读 MEMORY.md；学到新东西主动回写 MEMORY.md（凭据只记位置不记值）。
- 交付前必须本地跑起来验证：`python3 -m http.server 8000`，电脑 + 手机尺寸、深浅两种模式截图检查。
- 公开页面不放任何需要密码的内容。
- 不公开客户名称和项目名称；案例一律匿名，只写国家/地区、工作内容和交付物。
- 页面上的业绩数字必须能核实，不编造。
- 页脚法律声明按 tmd-legal-notice 标准。
- 新增内部文件（不该被公开访问的）要加进 `_redirects` 挡住。
- 在指定的 `claude/*` 分支上开发，推送后开 draft PR。
