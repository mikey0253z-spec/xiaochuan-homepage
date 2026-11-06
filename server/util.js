'use strict';

const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** md5，用于生成 Gravatar / Cravatar 头像地址 */
function md5(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

/** 去掉首尾空白、统一换行、限制长度 */
function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

/** 补全并校验 http(s) 链接，不合法时返回空字符串 */
function normalizeWebsite(value) {
  const raw = clean(value, 200);
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/** 校验留言提交，返回 { errors, data } */
function validateSubmission(input = {}) {
  const errors = [];
  const nickname = clean(input.nickname, 20);
  const content = clean(input.content, 500);
  const email = clean(input.email, 120);
  const websiteRaw = clean(input.website, 200);

  if (!nickname) errors.push('请填写昵称');
  if (content.length < 2) errors.push('留言内容太短了');
  if (content.length > 500) errors.push('留言最多 500 字');
  if (email && !EMAIL_RE.test(email)) errors.push('邮箱格式不正确');

  let website = '';
  if (websiteRaw) {
    website = normalizeWebsite(websiteRaw);
    if (!website) errors.push('网站链接格式不正确');
  }

  return { errors, data: { nickname, content, email, website } };
}

/** 校验站长回复 */
function validateReply(input = {}) {
  return clean(input.reply, 500);
}

/** 根据邮箱生成 Cravatar 头像地址（国内可访问的 Gravatar 镜像；没有头像时会 404，由前端回退到文字头像） */
function gravatarUrl(email) {
  if (!email) return '';
  const hash = md5(email.toLowerCase().trim());
  return `https://cravatar.cn/avatar/${hash}?d=404&s=96`;
}

/** 简单的滑动窗口限流器，按 key（通常是 IP）计数 */
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
    this.timer = setInterval(() => this.sweep(), Math.min(windowMs, 60_000));
    this.timer.unref?.();
  }

  sweep() {
    const now = Date.now();
    for (const [key, stamps] of this.hits) {
      const alive = stamps.filter((time) => now - time < this.windowMs);
      if (alive.length) this.hits.set(key, alive);
      else this.hits.delete(key);
    }
  }

  allow(key) {
    const now = Date.now();
    const stamps = (this.hits.get(key) || []).filter((time) => now - time < this.windowMs);
    if (stamps.length >= this.limit) {
      this.hits.set(key, stamps);
      return false;
    }
    stamps.push(now);
    this.hits.set(key, stamps);
    return true;
  }
}

module.exports = {
  md5,
  clean,
  normalizeWebsite,
  validateSubmission,
  validateReply,
  gravatarUrl,
  RateLimiter,
};
