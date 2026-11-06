'use strict';

const nodemailer = require('nodemailer');

const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',Arial,sans-serif";
const FONT_SERIF = "Georgia,'Songti SC','STSong','SimSun',serif";

function createTransport(mail) {
  return nodemailer.createTransport({
    host: mail.host,
    port: Number(mail.port) || 465,
    secure: Boolean(mail.secure),
    auth: mail.user
      ? {
          user: mail.user,
          pass: mail.pass,
        }
      : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
  });
}

function fromAddress(mail) {
  return mail.from || mail.user || '';
}

function assertUsable(mail) {
  if (!mail || !mail.host) throw new Error('请先填写 SMTP 服务器地址');
  if (!mail.to) throw new Error('请先填写收件邮箱');
  if (!fromAddress(mail)) throw new Error('请填写发件邮箱或 SMTP 账号');
}

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

/** 所有邮件共用的暖色卡片外壳，使用表格布局兼容 QQ 邮箱 / 手机客户端 */
function shell({ nickname = '小川', kicker, title, intro, body, footer, origin }) {
  const brand = escapeHtml(nickname);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f1e8;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f1e8;">${escapeHtml(intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f1e8">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#fffdf8;border:1px solid #e4dacb;border-radius:18px;overflow:hidden;">
          <tr>
            <td height="4" bgcolor="#b96a45" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:34px 40px 26px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT_SERIF};font-size:22px;font-weight:600;color:#2b2620;">${brand}<span style="color:#b96a45;">.</span></td>
                  <td align="right" style="font-family:${FONT_SANS};font-size:10px;letter-spacing:2px;color:#8a8074;text-transform:uppercase;">${escapeHtml(kicker)}</td>
                </tr>
              </table>
              <div style="height:1px;background-color:#e4dacb;margin:20px 0 28px 0;font-size:0;line-height:0;">&nbsp;</div>
              <h1 style="margin:0 0 12px 0;font-family:${FONT_SERIF};font-size:25px;line-height:1.35;font-weight:600;color:#2b2620;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 26px 0;font-family:${FONT_SANS};font-size:14.5px;line-height:1.9;color:#4c443b;">${escapeHtml(intro)}</p>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 40px 28px 40px;border-top:1px solid #e4dacb;background-color:#fbf8f2;">
              <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.8;color:#8a8074;">${escapeHtml(footer)}</p>
              ${origin ? `<p style="margin:6px 0 0 0;font-family:${FONT_SANS};font-size:11px;color:#a39a8e;">${escapeHtml(origin)}</p>` : ''}
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0 0;font-family:${FONT_SANS};font-size:11px;color:#a39a8e;">© ${new Date().getFullYear()} ${brand} · 保持简单，保持真诚</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function metaRow(label, value) {
  return `<tr>
    <td width="60" valign="top" style="padding:7px 0;font-family:${FONT_SANS};font-size:11.5px;letter-spacing:1px;color:#8a8074;">${escapeHtml(label)}</td>
    <td valign="top" style="padding:7px 0;font-family:${FONT_SANS};font-size:14.5px;line-height:1.8;color:#2b2620;word-break:break-all;">${value}</td>
  </tr>`;
}

function quoteBlock(label, text) {
  return `<p style="margin:24px 0 8px 0;font-family:${FONT_SANS};font-size:11.5px;letter-spacing:1px;color:#8a8074;">${escapeHtml(label)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
    <tr>
      <td bgcolor="#f6f1e8" style="padding:18px 20px;background-color:#f6f1e8;border-left:3px solid #b96a45;border-radius:0 10px 10px 0;font-family:${FONT_SANS};font-size:15px;line-height:1.9;color:#4c443b;white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</td>
    </tr>
  </table>`;
}

