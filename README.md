# 跨境电商工作台（复刻版）

参照同事分享的「跨境电商工作台」站点 1:1 复刻的**纯静态个人版**，无需后端、无需数据库，
所有数据保存在你自己的浏览器（localStorage），可随时导出备份、导入恢复。

## 功能模块
- **工作台首页**：问候语 + 当天日期 + 待办概览 + 今日新闻
- **事项安排**：任务增删改、进度条、子事务、语音快速添加（演示 UI）
- **飞书表格**：飞书文档链接的增删 / 搜索 / 标签管理
- **新闻聚合**：按英 / 德 / 法 / 西 / 意分组的欧洲市场资讯（含高/中/低影响标签）
- **产品分析 / 工具网站**：销售数据、调研模板、常用工具一键直达
- **通知 / 设置 / 用户**：个性化与数据管理
- **导入 / 导出**：顶栏 ⬇️ 导出、⬆️ 导入，一键备份你的数据

## 本地预览
直接用浏览器打开 `index.html` 即可；或在项目目录运行任意静态服务器，例如：
```bash
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

## 部署到 GitHub Pages（一步步来）
1. 在 GitHub 新建一个**公开**仓库，例如 `cross-border-workbench`。
2. 把本目录所有文件（`index.html`、`styles.css`、`app.js`、`.nojekyll`、`.github/`）上传进去，
   默认分支命名为 `main`。
3. 进入仓库 **Settings → Pages → Build and deployment**：
   - Source 选择 **GitHub Actions**。
4. 推送一次 `main` 分支即可自动部署（本仓库已内置 `deploy.yml` 工作流）。
5. 几分钟后访问 `https://<你的用户名>.github.io/cross-border-workbench/` 即可。

> 想改仓库名？把仓库名保持为 `cross-border-workbench`，或部署后自行设置自定义域名。

## 自定义
- **改名字 / 同步仓库**：打开站点 → 设置 → 填写「显示名称」等并保存。
- **改示例内容**：编辑 `app.js` 顶部的 `seedNews / seedProduct / seedTools` 函数。
- **改配色**：编辑 `styles.css` 里的 `:root` CSS 变量（如 `--primary`、`--blue`）。

## 云端同步（GitHub）
开启后数据会存到你自己的 GitHub 仓库，多设备实时共享（原理：用 GitHub API 直接读写仓库里的一个 JSON 文件，即「git-as-backend」）：
1. 生成一个具有 `repo` 权限的 **PAT**（建议用细粒度令牌，仅授权下面的数据仓库）。
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) 或 Fine-grained。
2. 在站点「设置」中：勾选「启用云端同步」→ 填写 `仓库(owner/repo)`、`分支`、`数据文件路径`、`PAT` → 保存。
3. 保存后会自动从云端拉取一次；之后任何改动都会在 1 秒后自动推回云端。
4. 也可点「立即同步（上传到云端）」手动推送。

> 建议用一个**单独的数据仓库**（如 `cbec-data`，设私有）作为同步目标，而不是部署网站的仓库，
> 这样每次同步不会触发 GitHub Pages 重新构建。
> PAT 只保存在你本机浏览器，绝不会上传；请勿分享给不可信的人。

> 说明：原站使用 Gitee 云端同步（需 Token）。本静态版改为浏览器本地存储 + 导入/导出，并额外提供 GitHub 云端同步选项，
> 更适合 GitHub Pages 这类无后端环境，也更保护你的隐私。
