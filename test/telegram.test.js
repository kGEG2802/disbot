'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { TelegramClient } = require('../src/telegram');

const silentLogger = { info() {}, warn() {}, error() {} };

function fakeRes(status, json) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => json,
    text: async () => JSON.stringify(json),
  };
}

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : undefined });
    const next = responses.shift();
    if (!next) throw new Error('no more mock responses');
    return next;
  };
  return { fetchImpl, calls };
}

test('verify() returns bot info on success', async () => {
  const { fetchImpl } = mockFetch([fakeRes(200, { ok: true, result: { username: 'mybot' } })]);
  const tg = new TelegramClient({ botToken: 't', chatId: '1', fetchImpl, logger: silentLogger });
  const me = await tg.verify();
  assert.equal(me.username, 'mybot');
});

test('send() posts HTML to the correct chat', async () => {
  const { fetchImpl, calls } = mockFetch([fakeRes(200, { ok: true })]);
  const tg = new TelegramClient({ botToken: 't', chatId: '42', fetchImpl, logger: silentLogger, spacingMs: 0 });
  await tg.send('<b>hi</b>');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/bott\/sendMessage$/);
  assert.equal(calls[0].body.chat_id, '42');
  assert.equal(calls[0].body.parse_mode, 'HTML');
  assert.equal(calls[0].body.text, '<b>hi</b>');
});

test('send() retries after a 429 rate limit', async () => {
  const { fetchImpl, calls } = mockFetch([
    fakeRes(429, { ok: false, parameters: { retry_after: 0 } }),
    fakeRes(200, { ok: true }),
  ]);
  const tg = new TelegramClient({ botToken: 't', chatId: '1', fetchImpl, logger: silentLogger, spacingMs: 0 });
  await tg.send('hello');
  assert.equal(calls.length, 2);
});

test('send() falls back to plain text on a parse error', async () => {
  const { fetchImpl, calls } = mockFetch([
    fakeRes(400, { ok: false, description: "Bad Request: can't parse entities" }),
    fakeRes(200, { ok: true }),
  ]);
  const tg = new TelegramClient({ botToken: 't', chatId: '1', fetchImpl, logger: silentLogger, spacingMs: 0 });
  await tg.send('<b>oops');
  assert.equal(calls.length, 2);
  // Second attempt drops parse_mode and strips the tags.
  assert.equal(calls[1].body.parse_mode, undefined);
  assert.equal(calls[1].body.text, 'oops');
});

test('send() serializes messages in order', async () => {
  const { fetchImpl, calls } = mockFetch([fakeRes(200, { ok: true }), fakeRes(200, { ok: true })]);
  const tg = new TelegramClient({ botToken: 't', chatId: '1', fetchImpl, logger: silentLogger, spacingMs: 0 });
  tg.send('first');
  await tg.send('second');
  assert.deepEqual(
    calls.map((c) => c.body.text),
    ['first', 'second']
  );
});
