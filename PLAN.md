# 抖音视频下载器 — 实现计划

## 1. 产品定位

一款**极简工具站**：用户粘贴抖音分享口令或链接 → 解析出无水印视频 → 本地下载视频 / 封面。

- 交付形态：可运行的完整产品（前端 + 后端）
- 功能范围：基础版（解析、预览封面、下载视频/封面、本地历史记录）
- 不在范围内：账号系统、云端同步、批量队列、清晰度切换

> **合规说明（写入页脚）**：本工具仅供下载**自有或已获授权**的内容、以及平台允许的合理个人使用场景。请勿用于二次传播或商业用途；因使用产生的版权责任由用户自行承担。

---

## 2. 视觉设计（设计定稿）

### 风格锚点
Linear / Vercel / Raycast 式**精密工具站**：大留白、细线分割、单一强调色、把「输入框」当作唯一主角。

### 色板
| 角色 | 色值 | 用途 |
|------|------|------|
| BG | `#FAFAFA` | 页面底 |
| Surface | `#FFFFFF` | 卡片 / 输入区 |
| Ink | `#111111` | 主文字 |
| Muted | `#71717A` | 次要文字 / 占位符 |
| Line | `#E4E4E7` | 边框 / 分割线 |
| Accent | `#2563EB` | 主按钮、链接、焦点环 |
| Accent Soft | `#EFF6FF` | 选中态 / 浅底 |
| Danger | `#DC2626` | 错误提示 |
| Success | `#16A34A` | 完成态 |

### 字体
- Latin：`Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`
- CJK：`"PingFang SC", "Microsoft YaHei", sans-serif`
- 标题 32–40px / 600；正文 15px / 400；辅助 13px；按钮 14px / 500
- 等宽（链接展示）：`ui-monospace, "SF Mono", Menlo, monospace`

### 布局系统
- 最大内容宽 `720px`，水平居中；移动端 100% 宽 + 20px 边距
- 垂直节奏：8 的倍数（8 / 16 / 24 / 32 / 48 / 64）
- 首屏：Logo 小标 → 大标题一句话价值 → 副文案 → **超大输入框**（带「粘贴」按钮）→ 解析按钮
- 结果区：解析成功后原地展开卡片（封面 16:9 + 元信息 + 双下载按钮）
- 历史区：折叠在下方，最多显示最近 10 条，可一键清空
- 圆角：输入框/卡片 `12px`，按钮 `8px`，芯片 `999px`
- 阴影：仅结果卡片使用极淡阴影 `0 1px 2px rgba(0,0,0,.04)`

### 签名时刻（Signature Moments）
1. **粘贴即解析**：输入框获得焦点时监听 `paste`，自动填入并触发解析；按钮上有 `⌘V` 键帽提示
2. **结果卡片展开**：解析成功时封面图淡入 + 元信息从上滑入，下载按钮常驻右下角

### 图标
内联 SVG（16/20px，stroke 1.5），不引入图标库。

---

## 3. 技术架构

```
douyin-downloader/
├── PLAN.md
├── package.json
├── server/
│   ├── index.js              # Express 入口（静态托管 + API）
│   ├── routes/
│   │   └── api.js            # POST /api/parse, GET /api/download, GET /api/proxy
│   └── services/
│       ├── extract.js        # 从分享文本提取 URL / video_id
│       ├── parser.js         # 多策略解析元数据与播放地址
│       └── history.js        # 本地 JSON 历史（可选写入）
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
│   └── history.json          # 运行时生成
└── README.md
```

### 技术栈
| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | 原生 HTML/CSS/JS | 单页工具站，零构建、易部署 |
| 后端 | Node.js + Express 4 | 与前端同栈，部署简单 |
| 解析 | Playwright（主）+ 多策略 API 兜底 | 抖音对非浏览器返回空 JSON，浏览器会话可稳定拿到播放地址 |
| 存储 | 本地 `data/history.json` | 基础版无需数据库 |
| 运行时 | `$MIMO_NODE` / 系统 Node | 均可用 |

### 解析链路（核心）

```
用户输入（口令 / 短链 / 作品链接）
        │
        ▼
[1] extract：正则取出 https://… / item_ids
        │
        ▼
[2] 短链跟随：GET v.douyin.com/... 拿 Location / 页面
        │  提取 /video/{id} 或 modal_id={id}
        ▼
[3] 多策略解析（按序尝试，成功即停）
   ├─ A. iesdouyin web/api/v2/aweme/iteminfo
   ├─ B. www.douyin.com/aweme/v1/web/aweme/detail（带 UA/Cookie 骨架）
   └─ C. 解析作品页 __RENDER_DATA__ / REHYDRATED_STATE
        │
        ▼
[4] 归一化：{ id, title, author, cover, videoUrl, duration, size? }
        │
        ▼
[5] 返回 JSON → 前端渲染结果卡
下载时后端代理流式转发（避免 CORS / Referer 限制）
```

**策略 C 失败时**：前端展示「解析失败」+ 可复制原始链接，不静默吞错。

