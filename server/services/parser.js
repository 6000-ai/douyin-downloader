/**
 * 多策略解析抖音作品：短链跳转 → iteminfo / web detail / 页面 RENDER_DATA。
 * 不做风控对抗；失败如实抛错。
 */

const { extract } = require('./extract');
const { parseWithBrowser, isPlaceholderUrl } = require('./browserParser');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const TIMEOUT_MS = 10_000;

class ParseError extends Error {
  constructor(message, code = 'PARSE_FAILED') {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

async function fetchText(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(init.headers || {}),
      },
      ...init,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, init = {}) {
  const res = await fetchText(url, {
    ...init,
    headers: { Accept: 'application/json, text/plain, */*', ...(init.headers || {}) },
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), finalUrl: res.url };
  } catch {
    return { status: res.status, data: null, raw: text, finalUrl: res.url };
  }
}

function firstImage(cover) {
  if (!cover) return '';
  if (typeof cover === 'string') return cover;
  return cover.url_list?.[0] || cover.url || '';
}

function normalizeItem(item, fallbackId) {
  if (!item) return null;
  const video = item.video || {};
  const playAddr = video.play_addr || video.download_addr || {};
  let videoUrl = playAddr.url_list?.[0] || '';
  // 常见的 play 地址带 playwm（水印），尽量换成 play
  if (videoUrl.includes('playwm')) videoUrl = videoUrl.replace('playwm', 'play');

  const cover =
    firstImage(video.cover) ||
    firstImage(video.origin_cover) ||
    firstImage(item.video?.dynamic_cover) ||
    firstImage(item.cover) ||
    '';

  return {
    id: String(item.aweme_id || item.group_id || fallbackId || ''),
    title: String(item.desc || item.title || '未命名视频').slice(0, 200),
    author: String(
      item.author?.nickname ||
      item.author_info?.nickname ||
      item.author?.unique_id ||
      ''
    ).slice(0, 80),
    authorAvatar: firstImage(item.author?.avatar_thumb) || firstImage(item.author?.avatar_medium) || '',
    cover,
    videoUrl,
    duration: Number(video.duration ? video.duration / 1000 : item.duration || 0),
    platform: 'douyin',
  };
}

async function resolveItemId(url) {
  // 尝试从短链 / 跳转结果中拿到作品 ID
  const res = await fetchText(url, { redirect: 'follow' });
  const finalUrl = res.url || url;
  const page = await res.text().catch(() => '');

  const patterns = [
    /(?:video|note)\/(\d{6,})/,
    /[?&]modal_id=(\d{6,})/,
    /[?&]item_ids?=(\d{6,})/,
    /"aweme_id"\s*:\s*"?(\d{6,})"?/,
    /aweme_id=(\d{6,})/,
  ];

  for (const re of patterns) {
    const m = finalUrl.match(re) || page.match(re);
    if (m && m[1]) return { itemId: m[1], finalUrl, page };
  }
  return { itemId: null, finalUrl, page };
}

async function strategyIteminfo(itemId) {
  const url = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${itemId}`;
  const { data } = await fetchJson(url);
  const item = data?.item_list?.[0] || data?.itemInfo?.itemStruct || null;
  return normalizeItem(item, itemId);
}

async function strategyWebDetail(itemId) {
  const url = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${itemId}&aid=6383&cookie_enabled=true`;
  const { data } = await fetchJson(url, {
    headers: {
      Referer: 'https://www.douyin.com/',
      'User-Agent': UA,
    },
  });
  const item = data?.aweme_detail || data?.data?.aweme_detail || null;
  return normalizeItem(item, itemId);
}

