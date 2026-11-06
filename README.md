# 小川的个人主页

一个暖调极简风格的个人网站：单屏居中的首页名片、关于我、留言板，外加一个完整的站点管理后台。支持浅色 / 深色主题切换。

- 前端：原生 HTML / CSS / JavaScript，无框架，加载快
- 后端：Node.js + Express，留言和站点配置存 JSON 文件，不需要数据库
- 后台：留言审核、头像 / 昵称 / 签名 / 社交链接 / 关于页 / 备案号，以及新留言邮件提醒
- 部署：可直接跑在阿里云服务器的宝塔面板上，也方便备份到 GitHub / Gitee

![首页预览](docs/preview/home.png)

## 目录结构

```
.
├─ views/                  页面模板（由服务端注入站点设置）
│  ├─ index.html           首页（名片 + 社交链接）
│  ├─ about.html           关于我
│  ├─ guestbook.html       留言板
│  ├─ admin.html           管理后台（/admin）
│  └─ 404.html             404 页面
├─ public/
│  └─ assets/
│     ├─ css/style.css     全站样式
│     ├─ js/site.js        导航、主题切换、入场动画
│     ├─ js/guestbook.js   留言板逻辑
│     ├─ js/admin.js       后台逻辑
│     └─ img/              头像、favicon、占位图
├─ server/
│  ├─ site.js              站点设置存储
│  ├─ render.js            页面模板渲染
│  ├─ icons.js             社交图标库
│  ├─ mailer.js            邮件通知
│  ├─ store.js             留言存储
│  ├─ auth.js              后台登录会话
│  └─ util.js              校验、限流等工具
├─ server.js               服务入口
├─ data/                   留言和站点配置（首次运行自动创建，不提交到 git）
├─ tests/smoke.mjs         接口冒烟测试
└─ docs/preview/           页面预览截图
```

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install

# 复制环境变量模板，并修改后台密码
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