### API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/parse` | body `{ input: string }` → `{ ok, data \| error }` |
| `GET` | `/api/download?src=<encoded>&filename=` | 流式下载视频 |
| `GET` | `/api/proxy?url=` | 封面图代理（防防盗链） |
| `GET` | `/api/history` | 最近历史 |
| `DELETE` | `/api/history` | 清空历史 |
| `GET` | `/api/health` | 健康检查 |

`data` 字段：
```json
{
  "id": "7350…",
  "title": "视频标题",
  "author": "作者名",
  "cover": "https://…",
  "videoUrl": "https://…",
  "duration": 12.4
}
```

---

## 4. 页面结构（单页）

```
┌─────────────────────────────────────┐
│  ◆ Douyin DL          使用说明 ↗    │  ← 顶栏
│                                     │
│        下载抖音视频                  │  ← H1
│   粘贴分享口令或链接，获取无水印视频 │  ← 副文案
│                                     │
│  ┌───────────────────────┬───────┐  │
│  │ 粘贴抖音分享口令/链接  │ 粘贴  │  │  ← 超大输入
│  └───────────────────────┴───────┘  │
│           [ 解析并下载 ]            │  ← 主按钮
│                                     │
│  ── 解析结果 ────────────────────   │
│  ┌─────────────────────────────────┐│
│  │ [封面图 16:9]                   ││
│  │  视频标题                       ││
│  │  @作者 · 00:12 · ID …           ││
│  │              [下载封面] [下载视频]││
│  └─────────────────────────────────┘│
│                                     │
│  ── 最近记录 ────────────────────   │
│  · 标题A                    [下载]  │
│  · 标题B                    [下载]  │
│                                     │
│  仅供个人合理使用 · 勿用于二次传播   │  ← 页脚
└─────────────────────────────────────┘
```

### 交互细节
1. 输入框 `⌘/Ctrl+V` 粘贴自动解析；按钮旁显示键帽
2. 解析中：按钮 spinner + 文案「正在解析…」，禁用重复提交
3. 失败：输入框下方红字错误，保留已输入内容
4. 下载：触发 `window.location = /api/download?...`，文件名用标题 sanitize
5. 历史：解析成功自动写入；点击条目可快速再次下载
6. 响应式：<640px 时封面全宽、按钮纵排

---

## 5. 实现步骤

| # | 任务 | 产出 | 验收 |
|---|------|------|------|
| 1 | 脚手架：package.json、Express 静态服务、/api/health | 服务可起 | `curl health` ok |
| 2 | extract.js：口令/短链/作品链解析 | 单测用例通过 | 3 种输入都抽出 id/url |
| 3 | parser.js：策略 A/B/C + 归一化 | 真实链接解析成功 | 返回完整 JSON |
| 4 | 下载代理 + 封面代理 | 浏览器可存 mp4/jpg | Content-Disposition 正确 |
| 5 | 前端 UI：index.html + styles.css + app.js | 页面视觉达标 | 对照设计稿 |
| 6 | 历史记录读写 | 刷新后仍在 | 列表增删正常 |
| 7 | 联调 + 错误态 + README | 可交付 | 端到端走通 |

### 关键实现约束
- **不写**绕过风控 / 验证码 / 设备指纹的对抗逻辑；解析失败就如实报错
- 外链请求带常规浏览器 UA，超时 10s，失败降级到下一策略
- `videoUrl` 下载走后端 `http.get` 流式转发，限制仅 http/https
- 文件名用 `sanitize-filename` 风格正则清洗
- 历史文件写入失败不影响主流程
- 端口默认 `5178`，可用 `PORT` 覆盖

---

## 6. 测试与验收

1. **健康检查**：`GET /api/health` 返回 200
2. **解析**：用真实分享口令（用户提供）验证 A/B/C 至少一条成功
3. **下载**：浏览器点击「下载视频」得到可播放 mp4
4. **封面**：封面图正常显示（无防盗链空白）
5. **错误**：输入乱码 → 友好错误；断网 → 超时提示
6. **响应式**：375 / 768 / 1440 三档不破版
7. **视觉**：对照色板与签名时刻检查截图

---

## 7. 交付物

- 可运行源码（前端 + 后端）
- `README.md`：启动方式、API 说明、合规声明
- 本 `PLAN.md`（设计与实现记录）

**启动命令**
```bash
cd G:/AI/MIMO/douyin-downloader
npm install
npx playwright install chromium   # 首次
$MIMO_NODE server/index.js
# 打开 http://localhost:8787
```

---

## 8. 风险与对策

| 风险 | 对策 |
|------|------|
| 抖音接口变更导致解析失败 | 多策略降级；错误文案清晰；预留 yt-dlp 可选集成 |
| 防盗链导致封面不显示 | `/api/proxy` 带 Referer 转发 |
| 下载被跨域拦截 | 始终经后端代理 |
| 用户误用于侵权 | 页脚 + README 明确合规边界 |
