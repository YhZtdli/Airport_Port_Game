# 中英文检索与搜索引擎收录

网站：https://yhztdli.github.io/Airport_Port_Game/

## 当前检索主题

- 中文：全球航班模拟、海运模拟、航线规划、机场港口、运输经营、物流模拟。
- English: Flight & Shipping Simulator, Route Planning, Airline Management Game, Shipping Simulation, Logistics Simulation.
- 品牌检索：ORBIS。

关键词通过首页标题、摘要和可阅读的游戏介绍自然表达，不保证输入某个词一定出现本网站。Google 不使用 meta keywords 标签进行索引和排名。

## 已准备的文件

- public/index.html：中英文标题、搜索摘要、独立 canonical 地址、分享信息和游戏介绍入口。
- public/about.html：面向玩家的中文介绍与 English overview，正文可直接读取。
- public/about.css：介绍页样式。
- public/sitemap.xml：游戏首页与介绍页的站点地图。

现有构建脚本会把这些文件从 public 复制到 dist，再由 GitHub Actions 发布。

## 上传更新

在 PowerShell 中执行：

~~~powershell
Set-Location -LiteralPath "D:\AnacondaSavedFiles\Other_code\Aero_Plane"
git add public/index.html public/about.html public/about.css public/sitemap.xml SEO.md
git commit -m "Add Chinese and English search metadata"
git push
~~~

等待 GitHub Actions 的部署成功后，线上才会出现新标题和介绍页。浏览器刷新仅更新浏览器中的页面，不会触发搜索引擎收录。

## Google Search Console

1. 打开 https://search.google.com/search-console ，用自己的账号登录。
2. 添加“网址前缀”资源，填写上方包含仓库路径和末尾斜杠的完整网址。另一个游戏应分别添加自己的网址前缀。
3. 选择“HTML 标记”验证，复制平台发给你的完整 google-site-verification 元标记，加入 public/index.html 的 head 内。它是账号专属值，此项目没有预填验证值。
4. 提交并推送这项修改，等待 Pages 部署完成，再回 Search Console 点击“验证”。验证通过后保留标记。
5. 在“站点地图”中提交 https://yhztdli.github.io/Airport_Port_Game/sitemap.xml。
6. 用“网址检查”检查 https://yhztdli.github.io/Airport_Port_Game/ 并请求编入索引。介绍页也可以单独请求。

使用网址前缀和 HTML 标记即可验证这两个项目目录，无需修改 github.io 的 DNS。

## Bing 与百度

可以在 Bing Webmaster Tools（https://www.bing.com/webmasters/）和百度搜索资源平台（https://zy.baidu.com/）按各自页面提示添加站点、完成验证与提交链接。验证值需要由你的账号生成；平台是否接受项目子目录、可用提交额度及处理时间以实际后台为准。

Google 的提交不等于 Bing 或百度已收录。搜索引擎各自决定抓取、索引、结果标题与排名，刚部署后通常不会立即可搜到。

## GitHub 仓库内部检索

在仓库 Code 页右侧 About 的设置中补充描述和 Topics。可使用的英文 Topics：flight-simulator, shipping-simulation, route-planning, logistics-simulation, browser-game。这帮助说明 GitHub 仓库主题，不等同于搜索引擎排名设置。

## 后续维护

- 调整关键词时修改 index.html 的标题、description、Open Graph 信息，以及 about.html 中相关的可见正文，避免机械堆词。
- 网页目前主要界面为中文；English overview 是英文介绍，游戏尚未提供完整英文界面。
- 换域名或仓库名时，同步更新两页的 canonical、og:url 以及 sitemap.xml。
- 此项目位于站点子目录，目录内的 robots.txt 不能代替域名根目录的 robots.txt；目前无需新建子目录 robots.txt。

参考：[Google 支持的元标记](https://developers.google.com/search/docs/crawling-indexing/special-tags)、[网站所有权验证](https://support.google.com/webmasters/answer/9008080?hl=zh-Hans)、[请求重新抓取](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)。
