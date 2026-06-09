'use strict';

const { Client } = require('discord.js-selfbot-v13');
const { shouldForward } = require('./filter');
const { formatMessage, messageUrl } = require('./format');

// Convert a raw discord.js message into the plain shape used by filter/format.
// Kept separate (and pure-ish) so the forwarding logic is easy to test.
function normalize(message, selfId) {
  const guild = message.guild ? { id: message.guild.id, name: message.guild.name } : null;

  const channel = message.channel || {};
  const channelName =
    channel.name ||
    (channel.recipient && channel.recipient.username) ||
    (guild ? 'channel' : 'dm');

  const attachments = message.attachments
    ? [...message.attachments.values()].map((a) => ({ name: a.name, url: a.url }))
    : [];

  let mentionsSelf = false;
  try {
    mentionsSelf =
      Boolean(message.mentions && message.mentions.users && message.mentions.users.has(selfId)) ||
      Boolean(message.mentions && message.mentions.everyone);
    if (!mentionsSelf && message.mentions && message.mentions.repliedUser) {
      mentionsSelf = message.mentions.repliedUser.id === selfId;
    }
  } catch (_) {
    /* mentions are best-effort */
  }

  const author = message.author || {};
  return {
    id: message.id,
    content: message.content || '',
    author: {
      id: author.id,
      name: author.globalName || author.username || 'Unknown',
      isBot: Boolean(author.bot),
      isSelf: author.id === selfId,
    },
    channel: { id: channel.id, name: channelName, type: guild ? 'guild' : 'dm' },
    guild,
    mentionsSelf,
    attachments,
    url: messageUrl(guild && guild.id, channel.id, message.id),
    timestamp: message.createdAt || new Date(),
  };
}

function startDiscord({ config, telegram, logger = console }) {
  const client = new Client({ checkUpdate: false });

  client.on('ready', () => {
    logger.info(`[discord] logged in as ${client.user.username} (${client.user.id})`);
    const scopeCount = config.watchChannels.length ? `${config.watchChannels.length}` : 'ALL';
    logger.info(`[discord] mode=${config.forwardMode}, watching ${scopeCount} channel(s)`);

    if (config.startupPing) {
      const scope = config.watchChannels.length
        ? `${config.watchChannels.length} канал(ів)`
        : 'усі видимі канали';
      telegram.send(
        '✅ <b>disbot запущено</b>\n' +
          `Акаунт: <b>${client.user.username}</b>\n` +
          `Режим: <code>${config.forwardMode}</code>\n` +
          `Слухаю: ${scope}`
      );
    }
  });

  client.on('messageCreate', (message) => {
    try {
      const selfId = client.user && client.user.id;
      const msg = normalize(message, selfId);
      if (!shouldForward(msg, config)) return;
      telegram.send(formatMessage(msg));
      const where = msg.guild ? `${msg.guild.name}#${msg.channel.name}` : 'DM';
      logger.info(`[forward] ${where} <- ${msg.author.name}`);
    } catch (err) {
      logger.error('[discord] handler error:', err.message);
    }
  });

  client.on('error', (err) => logger.error('[discord] client error:', (err && err.message) || err));
  client.on('warn', (info) => logger.warn('[discord] warn:', info));

  client.login(config.discordToken).catch((err) => {
    logger.error('[discord] login failed:', (err && err.message) || err);
    process.exit(1);
  });

  return client;
}

module.exports = { startDiscord, normalize };
