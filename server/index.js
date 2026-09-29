const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const apiRouter = require('./routes/api');
const { closeBrowser } = require('./services/browserParser');

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
// 位于隧道/反代之后时，用 X-Forwarded-* 还原客户端 IP
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

// 公网开放后的基础限流，保护 Playwright 解析资源
const parseLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: '请求过于频繁，请稍后再试', code: 'RATE_LIMITED' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: '请求过于频繁，请稍后再试', code: 'RATE_LIMITED' },
});

app.use('/api/parse', parseLimiter);
app.use('/api', apiLimiter);
app.use('/api', apiRouter);
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[douyin-downloader] local  http://localhost:${PORT}`);
  console.log(`[douyin-downloader] bind   http://${HOST}:${PORT} (LAN / tunnel)`);
});

async function shutdown() {
  server.close();
  await closeBrowser().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
