/**
 * Playwright 浏览器解析：在真实页面会话中提取视频元数据与播放地址。
 * 严格按目标作品 ID 过滤，避免抓到推荐/合集里的邻条。
 */

const { chromium } = require('playwright');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      /* ignore */
    }
    browserPromise = null;
  }
}

function isPlaceholderUrl(url) {
  const u = String(url || '');
  if (!u) return true;
  // 页面 UI 占位素材，不是正片
  if (/douyinstatic\.com/i.test(u)) return true;
  if (/uuu_\d+\.mp4|placeholder|loading.*\.mp4/i.test(u)) return true;
  return false;
}

function pickBestUrl(urls) {
  const list = (urls || [])
    .filter(Boolean)
    .map((u) => String(u))
    .filter((u) => !isPlaceholderUrl(u));
  if (!list.length) return '';

  // 优先级：直链 CDN > /play/ 封装 > 非水印 > 兜底
  const direct = list.find((u) => /douyinvod\.com|\.mp4(\?|$)/i.test(u) && !/playwm/i.test(u));
  if (direct) return direct;

  const play = list.find((u) => /\/play(?!wm)/i.test(u));
  if (play) return play;

  const nonWm = list.find((u) => !/playwm/i.test(u));
  return (nonWm || list[0]).replace(/playwm/g, 'play');
}

function cleanTitle(title) {
  return String(title || '未命名视频')
    .replace(/\s*-\s*抖音\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function normalizeFromAweme(item, fallbackId = '') {
  if (!item) return null;
  const video = item.video || {};
  // download_addr 常带 logo，仅作最后兜底
  const addrs = [video.play_addr, video.play_addr_h264, video.play_addr_265, video.download_addr];
  let videoUrl = '';
  for (const a of addrs) {
    if (!a) continue;
    videoUrl = pickBestUrl(a.url_list);
    if (videoUrl && !isPlaceholderUrl(videoUrl)) break;
    videoUrl = '';
  }

  const cover =
    video.cover?.url_list?.[0] ||
    video.origin_cover?.url_list?.[0] ||
    video.dynamic_cover?.url_list?.[0] ||
    item.cover?.url_list?.[0] ||
    '';

  return {
    id: String(item.aweme_id || item.group_id || fallbackId || ''),
    title: cleanTitle(item.desc || item.title),
    author: String(item.author?.nickname || item.author?.unique_id || '').slice(0, 80),
    authorAvatar: item.author?.avatar_thumb?.url_list?.[0] || '',
    cover,
    videoUrl,
    duration: Number((video.duration || item.duration || 0) / 1000),
    platform: 'douyin',
  };
}

function collectAwemes(obj, depth = 0, out = []) {
  if (!obj || depth > 12) return out;
  if (Array.isArray(obj)) {
    for (const el of obj) collectAwemes(el, depth + 1, out);
    return out;
  }
  if (typeof obj !== 'object') return out;

  if ((obj.aweme_id || obj.group_id) && obj.video && (obj.video.play_addr || obj.video.download_addr)) {
    out.push(obj);
  }
  if (obj.aweme_detail) collectAwemes(obj.aweme_detail, depth + 1, out);
  if (obj.itemList) collectAwemes(obj.itemList, depth + 1, out);
  if (obj.item_list) collectAwemes(obj.item_list, depth + 1, out);

  for (const value of Object.values(obj)) {
    collectAwemes(value, depth + 1, out);
  }
  return out;
}

/**
 * @param {string} pageUrl 作品页
 * @param {string} [targetId] 目标作品 ID
 */
async function parseWithBrowser(pageUrl, targetId = '') {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await context.newPage();
    const collected = [];

    page.on('response', async (res) => {
      try {
        const u = res.url();
        if (!/aweme|iteminfo|detail/i.test(u)) return;
        // 推荐流 / 合集列表可能带邻条，直接忽略
        if (/\/related\//i.test(u) || /\/series\//i.test(u)) return;

        const ct = res.headers()['content-type'] || '';
        if (!/json|text\/plain/i.test(ct)) return;
        const text = await res.text();
        if (!text || text.length < 20) return;
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          return;
        }
        for (const it of collectAwemes(json)) {
          collected.push(it);
        }
      } catch {
        /* ignore */
      }
    });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 只认网络里目标作品的 play_addr，不要被页面占位 <video> 提前打断
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const hit = targetId
        ? collected.find((i) => String(i.aweme_id || i.group_id) === String(targetId))
        : collected[0];
      if (hit) {
        const v = hit.video || {};
        const hasPlay =
          (v.play_addr?.url_list?.length || 0) + (v.play_addr_265?.url_list?.length || 0) + (v.play_addr_h264?.url_list?.length || 0) + (v.download_addr?.url_list?.length || 0);
        if (hasPlay > 0) break;
      }
      await page.waitForTimeout(300);
    }

    // 严格匹配目标作品
    let item = null;
    if (targetId) {
      item = collected.find((i) => String(i.aweme_id || i.group_id) === String(targetId)) || null;
    }
    if (!item && !targetId && collected.length) {
      item = collected[0];
    }

    if (item) {
      const norm = normalizeFromAweme(item, targetId);
      if (norm && norm.videoUrl) {
        const domInfo = await page.evaluate(() => {
          const q = (s) => document.querySelector(s)?.getAttribute('content') || '';
          const text = (s) => document.querySelector(s)?.textContent?.trim() || '';
          return {
            ogImage: q('meta[property="og:image"]'),
            author: text('[data-e2e="video-author-name"]') || text('.author-name') || q('meta[name="author"]'),
          };
        }).catch(() => null);

        if (domInfo) {
          if (!norm.author && domInfo.author) norm.author = domInfo.author.slice(0, 80);
          if (!norm.cover && domInfo.ogImage) norm.cover = domInfo.ogImage;
        }
        return norm;
      }
    }

    // DOM 兜底：拒绝 UI 占位片与 blob
    const late = await page.evaluate(() => {
      const v = document.querySelector('video');
      const src = v?.currentSrc || v?.src || v?.querySelector('source')?.src || '';
      if (!src || String(src).startsWith('blob:')) return null;
      const title = document.querySelector('meta[property="og:title"]')?.content || document.title || '';
      const cover = document.querySelector('meta[property="og:image"]')?.content || '';
      const author =
        document.querySelector('[data-e2e="video-author-name"]')?.textContent?.trim() || '';
      return { src, title, cover, author };
    }).catch(() => null);

    if (late && late.src && !isPlaceholderUrl(late.src)) {
      return {
        id: String(targetId || ''),
        title: cleanTitle(late.title),
        author: late.author,
        authorAvatar: '',
        cover: late.cover || '',
        videoUrl: late.src,
        duration: 0,
        platform: 'douyin',
      };
    }

    // 有 item 但还没抽出可用地址时，再等一小会儿网络
    if (item && !normalizeFromAweme(item, targetId)?.videoUrl) {
      await page.waitForTimeout(2500);
      item =
        (targetId
          ? collected.find((i) => String(i.aweme_id || i.group_id) === String(targetId))
          : collected[0]) || item;
      const retry = normalizeFromAweme(item, targetId);
      if (retry && retry.videoUrl && !isPlaceholderUrl(retry.videoUrl)) return retry;
    }

    return null;
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { parseWithBrowser, closeBrowser, normalizeFromAweme, cleanTitle, pickBestUrl, isPlaceholderUrl };