function decodeRenderData(html) {
  const m =
    html.match(/<script id="RENDER_DATA" type="application\/json">([\s\S]*?)<\/script>/) ||
    html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/) ||
    html.match(/window\.REHYDRATED_STATE\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (!m) return null;
  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function walkForItem(obj, depth = 0) {
  if (!obj || depth > 8) return null;
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const hit = walkForItem(el, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj !== 'object') return null;

  if (obj.video && (obj.video.play_addr || obj.video.download_addr) && (obj.desc !== undefined || obj.aweme_id)) {
    return obj;
  }
  if (obj.aweme_detail) return walkForItem(obj.aweme_detail, depth + 1);
  if (obj.itemList) return walkForItem(obj.itemList, depth + 1);
  if (obj.item_list) return walkForItem(obj.item_list, depth + 1);

  for (const value of Object.values(obj)) {
    const hit = walkForItem(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function strategyRenderData(itemId, pageUrl, html) {
  let page = html;
  if (!page) {
    const res = await fetchText(pageUrl || `https://www.douyin.com/video/${itemId}`);
    page = await res.text().catch(() => '');
  }
  const json = decodeRenderData(page);
  const item = walkForItem(json) || walkForItem(JSON.parse(safeStringExtract(page) || 'null'));
  return normalizeItem(item, itemId);
}

function safeStringExtract(html) {
  const m = html.match(/"aweme_id"\s*:\s*"(\d{6,})"[\s\S]{0,800}?"desc"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  return JSON.stringify({
    aweme_id: m[1],
    desc: JSON.parse(`"${m[2]}"`),
    video: {
      play_addr: {
        url_list: (html.match(/https?:\\\/\\\/[^"']+?\/aweme\/[^"']+?\/play[^"']*/g) || [])
          .slice(0, 1)
          .map((s) => s.replace(/\\\//g, '/')),
      },
      cover: {
        url_list: (html.match(/https?:\\\/\\\/[^"']+?\.(?:jpe?g|webp|png)[^"']*/g) || [])
          .slice(0, 3)
          .map((s) => s.replace(/\\\//g, '/')),
      },
    },
    author: { nickname: (html.match(/"nickname"\s*:\s*"((?:\\.|[^"\\])*)"/) || [])[1] || '' },
  });
}

/**
 * @param {string} input
 * @returns {Promise<object>}
 */
async function parseDouyin(input) {
  const target = extract(input);
  if (!target.url && !target.itemId) {
    throw new ParseError('未识别到有效的抖音链接或作品 ID', 'INVALID_INPUT');
  }

  let itemId = target.itemId;
  let page = '';
  let pageUrl = target.url;

  if (!itemId || target.kind === 'short') {
    const resolved = await resolveItemId(target.url);
    itemId = resolved.itemId || itemId;
    page = resolved.page || '';
    pageUrl = resolved.finalUrl || target.url;
  }

  if (!itemId) {
    throw new ParseError('无法从链接中解析出作品 ID', 'NO_ITEM_ID');
  }

  // 优先：真实浏览器会话（对空 JSON 防护有效）；严格按 itemId 匹配，避免推荐流误抓
  const canonical = pageUrl && /douyin\.com\/video\/\d+/i.test(pageUrl)
    ? pageUrl
    : `https://www.douyin.com/video/${itemId}`;
  let lastErr = null;
  let partial = null;
  try {
    const browserData = await parseWithBrowser(canonical, itemId);
    if (browserData && browserData.videoUrl && !isPlaceholderUrl(browserData.videoUrl)) {
      return { ...browserData, id: browserData.id || itemId };
    }
    if (browserData) {
      // 仅有封面等信息时，继续尝试 API 策略补播放地址
      partial = browserData;
    }
  } catch (err) {
    lastErr = err;
  }

  const strategies = [
    () => strategyIteminfo(itemId),
    () => strategyWebDetail(itemId),
    () => strategyRenderData(itemId, pageUrl, page),
  ];

  for (const fn of strategies) {
    try {
      const data = await fn();
      if (data && data.videoUrl) {
        return partial ? { ...partial, ...data, videoUrl: data.videoUrl || partial.videoUrl } : data;
      }
      if (data) {
        lastErr = new ParseError('未获取到视频播放地址', 'NO_VIDEO_URL');
        continue;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (partial && partial.videoUrl) return partial;

  throw lastErr instanceof ParseError
    ? lastErr
    : new ParseError('解析失败，请稍后重试或检查链接是否公开可见', 'PARSE_FAILED');
}

module.exports = { parseDouyin, ParseError, normalizeItem };
