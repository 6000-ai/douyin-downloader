# 抖音视频下载器 · Douyin DL

极简工具站：粘贴抖音分享口令或作品链接，解析并下载无水印视频与封面。

**源码仓库**：<https://github.com/6000-ai/douyin-downloader>

**一键部署到 Render**：<https://render.com/deploy?repo=https://github.com/6000-ai/douyin-downloader>

> **合规声明**：本工具仅供下载自有或已获授权的内容、以及平台允许的合理个人使用场景。请勿用于二次传播或商业用途；因使用产生的版权责任由用户自行承担。

## 快速开始

```bash
cd douyin-downloader
npm install
npx playwright install chromium   # 首次需要
npm start
```

打开 <http://localhost:8787>

可用环境变量 `PORT` 修改端口（默认 `8787`）。

## 分享给其他人（公网访问）

双击或运行 `start-public.bat`，会：

1. 启动本地服务（`0.0.0.0:8787`）
2. 启动 Cloudflare 快速隧道，输出形如 `https://xxx.trycloudflare.com` 的公网地址

把该 **https 链接**发给任何人即可使用（无需对方装任何东西）。

说明：
- 快速隧道地址每次重启会变；关掉窗口即失效
- 已内置限流（解析约 12 次/分钟/IP）
- 服务跑在你的电脑上，睡眠/关机后公网链接不可用

```bash
# 或手动分两步
npm start
bin\cloudflared.exe tunnel --url http://127.0.0.1:8787 --no-autoupdate
```

## 功能

- 粘贴分享口令 / 短链 / 作品链接，自动解析
- 预览封面、标题、作者、时长
- 下载视频（mp4）与封面（jpg）
- 本地最近记录（`data/history.json`）
- 粘贴即解析、失败友好提示

## 架构

```
public/     前端（原生 HTML/CSS/JS）
server/
  index.js  Express 入口
  routes/api.js
  services/
    extract.js       从文本提取 URL / 作品 ID
    parser.js        多策略解析编排
    browserParser.js Playwright 浏览器解析（主策略）
    history.js       本地历史
data/       运行时生成
```

解析链路：提取输入 → 短链跟随取 ID → **Playwright 真实会话抓取元数据与播放地址** →（兜底）iteminfo / web detail / 页面 RENDER_DATA → 归一化 → 下载走后端流式代理。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/parse` | `{ input }` → `{ ok, data \| error }` |
| `GET` | `/api/download?src=&filename=` | 流式下载视频 |
| `GET` | `/api/proxy?url=` | 封面代理 |
| `GET` | `/api/history` | 最近记录 |
| `DELETE` | `/api/history` | 清空记录 |

`data` 字段：`id, title, author, authorAvatar, cover, videoUrl, duration, platform`

## 技术说明

- 后端：Node.js + Express
- 解析：Playwright（Chromium headless）。抖音网页对非浏览器请求返回空 JSON，因此浏览器会话是主策略
- 依赖：`express`、`playwright`（首次需 `npx playwright install chromium`）
- 未实现风控对抗；解析失败会如实报错

## 目录与启动

```bash
npm start          # node server/index.js
npm run dev        # node --watch server/index.js
```
