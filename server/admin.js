'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'admin.json');
const KEY_LENGTH = 64;
const DEFAULT_USERNAME = 'admin';

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readRecord() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (parsed && typeof parsed.hash === 'string' && typeof parsed.salt === 'string') {
      return {
        username:
          typeof parsed.username === 'string' && parsed.username.trim()
            ? parsed.username.trim()
            : DEFAULT_USERNAME,
        hash: parsed.hash,
        salt: parsed.salt,
        updatedAt: parsed.updatedAt || null,
      };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[admin] 读取 admin.json 失败：', error.message);
    }
  }
  return null;
}

/** 当前账号：改过就是自定义账号，否则默认 admin */
function getUsername() {
  const record = readRecord();
  return record ? record.username : DEFAULT_USERNAME;
}

/** 是否已经通过后台修改过账号 / 密码 */
function hasCustomAccount() {
  return Boolean(readRecord());
}

/**
 * 校验账号 + 密码：
 * - 改过账号后：用 admin.json 里的账号和 scrypt 哈希校验
 * - 没改过：账号固定为 admin，密码回退到 .env 的 ADMIN_PASSWORD
 */
function verifyCredentials(username, password) {
  const record = readRecord();
  const inputName = String(username ?? '').trim();

  if (record) {
    if (!safeEqual(inputName, record.username)) return false;
    const salt = Buffer.from(record.salt, 'hex');
    const stored = Buffer.from(record.hash, 'hex');
    const computed = crypto.scryptSync(String(password ?? ''), salt, KEY_LENGTH);
    return stored.length === computed.length && crypto.timingSafeEqual(stored, computed);
  }

  if (!safeEqual(inputName, DEFAULT_USERNAME)) return false;
  return safeEqual(password ?? '', process.env.ADMIN_PASSWORD || 'admin123456');
}

/** 保存账号和密码（scrypt + 随机盐），保存后 .env 里的密码不再用于登录 */
function setAccount(username, password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify(
      {
        username: String(username),
        hash: hash.toString('hex'),
        salt: salt.toString('hex'),
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  fs.renameSync(tmp, FILE);
}

module.exports = {
  DEFAULT_USERNAME,
  getUsername,
  hasCustomAccount,
  verifyCredentials,
  setAccount,
};
