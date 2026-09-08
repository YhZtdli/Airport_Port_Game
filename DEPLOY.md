# 发布到 GitHub，让别人打开网址就能玩

本项目提供 GitHub Pages 版本。GitHub 负责分发网页文件，每位玩家的浏览器负责路线、燃油、事故、经济和地图计算。作者电脑可以关机，不需要让玩家连接作者的 localhost，也不需要持续运行 Node 服务。

每个人的存档保存在自己的浏览器 IndexedDB 中，互相独立。更换设备用“经营 → 导出存档 / 导入存档”。清除网站数据或使用临时浏览器可能移除存档，游戏会在无法持久保存时提示。

## 发布前已经准备好的内容

- public/：游戏源文件；本机启动模式保持可用。
- scripts/build-static.mjs：构建 dist/，转换为纯静态运行模式和相对路径，适配 GitHub 仓库子目录。
- 地图、设施和城市目录提供 gzip 压缩，常规总下载量约 8.1 MB；不支持浏览器解压的旧浏览器可下载原始 JSON。
- dist/ 不包含 data/save.json、私人事件、后台程序或工作记录。
- .github/workflows/pages.yml：推送 main 分支、手动运行、每 12 小时计划刷新世界数据并发布。
- scripts/refresh-world.mjs：只获取公共全球采样，不读取玩家存档；某个数据源失败时保留它上次的成功快照。

## 1. 把项目放入自己的 GitHub 仓库

在 GitHub 新建一个公开仓库，名称自己选择。为方便首次推送，新仓库不要预先勾选 README、.gitignore 或许可证。

本机 Git 已安装。打开 PowerShell，进入项目：

    cd D:\AnacondaSavedFiles\Other_code\Aero_Plane

如果这是全新下载、还没有本地 Git 仓库，先运行：

    git init -b main
    git add .

项目的 .gitignore 已排除个人进度、环境缓存、dist、work 和本机环境变量文件。首次提交前可用 git status 检查。

提交并上传：

    git commit -m "Publish ORBIS browser game"
    git remote add origin https://github.com/你的用户名/你的仓库名.git
    git push -u origin main

将示例地址替换成自己的真实仓库地址。如果 Git 提示缺少提交者身份，先按自己的信息配置 user.name 和 user.email；登录 GitHub 时使用 Git 弹出的登录流程，不要把密码或访问令牌写进游戏文件。

如果 origin 已存在，用 git remote -v 查看，不要直接覆盖其他仓库地址。远程仓库已有内容时应先合并，避免强制推送。

也可以用 GitHub Desktop 将这个本地仓库发布到 GitHub。请通过 Git 或 GitHub Desktop 上传完整项目：设施源文件约 32 MB，超过 GitHub 网页拖拽上传单文件的 25 MiB 上限。Git 命令上传的单文件限制为 100 MiB。

## 2. 开启 GitHub Pages

进入仓库：

**Settings → Pages → Build and deployment → Source → GitHub Actions**

再进入 **Actions → Publish ORBIS to GitHub Pages → Run workflow**。

如果首次推送时 Pages 尚未启用，第一次部署可能失败；完成上述设置后重新运行即可。如果 GitHub 环境要求批准部署，按仓库界面提示批准。

等待 build 与 deploy 成功，GitHub 会显示网站链接。一般形式是：

    https://你的用户名.github.io/你的仓库名/

将 GitHub 实际显示的链接发给其他人即可。玩家无需 GitHub 账号、Python、Anaconda、Node.js 或安装程序，只需要可正常访问网站的浏览器。

## 3. 后续更新

代码修改后提交并推送 main，工作流会重新发布网页。玩家刷新页面获得新版本；浏览器存档继续保留。修改域名或仓库路径可能改变浏览器存储空间，迁移前可导出进度。

公共天气、洋流和风险公告计划在 UTC 00:37 / 12:37 更新，即北京时间 08:37 / 20:37，由 GitHub 云端执行。玩家点击“更新”会读取站点最新快照，不会调用作者电脑。

GitHub 定时任务可能排队或延迟；公开仓库连续 60 天没有活动时，定时任务可能被自动停用，需要在 Actions 中重新启用。游戏显示各来源实际成功时间，缓存和预报外推会明确标注。因此此机制不是严格准点的 12 小时服务承诺。

网页版使用公共全球采样，不会上传玩家自行绘制的航线，也不会让 GitHub 按玩家航线逐一加密采样。飞机和船舶仍按各自路线在浏览器中采样、计算风险与连锁后果。

## 本机检查发布版本

    node scripts/build-static.mjs
    node scripts/verify-static.mjs
    node scripts/preview-static.mjs

打开 http://127.0.0.1:8790/orbis/ 。这是验证仓库子路径的本机预览地址，不能作为分享给他人的正式网址。

测试：

    node --test tests/*.test.mjs
    node tests/browser-static.mjs

浏览器测试依赖 Playwright 和 Edge，要求连接上述纯静态预览服务器。它验证独立玩家、多窗口存档冲突、导入导出、重置、断网快照回退、手机版，以及全程没有请求 /api/ 或提交玩家数据。

## 服务范围与来源

GitHub Free 的公开仓库可使用 GitHub Pages。本版适合免费分享和个人项目；GitHub Pages 有文件、带宽和使用范围限制，玩家量扩大后可评估其他静态托管，浏览器计算方式无需改变。

世界数据沿用 OurAirports、GeoNames、Natural Earth、Searoute、Open-Meteo 和 EASA 的来源说明与署名。Open-Meteo 免费接口供非商业使用；数据按 CC BY 4.0 署名。来源细节见游戏情报面板和 README。

官方说明：

- GitHub Pages：https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- 自定义发布工作流：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- 定时任务限制：https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- GitHub Pages 限额：https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- 大文件上传：https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- Open-Meteo 接口使用条件：https://open-meteo.com/en/pricing
