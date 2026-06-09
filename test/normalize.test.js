'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { normalize } = require('../src/discord');

// discord.js Collections extend Map, so Map is a faithful stand-in here.
function guildMessage(over = {}) {
  return {
    id: 'm1',
    content: 'hi',
    author: { id: 'u1', username: 'alice', globalName: 'Alice', bot: false },
    channel: { id: 'c1', name: 'general' },
    guild: { id: 'g1', name: 'My Server' },
    attachments: new Map(),
    mentions: { users: new Map(), everyone: false, repliedUser: null },
    createdAt: new Date(),
    ...over,
  };
}

test('normalize maps a guild message', () => {
  const n = normalize(guildMessage(), 'self');
  assert.equal(n.content, 'hi');
  assert.equal(n.author.name, 'Alice');
  assert.equal(n.author.isSelf, false);
  assert.equal(n.guild.name, 'My Server');
  assert.equal(n.channel.name, 'general');
  assert.equal(n.url, 'https://discord.com/channels/g1/c1/m1');
});

test('normalize flags self-authored messages', () => {
  const n = normalize(guildMessage({ author: { id: 'self', username: 'me' } }), 'self');
  assert.equal(n.author.isSelf, true);
});

test('normalize detects a direct mention', () => {
  const mentions = { users: new Map([['self', {}]]), everyone: false, repliedUser: null };
  const n = normalize(guildMessage({ mentions }), 'self');
  assert.equal(n.mentionsSelf, true);
});

test('normalize treats @everyone as a mention', () => {
  const mentions = { users: new Map(), everyone: true, repliedUser: null };
  const n = normalize(guildMessage({ mentions }), 'self');
  assert.equal(n.mentionsSelf, true);
});

test('normalize detects a reply to self', () => {
  const mentions = { users: new Map(), everyone: false, repliedUser: { id: 'self' } };
  const n = normalize(guildMessage({ mentions }), 'self');
  assert.equal(n.mentionsSelf, true);
});

test('normalize maps a DM (no guild) with @me url', () => {
  const dm = guildMessage({
    guild: null,
    channel: { id: 'd1', recipient: { username: 'bob' } },
  });
  const n = normalize(dm, 'self');
  assert.equal(n.guild, null);
  assert.equal(n.channel.type, 'dm');
  assert.equal(n.channel.name, 'bob');
  assert.equal(n.url, 'https://discord.com/channels/@me/d1/m1');
});

test('normalize collects attachments', () => {
  const attachments = new Map([['a', { name: 'file.png', url: 'https://x/file.png' }]]);
  const n = normalize(guildMessage({ attachments }), 'self');
  assert.deepEqual(n.attachments, [{ name: 'file.png', url: 'https://x/file.png' }]);
});
