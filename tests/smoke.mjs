import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'xiaochuan-test-2026';

let cookie = '';
let passed = 0;

async function call(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { res, data, text };
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

async function login() {
  const { res, data } = await call('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200, '登录应成功');
  assert.equal(data.ok, true);
  const setCookie = res.headers.getSetCookie();
  assert.ok(setCookie.length > 0, '登录后应收到会话 cookie');
  cookie = setCookie[0].split(';')[0];
}

async function adminMessages(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const { res, data } = await call(`/api/admin/messages${query}`);
  assert.equal(res.status, 200);
  return data.items;
}

async function deleteAll() {
  for (const message of await adminMessages()) {
    const { res } = await call(`/api/admin/messages/${message.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200, '删除留言应成功');
  }
}

// ---------- 页面 ----------
await check('首页可以访问', async () => {
  const { res, text } = await call('/');
  assert.equal(res.status, 200);
  assert.match(text, /小川/);
});

await check('关于页可以访问', async () => {
  const { res } = await call('/about.html');
  assert.equal(res.status, 200);
});

await check('留言板可以访问', async () => {
  const { res } = await call('/guestbook.html');
  assert.equal(res.status, 200);
});

await check('后台页面可以访问', async () => {
  const { res } = await call('/admin');
  assert.equal(res.status, 200);
});

await check('未知页面返回 404', async () => {
  const { res } = await call('/not-a-page');
  assert.equal(res.status, 404);
});

// ---------- 登录 & 清理 ----------
await login();
await deleteAll();
assert.equal((await adminMessages()).length, 0);
console.log('✓ 已清空历史留言');

// ---------- 留言流程 ----------
let messageId = '';

await check('提交中文留言', async () => {
  const { res, data } = await call('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      nickname: '测试访客',
      email: 'test@example.com',
      website: 'https://example.com',
      content: '你好，这是一条测试留言 😊',
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
});

await check('审核前公开列表看不到留言', async () => {
  const { data } = await call('/api/messages');
  assert.equal(data.total, 0);
});

await check('后台能看到待审核留言', async () => {
  const items = await adminMessages('pending');
  assert.equal(items.length, 1);
  assert.equal(items[0].nickname, '测试访客');
  assert.equal(items[0].content, '你好，这是一条测试留言 😊');
  assert.equal(items[0].email, 'test@example.com');
  messageId = items[0].id;
});

await check('通过审核', async () => {
  const { res, data } = await call(`/api/admin/messages/${messageId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
});

await check('公开列表出现留言且不泄露邮箱', async () => {
  const { data } = await call('/api/messages');
  assert.equal(data.total, 1);
  const item = data.items[0];
  assert.equal(item.content, '你好，这是一条测试留言 😊');
  assert.equal(item.avatar.includes('cravatar.cn'), true);
  assert.equal(Object.hasOwn(item, 'email'), false);
});

await check('站长回复', async () => {
  const { res } = await call(`/api/admin/messages/${messageId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ reply: '谢谢你，第一条留言！' }),
  });
  assert.equal(res.status, 200);
  const { data } = await call('/api/messages');
  assert.equal(data.items[0].reply, '谢谢你，第一条留言！');
});

await check('点赞', async () => {
  const { res, data } = await call(`/api/messages/${messageId}/like`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(data.likes, 1);
});

// ---------- 校验与防护 ----------
await check('昵称为空会被拒绝', async () => {
  const { res } = await call('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ nickname: '', content: '测试' }),
  });
  assert.equal(res.status, 400);
});

await check('留言太短会被拒绝', async () => {
  const { res } = await call('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ nickname: '访客', content: 'a' }),
  });
  assert.equal(res.status, 400);
});

await check('邮箱格式错误会被拒绝', async () => {
  const { res } = await call('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ nickname: '访客', content: '测试内容', email: 'not-an-email' }),
  });
  assert.equal(res.status, 400);
});

await check('蜜罐字段会静默拦截', async () => {
  const { res, data } = await call('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ nickname: '机器人', content: '垃圾广告', extra: 'bot' }),
  });
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  const items = await adminMessages('pending');
  assert.equal(items.length, 0);
});

await check('未登录访问后台接口返回 401', async () => {
  const saved = cookie;
  cookie = '';
  const { res } = await call('/api/admin/messages');
  cookie = saved;
  assert.equal(res.status, 401);
});

// ---------- 清理 ----------
await deleteAll();
assert.equal((await adminMessages()).length, 0);
console.log('✓ 测试数据已清理');

// ---------- 站点设置 ----------
await check('公开站点信息接口', async () => {
  const { res, data } = await call('/api/site');
  assert.equal(res.status, 200);
  assert.ok(data.site.nickname);
  assert.ok(Array.isArray(data.site.socialLinks));
});

await check('后台可以读取站点设置', async () => {
  const { res, data } = await call('/api/admin/site');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(data.iconOptions));
  assert.ok(data.site.about.paragraphs.length > 0);
});

await check('修改昵称后前台页面立即生效', async () => {
  const updated = await call('/api/admin/site', {
    method: 'PUT',
    body: JSON.stringify({ nickname: '测试昵称' }),
  });
  assert.equal(updated.res.status, 200);
  const home = await call('/');
  assert.match(home.text, /测试昵称/);

  const restored = await call('/api/admin/site', {
    method: 'PUT',
    body: JSON.stringify({ nickname: '小川' }),
  });
  assert.equal(restored.res.status, 200);
});

await check('无效社交链接会被拒绝', async () => {
  const { res } = await call('/api/admin/site', {
    method: 'PUT',
    body: JSON.stringify({
      socialLinks: [{ label: '测试', url: 'javascript:alert(1)', icon: 'github' }],
    }),
  });
  assert.equal(res.status, 400);
});

await check('邮件配置不完整时测试发信返回 400', async () => {
  const { res } = await call('/api/admin/mail/test', {
    method: 'POST',
    body: JSON.stringify({ mail: { enabled: false, host: '', to: '' } }),
  });
  assert.equal(res.status, 400);
});

await check('头像上传格式错误会被拒绝', async () => {
  const { res } = await call('/api/admin/avatar', {
    method: 'POST',
    body: JSON.stringify({ avatar: 'not-an-image', favicon: '', touch: '' }),
  });
  assert.equal(res.status, 400);
});

await check('合法头像上传成功', async () => {
  const avatar = fs.readFileSync('public/assets/img/avatar.jpg').toString('base64');
  const favicon = fs.readFileSync('public/assets/img/favicon.png').toString('base64');
  const touch = fs.readFileSync('public/assets/img/apple-touch-icon.png').toString('base64');
  const { res } = await call('/api/admin/avatar', {
    method: 'POST',
    body: JSON.stringify({
      avatar: `data:image/jpeg;base64,${avatar}`,
      favicon: `data:image/png;base64,${favicon}`,
      touch: `data:image/png;base64,${touch}`,
    }),
  });
  assert.equal(res.status, 200);
});

// ---------- 后台账号 ----------
const adminFile = 'data/admin.json';
const adminBackup = fs.existsSync(adminFile) ? fs.readFileSync(adminFile) : null;

async function removeAdminFile() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.unlinkSync(adminFile);
    } catch (error) {
      if (error.code === 'ENOENT') return;
    }
    if (!fs.existsSync(adminFile)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (fs.existsSync(adminFile)) console.warn('[warn] data/admin.json 未能自动清理');
}

try {
  await check('错误账号无法登录', async () => {
    const res = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password }),
    });
    assert.equal(res.status, 401);
  });

  await check('后台修改账号密码并恢复', async () => {
    const originalName = username;
    const original = password;
    const tempName = 'tester';
    const temp = 'temp-pass-2026';

    const changed = await call('/api/admin/account', {
      method: 'POST',
      body: JSON.stringify({ username: tempName, currentPassword: original, newPassword: temp }),
    });
    assert.equal(changed.res.status, 200);
    assert.equal(changed.data.username, tempName);

    await call('/api/admin/logout', { method: 'POST' });
    const loginRes = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: tempName, password: temp }),
    });
    assert.equal(loginRes.status, 200);
    cookie = loginRes.headers.getSetCookie()[0].split(';')[0];

    const restored = await call('/api/admin/account', {
      method: 'POST',
      body: JSON.stringify({ username: originalName, currentPassword: temp, newPassword: original }),
    });
    assert.equal(restored.res.status, 200);

    await call('/api/admin/logout', { method: 'POST' });
    const again = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: originalName, password: original }),
    });
    assert.equal(again.status, 200);
    cookie = again.headers.getSetCookie()[0].split(';')[0];
  });
} finally {
  if (adminBackup) fs.writeFileSync(adminFile, adminBackup);
  else await removeAdminFile();
}

console.log(`\n全部通过：${passed} 项测试`);
