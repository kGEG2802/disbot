'use strict';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_ATTEMPTS = 5;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Remove HTML tags and unescape entities for the plain-text fallback.
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

class TelegramClient {
  constructor({ botToken, chatId, fetchImpl, logger = console, spacingMs = 350 }) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.fetch = fetchImpl || ((...args) => fetch(...args));
    this.logger = logger;
    this.spacingMs = spacingMs;
    // Serialize sends so we stay within Telegram's per-chat rate limits.
    this.queue = Promise.resolve();
  }

  async verify() {
    const res = await this.fetch(`${TELEGRAM_API}/bot${this.botToken}/getMe`);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`);
    return data.result;
  }

  // Enqueue an HTML message. Falls back to plain text if Telegram rejects the markup.
  send(html) {
    this.queue = this.queue
      .then(() => this._sendWithRetry(html, 'HTML'))
      .catch(async (err) => {
        if (err.parseError) {
          try {
            await this._sendWithRetry(stripHtml(html), undefined);
            return;
          } catch (fallbackErr) {
            err = fallbackErr;
          }
        }
        this.logger.error('[telegram] send failed:', err.message);
      });
    return this.queue;
  }

  async _sendWithRetry(text, parseMode, attempt = 0) {
    try {
      const body = {
        chat_id: this.chatId,
        text,
        disable_web_page_preview: true,
      };
      if (parseMode) body.parse_mode = parseMode;

      const res = await this.fetch(`${TELEGRAM_API}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = (data.parameters && data.parameters.retry_after) || 1;
        this.logger.warn(`[telegram] rate limited, waiting ${retryAfter}s`);
        await delay((retryAfter + 0.5) * 1000);
        return this._sendWithRetry(text, parseMode, attempt); // 429 is not a "real" attempt
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const description = data.description || `HTTP ${res.status}`;
        if (res.status >= 500) throw new Error(`Telegram server error: ${description}`);
        // 4xx is permanent. Flag parse errors so the caller can retry as plain text.
        const err = new Error(`Telegram error ${res.status}: ${description}`);
        err.permanent = true;
        if (parseMode && /parse|entit|tag/i.test(description)) err.parseError = true;
        throw err;
      }

      await delay(this.spacingMs);
      return true;
    } catch (err) {
      if (err.permanent || attempt + 1 >= MAX_ATTEMPTS) throw err;
      const backoff = Math.min(2 ** attempt, 16) * 1000;
      this.logger.warn(`[telegram] ${err.message}; retry in ${backoff}ms`);
      await delay(backoff);
      return this._sendWithRetry(text, parseMode, attempt + 1);
    }
  }
}

module.exports = { TelegramClient, delay, stripHtml };
