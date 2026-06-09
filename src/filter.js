'use strict';

function matchesKeywords(content, keywords) {
  if (!content || !keywords.length) return false;
  const lower = content.toLowerCase();
  return keywords.some((k) => k && lower.includes(k));
}

// Decide whether a normalized message should be forwarded to Telegram.
function shouldForward(msg, config) {
  if (config.ignoreSelf && msg.author.isSelf) return false;
  if (config.ignoreBots && msg.author.isBot) return false;

  const isDm = !msg.guild;
  if (isDm && !config.includeDms) return false;

  // A channel can always be muted explicitly (works for guild channels and DMs).
  if (config.ignoreChannels.includes(msg.channel.id)) return false;

  if (!isDm) {
    if (config.watchGuilds.length && !config.watchGuilds.includes(msg.guild.id)) return false;
    // Empty watchChannels == listen to every visible channel.
    if (config.watchChannels.length && !config.watchChannels.includes(msg.channel.id)) return false;
  }

  switch (config.forwardMode) {
    case 'mentions':
      // Everything in a DM is directed at you, so treat it as a mention.
      return isDm ? true : Boolean(msg.mentionsSelf);
    case 'keywords':
      return matchesKeywords(msg.content, config.keywords);
    case 'all':
    default:
      return true;
  }
}

module.exports = { shouldForward, matchesKeywords };
