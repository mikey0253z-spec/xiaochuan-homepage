'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const store = require('./server/store');
const auth = require('./server/auth');
const adminAccount = require('./server/admin');
const site = require('./server/site');
const render = require('./server/render');
const mailer = require('./server/mailer');
const { ICON_OPTIONS } = require('./server/icons');
const {
  validateSubmission,
  validateReply,
  gravatarUrl,
  RateLimiter,
} = require('./server/util');

// 读取项目根目录的 .env（如果存在），方便本地启动；宝塔里也可以直接配置环境变量
(function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
})();

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMG_DIR = path.join(PUBLIC_DIR, 'assets', 'img');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '8mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ---------- 限流 ----------
const submitLimiter = new RateLimiter(5, 10 * 60 * 1000); // 每个 IP 10 分钟最多提交 5 条
const loginLimiter = new RateLimiter(8, 10 * 60 * 1000); // 每个 IP 10 分钟最多尝试登录 8 次
const passwordLimiter = new RateLimiter(5, 10 * 60 * 1000); // 修改密码也要限流
const likeLimiter = new RateLimiter(40, 60 * 60 * 1000); // 每个 IP 每小时最多点赞 40 次
const likeSeen = new Map(); // `${ip}:${messageId}` -> 上次点赞时间，防止同一个人刷赞

function clientIp(req) {
  return String(req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

function requestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

/** 公开接口只暴露这些字段，邮箱永远不出网 */
function publicMessage(message) {
  return {
    id: message.id,
    nickname: message.nickname,
    website: message.website || '',
    content: message.content,
    createdAt: message.createdAt,
    reply: message.reply || '',
    replyAt: message.replyAt || null,
    likes: Number(message.likes) || 0,
    avatar: message.email ? gravatarUrl(message.email) : '',
  };
}

function countByStatus() {
  const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const message of store.all()) {
    counts.total += 1;
    counts[message.status] = (counts[message.status] || 0) + 1;
  }
  return counts;
}

function isImageBuffer(buffer, kind) {
  if (kind === 'jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (kind === 'png') {
    return (
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  return false;
}

function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;
  const kind = match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) return null;
  if (!isImageBuffer(buffer, kind)) return null;
  return { kind, buffer };
}

// ---------- 公开接口 ----------

/** 已审核通过的留言列表（分页） */
app.get('/api/messages', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const approved = store
    .all()
    .filter((message) => message.status === 'approved')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const start = (page - 1) * limit;

  res.json({
    items: approved.slice(start, start + limit).map(publicMessage),
    page,
    pages: Math.max(1, Math.ceil(approved.length / limit)),
    total: approved.length,
  });
});

/** 站点公开信息（不需要登录） */
app.get('/api/site', (req, res) => {
  res.json({ site: site.publicSite() });
});

/** 提交留言，进入待审核状态，并给站长发邮件提醒 */
app.post('/api/messages', (req, res) => {
  const body = req.body || {};

  // 蜜罐字段：正常访客看不到，机器人往往会填
  if (typeof body.extra === 'string' && body.extra.trim()) {
    return res.json({ ok: true, message: '留言已提交，小川审核通过后才会显示在这里。' });
  }

  if (!submitLimiter.allow(clientIp(req))) {
    return res.status(429).json({ ok: false, error: '提交太频繁了，请稍后再试。' });
  }

  const { errors, data } = validateSubmission(body);
  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors[0] });
  }

  store.add(data);
  const message = '留言已提交，小川审核通过后才会显示在这里。';

  const currentSite = site.get();
  if (currentSite.mail.enabled) {
    mailer
      .notifyNewMessage(currentSite.mail, data, requestOrigin(req), currentSite)
      .catch((error) => console.error('[mail] 新留言通知发送失败：', error.message));
  }

  res.json({ ok: true, message });
});

/** 给某条留言点赞 */
app.post('/api/messages/:id/like', (req, res) => {
  const ip = clientIp(req);
  if (!likeLimiter.allow(ip)) {
    return res.status(429).json({ ok: false, error: '点赞太频繁了，请稍后再试。' });
  }

  const message = store.byId(req.params.id);
  if (!message || message.status !== 'approved') {
    return res.status(404).json({ ok: false, error: '留言不存在。' });
  }

  const seenKey = `${ip}:${message.id}`;
  const lastLikedAt = likeSeen.get(seenKey) || 0;
  if (Date.now() - lastLikedAt < 24 * 60 * 60 * 1000) {
    return res.json({ ok: true, likes: Number(message.likes) || 0 });
  }

  likeSeen.set(seenKey, Date.now());
  const updated = store.patch(message.id, { likes: (Number(message.likes) || 0) + 1 });
  res.json({ ok: true, likes: updated.likes });
});

// ---------- 后台接口 ----------

app.post('/api/admin/login', (req, res) => {
  if (!loginLimiter.allow(clientIp(req))) {
    return res.status(429).json({ ok: false, error: '尝试次数太多，请稍后再试。' });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!adminAccount.verifyCredentials(username, password)) {
    return res.status(401).json({ ok: false, error: '账号或密码不正确。' });
  }

  auth.setSession(res, req.secure || req.headers['x-forwarded-proto'] === 'https');
  res.json({ ok: true, username: adminAccount.getUsername() });
});

app.post('/api/admin/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  const authenticated = auth.isAuthenticated(req);
  res.json({
    authenticated,
    username: authenticated ? adminAccount.getUsername() : '',
  });
});

const adminOnly = (req, res, next) => {
  if (!auth.isAuthenticated(req)) {
    return res.status(401).json({ ok: false, error: '请先登录。' });
  }
  next();
};

