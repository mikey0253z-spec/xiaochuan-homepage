'use strict';

const fs = require('fs');
const path = require('path');

const site = require('./site');
const { renderIcon } = require('./icons');

const VIEWS_DIR = path.join(__dirname, '..', 'views');
const ASSET_VERSION = Date.now().toString(36);
const cache = new Map();
let cacheVersion = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function buildSocialLinks(links) {
  return links
    .map((link) => {
      const external = !/^mailto:/i.test(link.url);
      const target = external ? ' target="_blank" rel="noopener"' : '';
      return `<a class="icon-link" href="${escapeHtml(link.url)}"${target} aria-label="${escapeHtml(link.label)}" title="${escapeHtml(link.label)}">${renderIcon(link.icon)}</a>`;
    })
    .join('\n        ');
}

function tokenValues(current) {
  const version = Date.parse(current.updatedAt) || 1;
  const avatar = /^https?:\/\//i.test(current.avatar)
    ? current.avatar
    : `${current.avatar}?v=${version}`;

  return {
    assetVersion: ASSET_VERSION,
    nickname: escapeHtml(current.nickname),
    signature: escapeHtml(current.signature),
    avatar: escapeHtml(avatar),
    avatarAlt: escapeHtml(`${current.nickname} 的头像`),
    icp: current.icp
      ? `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${escapeHtml(current.icp)}</a>`
      : '',
    socialLinks: buildSocialLinks(current.socialLinks),
    aboutKicker: escapeHtml(current.about.kicker),
    aboutTitle: escapeHtml(current.about.title),
    aboutDesc: escapeHtml(current.about.desc),
    aboutParagraphs: current.about.paragraphs
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join('\n        '),
    favicon: `assets/img/favicon.png?v=${version}`,
    touchIcon: `assets/img/apple-touch-icon.png?v=${version}`,
  };
}

function render(name) {
  const current = site.get();
  if (cacheVersion !== current.updatedAt) {
    cache.clear();
    cacheVersion = current.updatedAt;
  }
  if (cache.has(name)) return cache.get(name);

  const template = fs.readFileSync(path.join(VIEWS_DIR, name), 'utf8');
  const tokens = tokenValues(current);
  const html = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (match, key) =>
    Object.hasOwn(tokens, key) ? tokens[key] : match
  );
  cache.set(name, html);
  return html;
}

function clearCache() {
  cache.clear();
  cacheVersion = null;
}

module.exports = { render, clearCache, escapeHtml };
