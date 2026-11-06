(function () {
  'use strict';

  const form = document.getElementById('guestbook-form');
  if (!form) return;

  const messagesEl = document.getElementById('messages');
  const emptyEl = document.getElementById('messages-empty');
  const countEl = document.getElementById('message-count');
  const loadMoreBtn = document.getElementById('load-more');
  const statusEl = document.getElementById('form-status');
  const submitBtn = form.querySelector('button[type="submit"]');
  const contentEl = form.querySelector('[name="content"]');
  const charCountEl = document.getElementById('char-count');
  const toastEl = document.getElementById('toast');
  const noticeEl = document.getElementById('submit-notice');

  const state = { page: 1, pages: 1, total: 0, loading: false };

  let toastTimer = null;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  function likedKey(id) {
    return `xc_liked_${id}`;
  }

  function hasLiked(id) {
    try {
      return localStorage.getItem(likedKey(id)) === '1';
    } catch {
      return false;
    }
  }

  function markLiked(id) {
    try {
      localStorage.setItem(likedKey(id), '1');
    } catch {
      /* 无痕模式等场景下忽略 */
    }
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }

  function initialOf(name) {
    const trimmed = (name || '').trim();
    return trimmed ? Array.from(trimmed)[0] : '客';
  }

  function buildFallbackAvatar(name) {
    const span = document.createElement('span');
    span.className = 'message-avatar-fallback';
    span.textContent = initialOf(name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function buildAvatar(message) {
    if (!message.avatar) return buildFallbackAvatar(message.nickname);
    const img = document.createElement('img');
    img.className = 'message-avatar';
    img.src = message.avatar;
    img.alt = `${message.nickname} 的头像`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(buildFallbackAvatar(message.nickname)));
    return img;
  }

  async function handleLike(id, btn, countEl) {
    if (btn.disabled) return;
    if (hasLiked(id)) {
      toast('已经点过赞啦');
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(id)}/like`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '点赞失败');
      countEl.textContent = String(data.likes);
      btn.classList.add('is-liked');
      btn.setAttribute('aria-label', `已点赞，当前 ${data.likes} 个赞`);
      markLiked(id);
    } catch (error) {
      toast(error.message || '点赞失败，请稍后再试');
    } finally {
      btn.disabled = false;
    }
  }

  function likeButton(message) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'like-btn';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S4 15.4 4 9.9C4 6.9 6.2 5 8.8 5c1.6 0 2.7.8 3.2 1.7C12.5 5.8 13.6 5 15.2 5 17.8 5 20 6.9 20 9.9c0 5.5-8 10.6-8 10.6Z"/></svg>';
    const count = document.createElement('span');
    count.textContent = String(message.likes || 0);
    btn.append(count);
    if (hasLiked(message.id)) btn.classList.add('is-liked');
    btn.setAttribute('aria-label', `点赞，当前 ${message.likes || 0} 个赞`);
    btn.addEventListener('click', () => handleLike(message.id, btn, count));
    return btn;
  }

  function renderMessage(message) {
    const article = document.createElement('article');
    article.className = 'message';

    const main = document.createElement('div');
    main.className = 'message-main';

    const head = document.createElement('div');
    head.className = 'message-head';

    const name = document.createElement('span');
    name.className = 'message-name';
    name.textContent = message.nickname;
    head.append(name);

    if (message.website) {
      const site = document.createElement('a');
      site.className = 'message-site';
      site.href = message.website;
      site.target = '_blank';
      site.rel = 'noopener nofollow';
      site.textContent = '他的网站 ↗';
      head.append(site);
    }

    const time = document.createElement('time');
    time.className = 'message-time';
    time.dateTime = message.createdAt;
    time.textContent = formatDate(message.createdAt);
    head.append(time);

    const content = document.createElement('p');
    content.className = 'message-content';
    content.textContent = message.content;

    main.append(head, content);

    if (message.reply) {
      const reply = document.createElement('div');
      reply.className = 'message-reply';
      const label = document.createElement('span');
      label.className = 'reply-label';
      label.textContent = '站长回复';
      const text = document.createElement('p');
      text.textContent = message.reply;
      reply.append(label, text);
      main.append(reply);
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.append(likeButton(message));
    main.append(actions);

    article.append(buildAvatar(message), main);
    return article;
  }

  async function loadMessages(reset) {
    if (state.loading) return;
    state.loading = true;

    if (reset) {
      state.page = 1;
      messagesEl.innerHTML = '';
    }

    loadMoreBtn.disabled = true;
    try {
      const res = await fetch(`/api/messages?page=${state.page}&limit=10`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '留言加载失败');

      state.pages = data.pages || 1;
      state.total = data.total || 0;
      (data.items || []).forEach((message) => messagesEl.append(renderMessage(message)));
      countEl.textContent = state.total > 0 ? `共 ${state.total} 条` : '';
      emptyEl.hidden = state.total !== 0;
      state.page = (data.page || 1) + 1;
      loadMoreBtn.hidden = state.page > state.pages;
    } catch (error) {
      toast(error.message || '留言加载失败，请稍后再试');
    } finally {
      state.loading = false;
      loadMoreBtn.disabled = false;
    }
  }

  function updateCount() {
    charCountEl.textContent = `${contentEl.value.length} / 500`;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      nickname: String(formData.get('nickname') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      website: String(formData.get('website') || '').trim(),
      content: String(formData.get('content') || '').trim(),
      extra: String(formData.get('extra') || ''),
    };

    if (!payload.nickname) return setStatus('请填写昵称。', true);
    if (payload.content.length < 2) return setStatus('留言内容太短了。', true);

    if (noticeEl) noticeEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中…';
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '提交失败');
      form.reset();
      updateCount();
      setStatus('', false);
      if (noticeEl) {
        noticeEl.hidden = false;
        noticeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toast('留言已提交，等待审核');
    } catch (error) {
      setStatus(error.message || '提交失败，请稍后再试。', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '提交留言';
    }
  });

  document.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji || '';
      const start = contentEl.selectionStart ?? contentEl.value.length;
      const end = contentEl.selectionEnd ?? contentEl.value.length;
      contentEl.value = contentEl.value.slice(0, start) + emoji + contentEl.value.slice(end);
      const cursor = start + emoji.length;
      contentEl.focus();
      contentEl.setSelectionRange(cursor, cursor);
      updateCount();
    });
  });

  contentEl.addEventListener('input', updateCount);
  loadMoreBtn.addEventListener('click', () => loadMessages(false));

  updateCount();
  loadMessages(true);
})();
