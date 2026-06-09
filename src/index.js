'use strict';

const { loadConfig, validateConfig } = require('./config');
const { TelegramClient } = require('./telegram');
const { startDiscord } = require('./discord');

async function main() {
  const config = loadConfig();

  const errors = validateConfig(config);
  if (errors.length) {
    console.error('Configuration error(s):');
    for (const e of errors) console.error('  - ' + e);
    console.error('\nCopy .env.example to .env and fill in the required values.');
    process.exit(1);
  }

  const telegram = new TelegramClient({
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
  });

  // Fail fast with a clear message if Telegram credentials are wrong.
  try {
    const me = await telegram.verify();
    console.log(`[telegram] connected as @${me.username}`);
  } catch (err) {
    console.error('[telegram] failed to connect:', err.message);
    console.error('Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
    process.exit(1);
  }

  console.warn(
    '\n⚠️  ПОПЕРЕДЖЕННЯ: бот використовує користувацький токен Discord (self-bot).\n' +
      '   Це порушує Правила користування Discord і може призвести до блокування\n' +
      '   акаунта. Використовуйте на власний ризик. Режим — лише читання.\n'
  );

  const client = startDiscord({ config, telegram });

  const shutdown = (signal) => {
    console.log(`\n[disbot] received ${signal}, shutting down...`);
    try {
      client.destroy();
    } catch (_) {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
