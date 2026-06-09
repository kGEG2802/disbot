'use strict';

const MAX_TELEGRAM_LEN = 4096;
const CONTENT_LIMIT = 3500;
const MAX_ATTACHMENTS = 10;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).trimEnd() + '…';
}

// Build a Discord deep link to a message. DMs use the "@me" pseudo-guild.
function messageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId || '@me'}/${channelId}/${messageId}`;
}

// Turn a normalized message into a Telegram HTML payload.
function formatMessage(msg) {
  const lines = [];

  lines.push(
    msg.guild
      ? `📢 <b>${escapeHtml(msg.guild.name)}</b> › #${escapeHtml(msg.channel.name || 'channel')}`
      : '✉️ <b>Direct Message</b>'
  );
  lines.push(`👤 <b>${escapeHtml(msg.author.name || 'Unknown')}</b>`);

  const content = (msg.content || '').trim();
  if (content) {
    lines.push('');
    lines.push(escapeHtml(truncate(content, CONTENT_LIMIT)));
  }

  const attachments = (msg.attachments || []).slice(0, MAX_ATTACHMENTS);
  if (attachments.length) {
    lines.push('');
    for (const att of attachments) {
      lines.push(`📎 <a href="${escapeHtml(att.url)}">${escapeHtml(att.name || 'attachment')}</a>`);
    }
  }

  if (!content && !attachments.length) {
    lines.push('');
    lines.push('<i>[повідомлення без тексту — embed/стікер/реакція]</i>');
  }

  if (msg.url) {
    lines.push('');
    lines.push(`🔗 <a href="${escapeHtml(msg.url)}">Відкрити в Discord</a>`);
  }

  return truncate(lines.join('\n'), MAX_TELEGRAM_LEN);
}

module.exports = {
  formatMessage,
  escapeHtml,
  truncate,
  messageUrl,
  MAX_TELEGRAM_LEN,
  CONTENT_LIMIT,
};
