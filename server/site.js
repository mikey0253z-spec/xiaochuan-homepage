'use strict';

const fs = require('fs');
const path = require('path');

const { clean } = require('./util');
const { ICONS } = require('./icons');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'site.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_PARAGRAPHS = [
  '欢迎来到我的小站，我是小川。',
  '这里没有复杂的功能，只有一张简单的名片、几句介绍，和一个可以说话的地方。我把它当成互联网上的一小块自留地：忙的时候放在一边，想起来的时候回来看看。',
  '如果你正好路过，希望这里能让你稍微慢下来一点。祝你今天也过得轻松、自在。',
];

const DEFAULTS = {
  nickname: '小川',
  signature: '慢节奏的生活和慢节奏的我。',
  avatar: 'assets/img/avatar.jpg',
  icp: '湘ICP备2025149411号',
  about: {
    kicker: 'About',
    title: '关于我',
    desc: '很高兴认识你。',
    paragraphs: DEFAULT_PARAGRAPHS,
  },
  socialLinks: [
    { label: 'GitHub', url: 'https://github.com/mikey0253z-spec', icon: 'github' },
    { label: 'Gitee', url: 'https://gitee.com/hs223', icon: 'gitee' },
    { label: '博客', url: 'https://blog.syuii.com/', icon: 'rss' },
    { label: '抖音', url: 'https://v.douyin.com/dY9vjtbcHH4/', icon: 'tiktok' },
    { label: '邮箱', url: 'mailto:1431858378@qq.com', icon: 'mail' },
  ],
  mail: {
    enabled: false,
    host: '',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    from: '',
    to: '',
  },
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let cache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(raw) {
  const base = clone(DEFAULTS);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    about: { ...base.about, ...(raw.about || {}) },
    mail: { ...base.mail, ...(raw.mail || {}) },
    socialLinks: Array.isArray(raw.socialLinks) ? raw.socialLinks : base.socialLinks,
  };
}

function get() {
  if (cache) return cache;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    cache = clone(DEFAULTS);
    return cache;
  }
  try {
    cache = mergeDefaults(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (error) {
    console.error('[site] 读取 site.json 失败，使用默认配置：', error.message);
    cache = clone(DEFAULTS);
  }
  return cache;
}

function persist(value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, FILE);
}

function publicSite() {
  const site = get();
  return {
    nickname: site.nickname,
    signature: site.signature,
    avatar: site.avatar,
    icp: site.icp,
    about: site.about,
    socialLinks: site.socialLinks,
    updatedAt: site.updatedAt,
  };
}

function normalizeWebsite(value) {
  const raw = clean(value, 300);
  if (!raw) return '';
  if (/^mailto:/i.test(raw)) {
    const address = raw.slice(7).trim();
    return EMAIL_RE.test(address) ? `mailto:${address}` : '';
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizeParagraphs(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/\n\s*\n/);
  return list
    .map((item) => clean(item, 2000))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeSocialLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((link) => {
      const label = clean(link && link.label, 20);
      const url = normalizeWebsite(link && link.url);
      const icon = link && ICONS[link.icon] ? link.icon : 'link';
      return { label, url, icon };
    })
    .filter((link) => link.label && link.url);
}

function normalizeMail(value, current) {
  const source = value && typeof value === 'object' ? value : {};
  const mail = {
    enabled: Boolean(source.enabled),
    host: clean(source.host, 120),
    port: Number.parseInt(source.port, 10) || 465,
    secure: Boolean(source.secure),
    user: clean(source.user, 120),
    pass: typeof source.pass === 'string' ? source.pass.slice(0, 200) : '',
    from: clean(source.from, 120),
    to: clean(source.to, 120),
  };
  if (mail.enabled) {
    const errors = [];
    if (!mail.host) errors.push('请填写 SMTP 服务器地址');
    if (!mail.to || !EMAIL_RE.test(mail.to)) errors.push('请填写正确的收件邮箱');
    if (mail.from && !EMAIL_RE.test(mail.from)) errors.push('发件邮箱格式不正确');
    if (mail.port < 1 || mail.port > 65535) errors.push('SMTP 端口不正确');
    return { mail, errors };
  }
  return { mail, errors: [] };
}

/** 局部更新站点设置；返回 { data } 或 { errors } */
function update(input = {}) {
  const current = get();
  const next = clone(current);
  const errors = [];

  if (Object.hasOwn(input, 'nickname')) {
    next.nickname = clean(input.nickname, 20);
    if (!next.nickname) errors.push('昵称不能为空');
  }
  if (Object.hasOwn(input, 'signature')) {
    next.signature = clean(input.signature, 60);
  }
  if (Object.hasOwn(input, 'icp')) {
    next.icp = clean(input.icp, 60);
  }

  if (Object.hasOwn(input, 'about')) {
    const about = input.about && typeof input.about === 'object' ? input.about : {};
    next.about = {
      kicker: clean(about.kicker, 20),
      title: clean(about.title, 30),
      desc: clean(about.desc, 60),
      paragraphs: normalizeParagraphs(about.paragraphs),
    };
    if (!next.about.title) errors.push('关于页标题不能为空');
    if (!next.about.paragraphs.length) errors.push('关于页正文不能为空');
  }

  if (Object.hasOwn(input, 'socialLinks')) {
    next.socialLinks = normalizeSocialLinks(input.socialLinks);
    if (Array.isArray(input.socialLinks) && next.socialLinks.length !== input.socialLinks.filter((item) => item && (item.label || item.url)).length) {
      errors.push('有社交链接填写不完整或格式不正确');
    }
  }

  if (Object.hasOwn(input, 'mail')) {
    const result = normalizeMail(input.mail, current.mail);
    next.mail = result.mail;
    errors.push(...result.errors);
  }

  if (errors.length) return { errors };
  next.updatedAt = new Date().toISOString();
  persist(next);
  cache = next;
  return { data: next };
}

function setAvatar(avatarPath) {
  const next = clone(get());
  next.avatar = avatarPath;
  next.updatedAt = new Date().toISOString();
  persist(next);
  cache = next;
  return next;
}

module.exports = { get, publicSite, update, setAvatar, DEFAULTS };
