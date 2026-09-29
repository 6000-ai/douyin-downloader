/**
 * 本地 JSON 历史记录。写入失败不影响主流程。
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_ITEMS = 20;

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
  } catch {
    /* ignore */
  }
}

function readHistory() {
  try {
    ensureFile();
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeHistory(list) {
  try {
    ensureFile();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list.slice(0, MAX_ITEMS), null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function listHistory() {
  return readHistory();
}

function addHistory(item) {
  const list = readHistory();
  const row = {
    id: item.id,
    title: item.title,
    author: item.author || '',
    cover: item.cover || '',
    duration: item.duration || 0,
    savedAt: new Date().toISOString(),
  };
  const next = [row, ...list.filter((x) => x.id !== row.id)].slice(0, MAX_ITEMS);
  writeHistory(next);
  return next;
}

function clearHistory() {
  return writeHistory([]);
}

module.exports = { listHistory, addHistory, clearHistory };
