'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { shouldForward, matchesKeywords } = require('../src/filter');
const { formatMessage, escapeHtml, truncate, messageUrl } = require('../src/format');
const { loadConfig, validateConfig, parseList, parseBool } = require('../src/config');
const { stripHtml } = require('../src/telegram');

function baseConfig(over = {}) {
  return {
    forwardMode: 'all',
    watchChannels: [],
    watchGuilds: [],
    ignoreChannels: [],
    keywords: [],
    ignoreBots: false,
    ignoreSelf: true,
    includeDms: true,
    ...over,
  };
}

function msg(over = {}) {
  return {
    id: '100',
    content: 'hello world',
    author: { id: 'u1', name: 'Alice', isBot: false, isSelf: false },
    channel: { id: 'c1', name: 'general', type: 'guild' },
    guild: { id: 'g1', name: 'My Server' },
    mentionsSelf: false,
    attachments: [],
    url: 'https://discord.com/channels/g1/c1/100',
    ...over,
  };
}

// ---------- filter ----------

test('forwards all guild messages by default', () => {
  assert.equal(shouldForward(msg(), baseConfig()), true);
});

test('drops own messages when ignoreSelf is on', () => {
  const m = msg({ author: { id: 'me', name: 'Me', isSelf: true } });
  assert.equal(shouldForward(m, baseConfig()), false);
});

test('drops bot messages when ignoreBots is on', () => {
  const m = msg({ author: { id: 'b1', name: 'Bot', isBot: true } });
  assert.equal(shouldForward(m, baseConfig({ ignoreBots: true })), false);
  assert.equal(shouldForward(m, baseConfig({ ignoreBots: false })), true);
});

test('channel allowlist limits forwarding', () => {
  const cfg = baseConfig({ watchChannels: ['c1'] });
  assert.equal(shouldForward(msg({ channel: { id: 'c1', name: 'a' } }), cfg), true);
  assert.equal(shouldForward(msg({ channel: { id: 'c2', name: 'b' } }), cfg), false);
});

test('guild allowlist limits forwarding', () => {
  const cfg = baseConfig({ watchGuilds: ['g1'] });
  assert.equal(shouldForward(msg({ guild: { id: 'g1', name: 'x' } }), cfg), true);
  assert.equal(shouldForward(msg({ guild: { id: 'g2', name: 'y' } }), cfg), false);
});

test('ignoreChannels mutes a channel', () => {
  const cfg = baseConfig({ ignoreChannels: ['c1'] });
  assert.equal(shouldForward(msg(), cfg), false);
});

test('mentions mode only forwards direct mentions', () => {
  const cfg = baseConfig({ forwardMode: 'mentions' });
  assert.equal(shouldForward(msg({ mentionsSelf: false }), cfg), false);
  assert.equal(shouldForward(msg({ mentionsSelf: true }), cfg), true);
});

test('mentions mode always forwards DMs', () => {
  const cfg = baseConfig({ forwardMode: 'mentions' });
  const dm = msg({ guild: null, mentionsSelf: false });
  assert.equal(shouldForward(dm, cfg), true);
});

test('keywords mode matches on substrings, case-insensitive', () => {
  const cfg = baseConfig({ forwardMode: 'keywords', keywords: ['deploy', 'urgent'] });
  assert.equal(shouldForward(msg({ content: 'Please DEPLOY now' }), cfg), true);
  assert.equal(shouldForward(msg({ content: 'nothing here' }), cfg), false);
});

test('DMs can be excluded with includeDms=false', () => {
  const dm = msg({ guild: null });
  assert.equal(shouldForward(dm, baseConfig({ includeDms: false })), false);
  assert.equal(shouldForward(dm, baseConfig({ includeDms: true })), true);
});

test('matchesKeywords handles empty input', () => {
  assert.equal(matchesKeywords('', ['a']), false);
  assert.equal(matchesKeywords('abc', []), false);
});

// ---------- format ----------

test('escapeHtml escapes special characters', () => {
  assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('truncate adds an ellipsis when over the limit', () => {
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 10), 'abc');
});

test('messageUrl uses @me for DMs', () => {
  assert.equal(messageUrl(null, 'c1', 'm1'), 'https://discord.com/channels/@me/c1/m1');
  assert.equal(messageUrl('g1', 'c1', 'm1'), 'https://discord.com/channels/g1/c1/m1');
});

test('formatMessage includes server, channel, author, content and link', () => {
  const out = formatMessage(msg({ content: 'hi there' }));
  assert.match(out, /My Server/);
  assert.match(out, /#general/);
  assert.match(out, /Alice/);
  assert.match(out, /hi there/);
  assert.match(out, /Відкрити в Discord/);
});

test('formatMessage escapes user content (no HTML injection)', () => {
  const out = formatMessage(msg({ content: '<script>alert(1)</script>' }));
  assert.ok(!out.includes('<script>'));
  assert.match(out, /&lt;script&gt;/);
});

test('formatMessage handles empty content with attachments', () => {
  const out = formatMessage(msg({ content: '', attachments: [{ name: 'pic.png', url: 'https://x/y.png' }] }));
  assert.match(out, /pic\.png/);
});

test('formatMessage shows placeholder for empty messages', () => {
  const out = formatMessage(msg({ content: '', attachments: [] }));
  assert.match(out, /embed/);
});

// ---------- telegram helper ----------

test('stripHtml removes tags and unescapes entities', () => {
  assert.equal(stripHtml('<b>hi</b> &amp; bye'), 'hi & bye');
});

// ---------- config ----------

test('parseList splits and trims CSV', () => {
  assert.deepEqual(parseList(' a, b ,c, '), ['a', 'b', 'c']);
  assert.deepEqual(parseList(''), []);
});

test('parseBool understands common truthy/falsy values', () => {
  assert.equal(parseBool('true', false), true);
  assert.equal(parseBool('no', true), false);
  assert.equal(parseBool('', true), true);
  assert.equal(parseBool(undefined, false), false);
});

test('validateConfig flags missing required fields', () => {
  const cfg = loadConfig({});
  const errors = validateConfig(cfg);
  assert.ok(errors.some((e) => e.includes('DISCORD_TOKEN')));
  assert.ok(errors.some((e) => e.includes('TELEGRAM_BOT_TOKEN')));
  assert.ok(errors.some((e) => e.includes('TELEGRAM_CHAT_ID')));
});

test('validateConfig requires keywords in keywords mode', () => {
  const cfg = loadConfig({
    DISCORD_TOKEN: 'x',
    TELEGRAM_BOT_TOKEN: 'y',
    TELEGRAM_CHAT_ID: 'z',
    FORWARD_MODE: 'keywords',
  });
  const errors = validateConfig(cfg);
  assert.ok(errors.some((e) => e.includes('KEYWORDS')));
});

test('loadConfig applies defaults', () => {
  const cfg = loadConfig({ DISCORD_TOKEN: 'x', TELEGRAM_BOT_TOKEN: 'y', TELEGRAM_CHAT_ID: 'z' });
  assert.equal(cfg.forwardMode, 'all');
  assert.equal(cfg.ignoreSelf, true);
  assert.equal(cfg.includeDms, true);
  assert.deepEqual(validateConfig(cfg), []);
});
