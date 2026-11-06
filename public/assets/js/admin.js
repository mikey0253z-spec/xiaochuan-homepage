(function () {
  'use strict';

  const loginView = document.getElementById('login-view');
  const adminView = document.getElementById('admin-view');
  if (!loginView || !adminView) return;

  const loginForm = document.getElementById('login-form');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const loginStatus = document.getElementById('login-status');
  const logoutBtn = document.getElementById('logout-btn');
  const listEl = document.getElementById('admin-messages');
  const emptyEl = document.getElementById('admin-empty');
  const toastEl = document.getElementById('toast');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const adminTabs = Array.from(document.querySelectorAll('.admin-tab'));
  const panels = Array.from(document.querySelectorAll('.admin-panel'));
  const tabPending = document.getElementById('tab-pending');

  const confirmModal = document.getElementById('confirm-modal');
  const confirmText = document.getElementById('confirm-text');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  const siteForm = document.getElementById('site-form');
  const siteStatus = document.getElementById('site-status');
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');
  const avatarStatus = document.getElementById('avatar-status');
  const socialList = document.getElementById('social-list');
  const socialAdd = document.getElementById('social-add');

  const mailForm = document.getElementById('mail-form');
  const mailStatus = document.getElementById('mail-status');
  const mailTest = document.getElementById('mail-test');

  const countEls = {
    pending: document.getElementById('count-pending'),
    approved: document.getElementById('count-approved'),
    rejected: document.getElementById('count-rejected'),
    total: document.getElementById('count-total'),
  };

  const STATUS_LABEL = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
  };

  let currentStatus = 'pending';
  let toastTimer = null;
  let iconOptions = [];
  let siteLoaded = false;
  let currentUsername = 'admin';

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  function setStatus(element, message, isError) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', Boolean(isError));
  }

  function setLoginStatus(message, isError) {
    setStatus(loginStatus, message, isError);
  }

  function showLogin() {
    loginView.hidden = false;
    adminView.hidden = true;
    siteLoaded = false;
    if (usernameEl) usernameEl.value = currentUsername || 'admin';
    setLoginStatus('', false);
    setTimeout(() => passwordEl.focus(), 60);
  }

  function updateAccountLabels() {
    const top = document.getElementById('current-account-top');
    const input = document.getElementById('account-username');
    if (top) top.textContent = currentUsername;
    if (input) input.value = currentUsername;
    try {
      localStorage.setItem('xc-admin-name', currentUsername);
    } catch {
      /* 隐私模式下忽略 */
    }
  }

  function showAdmin(username) {
    if (username) currentUsername = username;
    loginView.hidden = true;
    adminView.hidden = false;
    updateAccountLabels();
    switchPanel('messages');
    loadMessages();
    loadSite();
  }

  async function request(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* 忽略非 JSON 响应 */
    }
    if (res.status === 401 && url !== '/api/admin/login') {
      showLogin();
      throw new Error('登录已过期，请重新登录。');
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || '操作失败');
    }
    return data;
  }

  // ---------- 面板切换 ----------

  function switchPanel(name) {
    adminTabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.panel === name));
    panels.forEach((panel) => {
      panel.hidden = panel.id !== `panel-${name}`;
    });
  }

  adminTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
  });

  // ---------- 留言管理 ----------

  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function miniButton(text, variant, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-mini';
    if (variant) btn.classList.add(variant);
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderItem(message) {
    const item = document.createElement('article');
    item.className = 'admin-item';

    const meta = document.createElement('div');
    meta.className = 'admin-meta';

    const name = document.createElement('span');
    name.className = 'admin-name';
    name.textContent = message.nickname;
    meta.append(name);

    const badge = document.createElement('span');
    badge.className = `badge badge-${message.status}`;
    badge.textContent = STATUS_LABEL[message.status] || message.status;
    meta.append(badge);

    const time = document.createElement('time');
    time.textContent = formatDateTime(message.createdAt);
    meta.append(time);

    if (message.email) {
      const email = document.createElement('span');
      email.className = 'admin-email';
      const link = document.createElement('a');
      link.href = `mailto:${message.email}`;
      link.textContent = message.email;
      email.append(link);
      meta.append(email);
    }

    if (message.website) {
      const site = document.createElement('a');
      site.className = 'admin-link';
      site.href = message.website;
      site.target = '_blank';
      site.rel = 'noopener nofollow';
      site.textContent = message.website;
      meta.append(site);
    }

    const content = document.createElement('p');
    content.className = 'admin-content';
    content.textContent = message.content;

    item.append(meta, content);

    if (message.reply) {
      const reply = document.createElement('div');
      reply.className = 'admin-reply';
      reply.textContent = `站长回复：${message.reply}`;
      item.append(reply);
    }

    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    if (message.status !== 'approved') {
      actions.append(miniButton('通过', 'is-primary', () => updateStatus(message.id, 'approved')));
    }
    if (message.status !== 'rejected') {
      actions.append(miniButton('拒绝', '', () => updateStatus(message.id, 'rejected')));
    }
    if (message.status !== 'pending') {
      actions.append(miniButton('退回待审核', '', () => updateStatus(message.id, 'pending')));
    }
    actions.append(miniButton('回复', '', () => toggleReplyEditor(item, message)));
    actions.append(miniButton('删除', 'is-danger', () => removeMessage(message)));
    item.append(actions);

    return item;
  }

  async function updateStatus(id, status) {
    try {
      await request(`/api/admin/messages/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      toast(status === 'approved' ? '已通过，留言已展示' : status === 'rejected' ? '已拒绝' : '已退回待审核');
      await loadMessages();
    } catch (error) {
      toast(error.message);
    }
  }

  function askConfirm(text) {
    return new Promise((resolve) => {
      if (!confirmModal || !confirmOk || !confirmCancel) {
        resolve(window.confirm(text));
        return;
      }

      confirmText.textContent = text;
      confirmModal.hidden = false;

      const backdrop = confirmModal.querySelector('[data-modal-close]');
      const close = (result) => {
        confirmModal.hidden = true;
        confirmOk.removeEventListener('click', onOk);
        confirmCancel.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onKey = (event) => {
        if (event.key === 'Escape') close(false);
      };

      confirmOk.addEventListener('click', onOk);
      confirmCancel.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      setTimeout(() => confirmCancel.focus(), 50);
    });
  }

  async function removeMessage(message) {
    const confirmed = await askConfirm(`确定删除「${message.nickname}」的这条留言吗？`);
    if (!confirmed) return;
    try {
      await request(`/api/admin/messages/${message.id}`, { method: 'DELETE' });
      toast('已删除');
      await loadMessages();
    } catch (error) {
      toast(error.message);
    }
  }

  function toggleReplyEditor(item, message) {
    const existing = item.querySelector('.reply-editor');
    if (existing) {
      existing.remove();
      return;
    }

    const editor = document.createElement('div');
    editor.className = 'reply-editor';

    const textarea = document.createElement('textarea');
    textarea.maxLength = 500;
    textarea.placeholder = '写下回复，会显示在这条留言下方';
    textarea.value = message.reply || '';

    const actions = document.createElement('div');
    actions.className = 'reply-editor-actions';

    const save = miniButton('保存回复', 'is-primary', async () => {
      save.disabled = true;
      try {
        await request(`/api/admin/messages/${message.id}/reply`, {
          method: 'POST',
          body: JSON.stringify({ reply: textarea.value }),
        });
        toast('回复已保存');
        await loadMessages();
      } catch (error) {
        toast(error.message);
        save.disabled = false;
      }
    });
    const cancel = miniButton('取消', '', () => editor.remove());

    actions.append(save, cancel);
    editor.append(textarea, actions);
    item.append(editor);
    textarea.focus();
  }

  async function loadMessages() {
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    try {
      const query = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : '';
      const data = await request(`/api/admin/messages${query}`);
      const counts = data.counts || {};
      Object.keys(countEls).forEach((key) => {
        if (countEls[key]) countEls[key].textContent = String(counts[key] ?? 0);
      });
      if (tabPending) tabPending.textContent = String(counts.pending ?? 0);
      const items = data.items || [];
      items.forEach((message) => listEl.append(renderItem(message)));
      emptyEl.hidden = items.length !== 0;
    } catch (error) {
      toast(error.message);
    }
  }

  // ---------- 站点设置 ----------

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function iconSelect(current) {
    const select = document.createElement('select');
    select.dataset.field = 'icon';
    iconOptions.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.key;
      item.textContent = option.label;
      select.append(item);
    });
    select.value = iconOptions.some((option) => option.key === current) ? current : 'link';
    return select;
  }

  function socialRow(link = {}) {
    const row = document.createElement('div');
    row.className = 'social-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.maxLength = 20;
    labelInput.placeholder = '名称';
    labelInput.dataset.field = 'label';
    labelInput.setAttribute('aria-label', '名称');
    labelInput.value = link.label || '';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.maxLength = 300;
    urlInput.placeholder = 'https://… 或 mailto:…';
    urlInput.dataset.field = 'url';
    urlInput.setAttribute('aria-label', '链接');
    urlInput.value = link.url || '';

    const select = iconSelect(link.icon);
    select.setAttribute('aria-label', '图标');

    const actions = document.createElement('div');
    actions.className = 'social-row-actions';

    const up = miniButton('↑', 'social-move', () => {
      const prev = row.previousElementSibling;
      if (prev) socialList.insertBefore(row, prev);
    });
    const down = miniButton('↓', 'social-move', () => {
      const next = row.nextElementSibling;
      if (next) socialList.insertBefore(next, row);
    });
    const remove = miniButton('✕', 'social-remove', () => row.remove());
    up.setAttribute('aria-label', '上移');
    up.title = '上移';
    down.setAttribute('aria-label', '下移');
    down.title = '下移';
    remove.setAttribute('aria-label', '删除这条链接');
    remove.title = '删除';
    actions.append(up, down, remove);

    const wrap = (control) => {
      const field = document.createElement('div');
      field.className = 'field';
      field.append(control);
      return field;
    };

    row.append(wrap(labelInput), wrap(urlInput), wrap(select), actions);
    return row;
  }

  function renderSocialLinks(links) {
    socialList.innerHTML = '';
    (links || []).forEach((link) => socialList.append(socialRow(link)));
  }

  function collectSocialLinks() {
    return Array.from(socialList.querySelectorAll('.social-row'))
      .map((row) => ({
        label: row.querySelector('[data-field="label"]').value.trim(),
        url: row.querySelector('[data-field="url"]').value.trim(),
        icon: row.querySelector('[data-field="icon"]').value,
      }))
      .filter((link) => link.label || link.url);
  }

  function fillSiteForm(site) {
    document.getElementById('site-nickname').value = site.nickname || '';
    document.getElementById('site-signature').value = site.signature || '';
    document.getElementById('site-icp').value = site.icp || '';
    document.getElementById('about-kicker').value = site.about.kicker || '';
    document.getElementById('about-title').value = site.about.title || '';
    document.getElementById('about-desc').value = site.about.desc || '';
    document.getElementById('about-paragraphs').value = (site.about.paragraphs || []).join('\n\n');
    renderSocialLinks(site.socialLinks);

    const version = Date.parse(site.updatedAt) || Date.now();
    avatarPreview.src = `${site.avatar}?v=${version}`;
  }

  function fillMailForm(mail) {
    document.getElementById('mail-enabled').checked = Boolean(mail.enabled);
    document.getElementById('mail-host').value = mail.host || '';
    document.getElementById('mail-port').value = mail.port || 465;
    document.getElementById('mail-secure').checked = Boolean(mail.secure);
    document.getElementById('mail-user').value = mail.user || '';
    document.getElementById('mail-pass').value = mail.pass || '';
    document.getElementById('mail-from').value = mail.from || '';
    document.getElementById('mail-to').value = mail.to || '';
  }

  function collectMail() {
    return {
      enabled: document.getElementById('mail-enabled').checked,
      host: valueOf('mail-host'),
      port: Number(document.getElementById('mail-port').value) || 465,
      secure: document.getElementById('mail-secure').checked,
      user: valueOf('mail-user'),
      pass: document.getElementById('mail-pass').value,
      from: valueOf('mail-from'),
      to: valueOf('mail-to'),
    };
  }

  async function loadSite() {
    if (siteLoaded) return;
    try {
      const data = await request('/api/admin/site');
      iconOptions = data.iconOptions || [];
      fillSiteForm(data.site);
      fillMailForm(data.site.mail);
      siteLoaded = true;
    } catch (error) {
      toast(error.message);
    }
  }

  siteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = siteForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(siteStatus, '', false);
    try {
      const payload = {
        nickname: valueOf('site-nickname'),
        signature: valueOf('site-signature'),
        icp: valueOf('site-icp'),
        about: {
          kicker: valueOf('about-kicker'),
          title: valueOf('about-title'),
          desc: valueOf('about-desc'),
          paragraphs: document.getElementById('about-paragraphs').value,
        },
        socialLinks: collectSocialLinks(),
      };
      const data = await request('/api/admin/site', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      siteLoaded = false;
      await loadSite();
      setStatus(siteStatus, '已保存，刷新前台页面即可看到更新。', false);
      toast('站点设置已保存');
    } catch (error) {
      setStatus(siteStatus, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  socialAdd.addEventListener('click', () => {
    const row = socialRow({ icon: 'link' });
    socialList.append(row);
    row.querySelector('[data-field="label"]').focus();
  });

  // 头像上传：在浏览器里裁成正方形并压缩，再发给服务端
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };
      image.src = url;
    });
  }

  function squareCanvas(image, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const side = Math.min(image.width, image.height);
    const sx = (image.width - side) / 2;
    const sy = (image.height - side) / 2;
    context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
    return canvas;
  }

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus(avatarStatus, '请选择图片文件。', true);
      return;
    }
    setStatus(avatarStatus, '正在处理图片…', false);
    try {
      const image = await loadImage(file);
      const payload = {
        avatar: squareCanvas(image, 480).toDataURL('image/jpeg', 0.88),
        favicon: squareCanvas(image, 64).toDataURL('image/png'),
        touch: squareCanvas(image, 180).toDataURL('image/png'),
      };
      const data = await request('/api/admin/avatar', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const version = Date.parse(data.updatedAt) || Date.now();
      avatarPreview.src = `${data.avatar}?v=${version}`;
      setStatus(avatarStatus, '头像已更新。', false);
      toast('头像已更新');
    } catch (error) {
      setStatus(avatarStatus, error.message, true);
    }
  });

  // ---------- 邮件通知 ----------

  mailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = mailForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(mailStatus, '', false);
    try {
      await request('/api/admin/site', {
        method: 'PUT',
        body: JSON.stringify({ mail: collectMail() }),
      });
      setStatus(mailStatus, '邮件设置已保存。', false);
      toast('邮件设置已保存');
    } catch (error) {
      setStatus(mailStatus, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  mailTest.addEventListener('click', async () => {
    mailTest.disabled = true;
    const original = mailTest.textContent;
    mailTest.textContent = '发送中…';
    setStatus(mailStatus, '', false);
    try {
      await request('/api/admin/mail/test', {
        method: 'POST',
        body: JSON.stringify({ mail: collectMail() }),
      });
      setStatus(mailStatus, '测试邮件已发送，请查收（可能在垃圾箱）。', false);
    } catch (error) {
      setStatus(mailStatus, error.message, true);
    } finally {
      mailTest.disabled = false;
      mailTest.textContent = original;
    }
  });

  // ---------- 账号安全 ----------

  const accountForm = document.getElementById('account-form');
  const accountStatus = document.getElementById('account-status');

  if (accountForm) {
    accountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.getElementById('account-username').value.trim();
      const currentPassword = document.getElementById('account-current-password').value;
      const newPassword = document.getElementById('account-new-password').value;
      const confirmPassword = document.getElementById('account-confirm-password').value;

      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
        setStatus(accountStatus, '账号需要 3 到 24 位，只能使用字母、数字、下划线、点或短横线。', true);
        return;
      }
      if (newPassword) {
        if (newPassword.length < 8) {
          setStatus(accountStatus, '新密码至少需要 8 位。', true);
          return;
        }
        if (newPassword !== confirmPassword) {
          setStatus(accountStatus, '两次输入的新密码不一致。', true);
          return;
        }
        if (newPassword === currentPassword) {
          setStatus(accountStatus, '新密码不能和当前密码相同。', true);
          return;
        }
      }

      const button = accountForm.querySelector('button[type="submit"]');
      button.disabled = true;
      setStatus(accountStatus, '', false);
      try {
        const data = await request('/api/admin/account', {
          method: 'POST',
          body: JSON.stringify({ username, currentPassword, newPassword }),
        });
        currentUsername = data.username || username;
        updateAccountLabels();
        document.getElementById('account-current-password').value = '';
        document.getElementById('account-new-password').value = '';
        document.getElementById('account-confirm-password').value = '';
        setStatus(accountStatus, '账号设置已保存，下次登录请使用新账号和密码。', false);
        toast('账号设置已保存');
      } catch (error) {
        setStatus(accountStatus, error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }

  // ---------- 登录 / 退出 ----------

  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.classList.toggle('is-visible', show);
      button.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    });
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    setLoginStatus('', false);
    const username = usernameEl ? usernameEl.value.trim() : '';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: passwordEl.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || '登录失败');
      currentUsername = data.username || username;
      passwordEl.value = '';
      showAdmin(currentUsername);
    } catch (error) {
      setLoginStatus(error.message || '登录失败', true);
    } finally {
      btn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      /* 忽略 */
    }
    showLogin();
    toast('已退出登录');
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.toggle('is-active', item === tab));
      currentStatus = tab.dataset.status || '';
      loadMessages();
    });
  });

  (async () => {
    try {
      const res = await fetch('/api/admin/session');
      const data = await res.json();
      if (data.authenticated) {
        currentUsername = data.username || 'admin';
        showAdmin(currentUsername);
      } else {
        try {
          const saved = localStorage.getItem('xc-admin-name');
          if (saved) currentUsername = saved;
        } catch {
          /* 忽略 */
        }
        showLogin();
      }
    } catch {
      showLogin();
    }
  })();
})();
