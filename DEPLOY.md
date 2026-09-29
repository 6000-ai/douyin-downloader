# 固定公网地址 / 长期在线

当前 `start-public.bat` 用的是 **Cloudflare 快速隧道**：
- 免费、免注册、马上能分享
- 地址每次重启会变，且**依赖你电脑开机**

要做到「固定域名 + 不依赖电脑开机」，需要把服务部署到云上。下面是三种可选路径（都免费额度足够个人使用）。

---

## 方案 A：Render.com（推荐，最省事）

1. 注册 <https://render.com>（可用 GitHub 账号登录）
2. 确认本机已 `git`，在项目目录执行：

```powershell
cd G:\AI\MIMO\douyin-downloader
git init
git add .
git commit -m "douyin downloader"
```

3. 推到 GitHub 新仓库后，在 Render 点 **New + → Web Service → 选仓库**
4. 构建方式选 **Docker**，会自动用根目录 `Dockerfile`
5. 部署完成后得到固定地址，例如 `https://douyin-dl.onrender.com`

> 免费实例会休眠，冷启动约 30s。个人分享够用。

---

## 方案 B：Fly.io（性能好，需信用卡或免费额度）

1. 安装 flyctl（<https://fly.io/docs/flyctl/install/>）
2. `fly auth login`
3. 项目目录已有 `fly.toml`，执行：

```powershell
fly launch --copy-config --no-deploy
fly deploy
```

4. `fly status` 查看固定域名（`https://douyin-dl.fly.dev`）

---

## 方案 C：Cloudflare 命名隧道（域名固定，仍需电脑开机）

1. 注册 Cloudflare（免费），加入一个域名（或使用免费域名）
2. `cloudflared tunnel login`
3. 创建命名隧道并绑定 DNS，之后地址固定，例如 `https://dl.你的域名`

---

## 本机已准备好的文件

| 文件 | 用途 |
|------|------|
| `Dockerfile` | 生产镜像（含 Playwright Chromium） |
| `render.yaml` | Render 配置 |
| `railway.json` | Railway 配置 |
| `fly.toml` | Fly.io 配置 |
| `start-public.bat` | 本地一键公网分享（快速隧道，地址会变） |

镜像已本地验证：`douyin-dl:latest`，`/api/health` 正常。
