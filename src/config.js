'use strict';

require('dotenv').config({ quiet: true });

const VALID_MODES = ['all', 'mentions', 'keywords'];

function parseList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function loadConfig(env = process.env) {
  return {
    discordToken: env.DISCORD_TOKEN || '',
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    forwardMode: (env.FORWARD_MODE || 'all').toLowerCase(),
    watchChannels: parseList(env.WATCH_CHANNELS),
    watchGuilds: parseList(env.WATCH_GUILDS),
    ignoreChannels: parseList(env.IGNORE_CHANNELS),
    keywords: parseList(env.KEYWORDS).map((k) => k.toLowerCase()),
    ignoreBots: parseBool(env.IGNORE_BOTS, false),
    ignoreSelf: parseBool(env.IGNORE_SELF, true),
    includeDms: parseBool(env.INCLUDE_DMS, true),
    startupPing: parseBool(env.STARTUP_PING, true),
  };
}

function validateConfig(config) {
  const errors = [];
  if (!config.discordToken) errors.push('DISCORD_TOKEN is required');
  if (!config.telegramBotToken) errors.push('TELEGRAM_BOT_TOKEN is required');
  if (!config.telegramChatId) errors.push('TELEGRAM_CHAT_ID is required');
  if (!VALID_MODES.includes(config.forwardMode)) {
    errors.push(`FORWARD_MODE must be one of: ${VALID_MODES.join(', ')}`);
  }
  if (config.forwardMode === 'keywords' && config.keywords.length === 0) {
    errors.push('KEYWORDS must be set when FORWARD_MODE=keywords');
  }
  return errors;
}

module.exports = { loadConfig, validateConfig, parseList, parseBool, VALID_MODES };
