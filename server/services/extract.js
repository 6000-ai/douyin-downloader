/**
 * 从抖音分享口令 / 短链 / 作品链接中提取可解析目标。
 */

const URL_RE = /https?:\/\/[^\s，。、；！？"'<>]+/gi;
const VIDEO_ID_RE = /(?:video|note|modal_id)\/(\d{6,})/;
const ITEM_ID_RE = /[?&](?:item_ids?|modal_id|aweme_id)=(\d{6,})/i;

function cleanUrl(raw) {
  if (!raw) return null;
  return raw.replace(/[)\]}>.,;:!?'"」』】]+$/g, '');
}

/**
 * @param {string} input 用户粘贴的任意文本
 * @returns {{ kind: 'short'|'web'|'id'|null, url: string|null, itemId: string|null }}
 */
function extract(input) {
  const text = String(input || '').trim();
  if (!text) return { kind: null, url: null, itemId: null };

  // 直接给出纯数字 ID
  if (/^\d{6,}$/.test(text)) {
    return { kind: 'id', url: null, itemId: text };
  }

  const urls = text.match(URL_RE) || [];
  const url = cleanUrl(urls[0]);
  if (!url) return { kind: null, url: null, itemId: null };

  let itemId = null;
  const m1 = url.match(VIDEO_ID_RE);
  const m2 = url.match(ITEM_ID_RE);
  if (m1) itemId = m1[1];
  else if (m2) itemId = m2[1];

  const isShort = /(?:v|www)\.douyin\.com\/[A-Za-z0-9_-]{4,}\/?(?:\?|$)/i.test(url)
    && !/\/(video|note|user|search|live)\//i.test(url)
    || /(?:vm|vt)\.tiktok\.com\//i.test(url);

  if (itemId) return { kind: 'web', url, itemId };
  if (isShort || /v\.douyin\.com\/[A-Za-z0-9_-]+/i.test(url)) {
    return { kind: 'short', url, itemId: null };
  }

  // 其他 douyin 链接（可能带 query）
  if (/douyin\.com/i.test(url)) return { kind: 'web', url, itemId };
  return { kind: 'web', url, itemId };
}

module.exports = { extract, cleanUrl };