/** 修改后台账号和密码（需要登录 + 验证当前密码） */
app.post('/api/admin/account', adminOnly, (req, res) => {
  if (!passwordLimiter.allow(clientIp(req))) {
    return res.status(429).json({ ok: false, error: '尝试次数太多，请稍后再试。' });
  }

  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!adminAccount.verifyCredentials(adminAccount.getUsername(), currentPassword)) {
    return res.status(400).json({ ok: false, error: '当前密码不正确。' });
  }
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
    return res.status(400).json({
      ok: false,
      error: '账号需要 3 到 24 位，只能使用字母、数字、下划线、点或短横线。',
    });
  }
  if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) {
    return res.status(400).json({ ok: false, error: '新密码需要 8 到 128 位。' });
  }
  if (newPassword && newPassword === currentPassword) {
    return res.status(400).json({ ok: false, error: '新密码不能和当前密码相同。' });
  }

  adminAccount.setAccount(username, newPassword || currentPassword);
  res.json({ ok: true, username, message: '账号设置已保存，下次登录请使用新账号。' });
});

/** 后台留言列表，可按状态筛选；包含邮箱等管理字段 */
app.get('/api/admin/messages', adminOnly, (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
    ? req.query.status
    : '';
  let items = store.all().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status) items = items.filter((message) => message.status === status);
  res.json({ items, counts: countByStatus() });
});

/** 通过 / 拒绝 / 退回待审核 */
app.post('/api/admin/messages/:id/status', adminOnly, (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ ok: false, error: '状态不正确。' });
  }
  const updated = store.patch(req.params.id, { status });
  if (!updated) return res.status(404).json({ ok: false, error: '留言不存在。' });
  res.json({ ok: true });
});

/** 站长回复（传空字符串表示清空回复） */
app.post('/api/admin/messages/:id/reply', adminOnly, (req, res) => {
  const reply = validateReply(req.body || {});
  const updated = store.patch(req.params.id, {
    reply,
    replyAt: reply ? new Date().toISOString() : null,
  });
  if (!updated) return res.status(404).json({ ok: false, error: '留言不存在。' });
  res.json({ ok: true, message: updated });
});

/** 删除留言 */
app.delete('/api/admin/messages/:id', adminOnly, (req, res) => {
  if (!store.remove(req.params.id)) {
    return res.status(404).json({ ok: false, error: '留言不存在。' });
  }
  res.json({ ok: true });
});

/** 读取完整站点设置（含邮件配置，仅后台） */
app.get('/api/admin/site', adminOnly, (req, res) => {
  res.json({ site: site.get(), iconOptions: ICON_OPTIONS });
});

/** 保存站点设置（支持只提交发生变化的字段） */
app.put('/api/admin/site', adminOnly, (req, res) => {
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const result = site.update(input);
  if (result.errors && result.errors.length) {
    return res.status(400).json({ ok: false, error: result.errors[0], errors: result.errors });
  }
  render.clearCache();
  res.json({ ok: true, site: site.get(), iconOptions: ICON_OPTIONS });
});

/** 上传头像：前端先裁成正方形，再传 480 头像 + 64/180 图标 */
app.post('/api/admin/avatar', adminOnly, (req, res) => {
  const body = req.body || {};
  const avatar = decodeImageDataUrl(body.avatar);
  const favicon = decodeImageDataUrl(body.favicon);
  const touch = decodeImageDataUrl(body.touch);

  if (!avatar || !favicon || !touch) {
    return res.status(400).json({ ok: false, error: '图片数据不完整或格式不正确。' });
  }

  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMG_DIR, 'avatar.jpg'), avatar.buffer);
  fs.writeFileSync(path.join(IMG_DIR, 'favicon.png'), favicon.buffer);
  fs.writeFileSync(path.join(IMG_DIR, 'apple-touch-icon.png'), touch.buffer);

  site.setAvatar('assets/img/avatar.jpg');
  render.clearCache();

  res.json({ ok: true, avatar: 'assets/img/avatar.jpg', updatedAt: site.get().updatedAt });
});

/** 发送测试邮件（可以使用表单里还没保存的配置） */
app.post('/api/admin/mail/test', adminOnly, async (req, res) => {
  const mail = req.body && req.body.mail ? req.body.mail : site.get().mail;
  try {
    await mailer.sendTest(mail, site.get(), requestOrigin(req));
    res.json({ ok: true, message: '测试邮件已发送，请查收。' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// ---------- 页面 ----------

function sendPage(res, name) {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(render.render(name));
}

app.get(['/', '/index.html'], (req, res) => sendPage(res, 'index.html'));
app.get(['/about.html'], (req, res) => sendPage(res, 'about.html'));
app.get(['/guestbook.html'], (req, res) => sendPage(res, 'guestbook.html'));
app.get(['/admin', '/admin.html'], (req, res) => sendPage(res, 'admin.html'));
app.get(['/404.html'], (req, res) => sendPage(res, '404.html'));

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '7d' }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: '接口不存在。' });
  }
  res.status(404).type('html').send(render.render('404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: '请求格式不正确。' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: '上传的内容太大了。' });
  }
  console.error('[server]', error);
  res.status(500).json({ ok: false, error: '服务器开小差了，请稍后再试。' });
});

app.listen(PORT, () => {
  console.log(`小川的个人主页已启动：http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[提醒] 没有设置 ADMIN_PASSWORD，正在使用默认密码 admin123456，请尽快修改。');
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.warn('[提醒] 后台密码偏短，建议至少 8 位。');
  }
});