function ctaButton(origin, text) {
  if (!origin) return '';
  const url = `${origin}/admin`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;">
    <tr>
      <td bgcolor="#b96a45" style="border-radius:999px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 30px;font-family:${FONT_SANS};font-size:14px;font-weight:600;color:#fffdf8;text-decoration:none;">${escapeHtml(text)} →</a>
      </td>
    </tr>
  </table>
  <p style="margin:0;font-family:${FONT_SANS};font-size:11.5px;line-height:1.8;color:#8a8074;">如果按钮无法点击，请复制链接：<br><a href="${escapeHtml(url)}" style="color:#b96a45;text-decoration:none;word-break:break-all;">${escapeHtml(url)}</a></p>`;
}

function buildNotificationEmail(site = {}, message = {}, origin = '') {
  const nickname = site.nickname || '小川';
  const subject = `【留言板】新留言待审核：${message.nickname}`;
  const rows = [metaRow('昵称', escapeHtml(message.nickname))];
  if (message.email) {
    rows.push(
      metaRow(
        '邮箱',
        `<a href="mailto:${escapeHtml(message.email)}" style="color:#b96a45;text-decoration:none;">${escapeHtml(message.email)}</a>`
      )
    );
  }
  if (message.website) {
    rows.push(
      metaRow(
        '网站',
        `<a href="${escapeHtml(message.website)}" target="_blank" style="color:#b96a45;text-decoration:none;">${escapeHtml(message.website)}</a>`
      )
    );
  }

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">${rows.join('')}</table>
    ${quoteBlock('留言内容', message.content)}
    ${ctaButton(origin, '去后台审核')}
  `;

  const text = [
    '收到一条新的留言，需要你审核。',
    '',
    `昵称：${message.nickname}`,
    message.email ? `邮箱：${message.email}` : '',
    message.website ? `网站：${message.website}` : '',
    '',
    '留言内容：',
    message.content,
    '',
    origin ? `去后台审核：${origin}/admin` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = shell({
    nickname,
    kicker: 'New Message',
    title: '收到一条新留言',
    intro: '访客刚刚在你的留言板留下了一条新留言。审核通过后，它才会显示在网站上。',
    body,
    footer: `这封邮件由 ${nickname} 的个人主页自动发送。`,
    origin,
  });

  return { subject, text, html };
}

function buildTestEmail(site = {}, origin = '') {
  const nickname = site.nickname || '小川';
  const body = `
    ${quoteBlock('测试状态', '发送成功，邮件通知配置可以正常使用了。')}
    ${ctaButton(origin, '去后台设置')}
  `;
  const text = [
    '邮件通知配置测试成功。',
    '',
    '如果你看到这封邮件，说明 SMTP 配置正常，之后有新留言时会用同样的样式提醒你。',
    '',
    origin ? `后台地址：${origin}/admin` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    subject: '【留言板】测试邮件',
    text,
    html: shell({
      nickname,
      kicker: 'Test Email',
      title: '邮件通知配置成功',
      intro: '如果你看到这封邮件，说明 SMTP 配置正常，之后有新留言时会用同样的样式提醒你。',
      body,
      footer: '这是一封测试邮件，不需要回复。',
      origin,
    }),
  };
}

async function sendTest(mail, site = {}, origin = '') {
  assertUsable(mail);
  const { subject, text, html } = buildTestEmail(site, origin);
  const transport = createTransport(mail);
  await transport.sendMail({
    from: fromAddress(mail),
    to: mail.to,
    subject,
    text,
    html,
  });
}

async function notifyNewMessage(mail, message, origin, site = {}) {
  if (!mail || !mail.enabled || !mail.host || !mail.to) {
    return { skipped: true };
  }
  assertUsable(mail);

  const { subject, text, html } = buildNotificationEmail(site, message, origin);
  const transport = createTransport(mail);
  await transport.sendMail({
    from: fromAddress(mail),
    to: mail.to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

module.exports = { sendTest, notifyNewMessage, buildNotificationEmail, buildTestEmail };
