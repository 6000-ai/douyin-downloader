const express = require('express');
const path = require('path');
const fs = require('fs');
const { parseDouyin, ParseError } = require('../services/parser');
const history = require('../services/history');

const router = express.Router();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeFilename(name) {
  return String(name || 'douyin')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'douyin';
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'douyin-downloader', time: new Date().toISOString() });
});

router.post('/parse', async (req, res) => {
  const input = req.body?.input;
  if (!input || !String(input).trim()) {
    return res.status(400).json({ ok: false, error: '请输入抖音分享口令或链接' });
  }
  try {
    const data = await parseDouyin(String(input));
    try {
      history.addHistory(data);
    } catch {
      /* history is optional */
    }
    return res.json({ ok: true, data });
  } catch (err) {
    const code = err instanceof ParseError ? err.code : 'INTERNAL';
    const status = err instanceof ParseError && code === 'INVALID_INPUT' ? 400 : 502;
    return res.status(status).json({
      ok: false,
      error: err.message || '解析失败',
      code,
    });
  }
});

router.get('/download', async (req, res) => {
  const src = String(req.query.src || '');
  const filename = sanitizeFilename(req.query.filename || 'douyin') + '.mp4';

  if (!isHttpUrl(src)) {
    return res.status(400).json({ ok: false, error: '无效的下载地址' });
  }

  try {
    const upstream = await fetch(src, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.douyin.com/',
        Accept: '*/*',
      },
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ ok: false, error: '上游资源不可用' });
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    // Node 18+ fetch → web stream，转为 Node 可读
    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: '下载失败：' + (err.message || '网络错误') });
    }
  }
});

router.get('/proxy', async (req, res) => {
  const url = String(req.query.url || '');
  if (!isHttpUrl(url)) {
    return res.status(400).json({ ok: false, error: '无效的图片地址' });
  }
  try {
    const upstream = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.douyin.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ ok: false, error: '图片不可用' });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).json({ ok: false, error: '图片代理失败' });
  }
});

router.get('/history', (_req, res) => {
  res.json({ ok: true, data: history.listHistory() });
});

router.delete('/history', (_req, res) => {
  history.clearHistory();
  res.json({ ok: true });
});

module.exports = router;