npm start
```

- 网站：http://localhost:3000
- 管理后台：http://localhost:3000/admin（默认账号 `admin`，密码是 `.env` 里的 `ADMIN_PASSWORD`）

开发时可用 `npm run dev`（修改后端代码自动重启）。

运行测试（需要服务已启动）：

```bash
npm test
```

如果你已经改过后台密码，测试时也把密码带上：

```bash
ADMIN_PASSWORD=你的密码 npm test
```

## 后台功能

登录 `/admin` 后有四个标签：

- **留言审核**：处理访客留言
- **站点设置**：头像、昵称、签名、社交链接、关于页、备案号
- **邮件通知**：新留言邮件提醒
- **账号安全**：修改后台账号和密码

### 留言审核

- 访客提交的留言默认进入「待审核」
- 可以 通过 / 拒绝 / 退回待审核 / 回复 / 删除
- 只有「已通过」的留言会显示在留言板上
- 顶部「留言审核」旁边的数字是待审核数量

### 站点设置

- **头像**：选择图片后自动裁成正方形并压缩，同时更新网站头像和浏览器标签页图标
- **昵称、个性签名、备案号**：保存后前台页面立即更新
- **社交链接**：可增删、调整顺序、选择图标（GitHub、Gitee、微博、B 站、知乎、X、博客、抖音、邮箱等）
- **关于我页面**：小标题、标题、副标题、正文（正文空一行分段）

保存后刷新前台即可看到效果；后台页面本身的 ICP 备案号也会随之更新。

### 账号安全

- 默认账号是 `admin`，初始密码是 `.env` 里的 `ADMIN_PASSWORD`
- 后台 → 「账号安全」→ 可以同时修改账号和密码；修改任意一项都需要输入当前密码
- 账号需要 3 到 24 位，只能使用字母、数字、下划线、点或短横线
- 保存后会改用新账号和新密码登录，`.env` 里的旧密码不再生效
- 忘记账号或密码时：在服务器上删除 `data/admin.json`，重启服务后用默认账号 `admin` + `.env` 的 `ADMIN_PASSWORD` 登录，再重新设置

### 邮件通知

开启后，访客提交留言时会自动给你发一封提醒邮件，点邮件里的按钮就能直接去后台审核。

以 QQ 邮箱为例：

| 配置项 | 填写内容 |
| --- | --- |
| SMTP 服务器 | `smtp.qq.com` |
| 端口 | `465` |
| 使用 SSL / TLS | 勾选 |
| SMTP 账号 | 你的 QQ 邮箱 |
| SMTP 密码 / 授权码 | QQ 邮箱设置里生成的「授权码」（不是登录密码） |
| 接收提醒的邮箱 | 你常用的邮箱 |

163 邮箱用 `smtp.163.com`，同样端口 `465`、勾选 SSL，密码填授权码。填好后可以先点「发送测试邮件」确认配置正确，再勾选「开启邮件通知」并保存。

> SMTP 配置保存在服务器 `data/site.json`，已在 `.gitignore` 中排除，不会上传到 GitHub / Gitee。密码会以明文存在服务器文件里，请确保服务器安全、并定期备份。

## 留言板与审核流程

1. 访客填写昵称、留言，可选邮箱和网站，提交
2. 页面会显示醒目的「留言已提交，等待审核」提示，说明通过后才会公开
3. 如果开启了邮件通知，你的邮箱会收到提醒
4. 你打开 `/admin` → 「留言审核」→ 通过 / 拒绝 / 回复
5. 通过后留言才会出现在留言板上

一些内置的小设计：

- **头像**：访客填了邮箱会尝试加载 Cravatar；没有头像时自动退回昵称首字头像
- **点赞**：同一条留言每个 IP 每天只能点一次，前端也会用 localStorage 记忆
- **防刷**：隐藏蜜罐字段、提交限流（每 IP 10 分钟 5 条）、登录限流、内容长度校验
- **邮箱不公开**：公开接口只返回昵称、留言、回复、点赞数和头像哈希地址，不返回邮箱
- **XSS 防护**：前端全部用 `textContent` 渲染，留言不会被执行成 HTML

## 数据与备份

| 文件 | 内容 |
| --- | --- |
| `data/messages.json` | 全部留言 |
| `data/site.json` | 站点设置（昵称、签名、社交链接、关于页、备案号、邮件配置） |
| `data/admin.json` | 后台自定义账号和密码（在后台修改过之后才会生成） |
| `data/.session-secret` | 后台登录会话密钥（自动生成） |
| `public/assets/img/` | 头像、favicon 等上传的图片 |

备份时把整个 `data/` 目录和 `public/assets/img/` 一起备份即可。

## 上线前需要检查

| 位置 | 说明 |
| --- | --- |
| `.env` 的 `ADMIN_PASSWORD` | 默认账号 `admin` 的初始密码，务必改掉默认值 |
| 后台 → 站点设置 | 昵称、签名、社交链接、关于页、备案号都在这里改，不需要再改 HTML |
| 后台 → 邮件通知 | 填好 SMTP 后先发测试邮件，再开启通知 |
| `public/assets/css/style.css` 顶部 `:root` | 想换配色 / 字体 / 内容宽度时改这里 |

## 部署到阿里云宝塔

### 1. 安装运行环境

宝塔面板 → 软件商店 → 安装 **Node.js 版本管理器**（选 Node 18 或更高），然后在「网站」里确认有 Node 项目功能。

### 2. 上传代码

方式一（推荐，方便更新）：在服务器上用 git 拉取仓库。

```bash
cd /www/wwwroot
git clone https://github.com/mikey0253z-spec/你的仓库.git xiaochuan
cd xiaochuan
```

方式二：宝塔「文件」里把项目压缩包上传到 `/www/wwwroot/xiaochuan` 后解压。

### 3. 安装依赖并配置

```bash
npm install --omit=dev
cp .env.example .env
vi .env
```

把 `.env` 里的 `ADMIN_PASSWORD` 改成只有你知道的强密码。如果 npm 下载慢：

```bash
npm config set registry https://registry.npmmirror.com
```

### 4. 启动 Node 服务

**方式 A：宝塔 Node 项目**

宝塔 → 网站 → Node 项目 → 添加项目：

- 项目目录：`/www/wwwroot/xiaochuan`
- 启动文件：`server.js`
- 项目端口：`3000`
- 运行命令：`node server.js`

**方式 B：PM2（命令行）**

```bash
npm i -g pm2
pm2 start server.js --name xiaochuan
pm2 save
pm2 startup
```

### 5. 绑定域名与 HTTPS

1. 宝塔 → 网站 → 添加站点，绑定你的域名（暂时不用建 PHP/静态）
2. 在站点设置里添加 **反向代理**，目标地址填 `http://127.0.0.1:3000`
3. 在「SSL」里申请 Let's Encrypt 证书，开启强制 HTTPS
4. 到域名服务商处，把域名 A 记录解析到服务器公网 IP

> 3000 端口不需要在安全组放行，外部访问统一走 Nginx 的 80/443。

### 6. 备份与更新

- 备份 `data/` 目录和 `public/assets/img/`
- 更新代码后执行 `git pull`，再重启 Node 项目或 `pm2 restart xiaochuan`

## 上传到 GitHub / Gitee

`.gitignore` 已经排除了 `node_modules/`、`.env`、`data/*.json`、`data/.session-secret`，不会把密码、留言和邮件配置传上去。

```bash
git init
git add .
git commit -m "init: 小川的个人主页"

# GitHub
git remote add origin https://github.com/mikey0253z-spec/你的仓库.git
git branch -M main
git push -u origin main

# Gitee（可以和 GitHub 同时使用）
git remote add gitee https://gitee.com/hs223/你的仓库.git
git push -u gitee main
```

## 安全建议

- 一定要修改 `ADMIN_PASSWORD`，不要用默认密码
- 后台只通过 HTTPS 访问，不要把 3000 端口直接暴露到公网
- SMTP 密码只保存在服务器 `data/site.json`，不要把该文件发给别人
- 定期备份 `data/` 和 `public/assets/img/`
- 如果换了服务器，记得同时检查 `.env`、`data/site.json` 和域名解析

## 预览

| 首页（浅色） | 首页（深色） |
| --- | --- |
| ![首页](docs/preview/home.png) | ![深色首页](docs/preview/home-dark.png) |

| 留言板 | 管理后台 |
| --- | --- |
| ![留言板](docs/preview/guestbook.png) | ![后台](docs/preview/admin.png) |

| 新留言提醒邮件 |
| --- |
| ![邮件通知](docs/preview/email.png) |

更多截图见 `docs/preview/`。
