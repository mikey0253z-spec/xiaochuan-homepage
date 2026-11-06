'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'messages.json');

let cache = null;

function ensureFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]\n', 'utf8');
}

function load() {
  if (cache) return cache;
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[store] 读取 messages.json 失败，本次使用空列表：', error.message);
    cache = [];
  }
  return cache;
}

/** 先写临时文件再重命名，避免写入中断导致数据损坏 */
function persist() {
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(load(), null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, FILE);
}

function all() {
  return load().map((message) => ({ ...message }));
}

function byId(id) {
  return load().find((message) => message.id === id) || null;
}

function add(data) {
  const message = {
    id: crypto.randomUUID(),
    nickname: data.nickname,
    email: data.email || '',
    website: data.website || '',
    content: data.content,
    status: 'pending',
    createdAt: new Date().toISOString(),
    reply: '',
    replyAt: null,
    likes: 0,
  };
  load().unshift(message);
  persist();
  return { ...message };
}

function patch(id, changes) {
  const message = byId(id);
  if (!message) return null;
  Object.assign(message, changes);
  persist();
  return { ...message };
}

function remove(id) {
  const list = load();
  const index = list.findIndex((message) => message.id === id);
  if (index === -1) return false;
  list.splice(index, 1);
  persist();
  return true;
}

module.exports = { DATA_DIR, all, byId, add, patch, remove };
