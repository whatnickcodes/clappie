// Telegram send functions - used by Sidekick to reply

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

function loadEnv() {
  const envPath = join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        }
      }
    }
  }
}

function getBotToken() {
  loadEnv();
  return process.env.TELEGRAM_BOT_TOKEN;
}

function stripMarkdownEscaping(text) {
  return text.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1');
}

// Resolve chatId — if not numeric, fall back to TELEGRAM_CHAT_ID env var
function resolveChatId(chatId) {
  if (chatId && /^-?\d+$/.test(String(chatId))) return String(chatId);
  // Non-numeric chatId (e.g. "marco", "user", "alert") — use default
  const fallback = process.env.TELEGRAM_CHAT_ID;
  if (fallback) {
    console.warn(`[telegram] chatId "${chatId}" is not numeric — using TELEGRAM_CHAT_ID default`);
    return fallback;
  }
  throw new Error(`chatId "${chatId}" is not a valid Telegram chat ID (must be numeric). Set TELEGRAM_CHAT_ID env var as fallback.`);
}

// Main send function - called by Sidekick
export async function send(chatId, message, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const payload = {
    chat_id: resolvedChatId,
    text: stripMarkdownEscaping(message),
  };

  if (options.replyToMessageId) {
    payload.reply_parameters = { message_id: options.replyToMessageId };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${await response.text()}`);
  }

  return await response.json();
}

// Telegram's allowed reaction emojis (Bot API) — from python-telegram-bot ReactionEmoji enum
// Stored WITHOUT variation selectors (U+FE0F) — we strip them on lookup for consistent matching
const VALID_REACTIONS = new Set([
  '👍','👎','❤','🔥','🥰','👏','😁','🤔','🤯','😱','🤬','😢','🎉','🤩',
  '🤮','💩','🙏','👌','🕊','🤡','🥱','🥴','😍','🐳','❤\u200D🔥','🌚','🌭','💯',
  '🤣','⚡','🍌','🏆','💔','🤨','😐','🍓','🍾','💋','🖕','😈','😴','😭',
  '🤓','👻','👨\u200D💻','👀','🎃','🙈','😇','😨','🤝','✍','🤗','🫡','🎅','🎄',
  '☃','💅','🤪','🗿','🆒','💘','🙉','🦄','😘','💊','🙊','😎','👾',
  '🤷\u200D♂','🤷','🤷\u200D♀','😡',
]);

// Strip variation selectors (U+FE0F) for consistent matching
const stripVS = (s) => s.replace(/\uFE0F/g, '');

export async function setReaction(chatId, messageId, emoji, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  // Validate emoji against Telegram's whitelist (strip variation selectors for matching)
  if (emoji && !VALID_REACTIONS.has(stripVS(emoji))) {
    throw new Error(`Telegram reaction invalid: ${emoji} is not in Telegram's allowed emoji list`);
  }

  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/setMessageReaction`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: resolvedChatId,
      message_id: messageId,
      reaction: emoji ? [{ type: 'emoji', emoji }] : [],
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${await response.text()}`);
  }

  return await response.json();
}

export async function sendPhoto(chatId, filePath, caption, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

  const form = new FormData();
  form.append('chat_id', resolvedChatId);
  form.append('photo', Bun.file(filePath));
  if (caption) form.append('caption', stripMarkdownEscaping(caption));
  if (options.replyToMessageId) {
    form.append('reply_parameters', JSON.stringify({ message_id: options.replyToMessageId }));
  }

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Telegram sendPhoto failed: ${await response.text()}`);
  return await response.json();
}

export async function sendDocument(chatId, filePath, caption, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;

  const form = new FormData();
  form.append('chat_id', resolvedChatId);
  form.append('document', Bun.file(filePath));
  if (caption) form.append('caption', stripMarkdownEscaping(caption));
  if (options.replyToMessageId) {
    form.append('reply_parameters', JSON.stringify({ message_id: options.replyToMessageId }));
  }

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Telegram sendDocument failed: ${await response.text()}`);
  return await response.json();
}

export async function sendVoice(chatId, filePath, caption, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendVoice`;

  const form = new FormData();
  form.append('chat_id', resolvedChatId);
  form.append('voice', Bun.file(filePath));
  if (caption) form.append('caption', stripMarkdownEscaping(caption));
  if (options.replyToMessageId) {
    form.append('reply_parameters', JSON.stringify({ message_id: options.replyToMessageId }));
  }

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Telegram sendVoice failed: ${await response.text()}`);
  return await response.json();
}

export async function sendVideo(chatId, filePath, caption, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendVideo`;

  const form = new FormData();
  form.append('chat_id', resolvedChatId);
  form.append('video', Bun.file(filePath));
  if (caption) form.append('caption', stripMarkdownEscaping(caption));
  if (options.replyToMessageId) {
    form.append('reply_parameters', JSON.stringify({ message_id: options.replyToMessageId }));
  }

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Telegram sendVideo failed: ${await response.text()}`);
  return await response.json();
}

export async function sendSticker(chatId, sticker, options = {}) {
  const resolvedChatId = resolveChatId(chatId);
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/sendSticker`;
  const isFilePath = sticker.startsWith('/') || sticker.startsWith('./');

  let response;
  if (isFilePath) {
    const form = new FormData();
    form.append('chat_id', resolvedChatId);
    form.append('sticker', Bun.file(sticker));
    response = await fetch(url, { method: 'POST', body: form });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: resolvedChatId, sticker }),
    });
  }

  if (!response.ok) throw new Error(`Telegram sendSticker failed: ${await response.text()}`);
  return await response.json();
}

export async function getStickerSet(name, options = {}) {
  const botToken = options.botToken || getBotToken();
  const url = `https://api.telegram.org/bot${botToken}/getStickerSet`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) throw new Error(`Telegram getStickerSet failed: ${await response.text()}`);
  return await response.json();
}

export async function getFileUrl(fileId, options = {}) {
  const botToken = options.botToken || getBotToken();
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });

  const result = await response.json();
  if (!result.ok || !result.result?.file_path) throw new Error('No file_path in response');
  return `https://api.telegram.org/file/bot${botToken}/${result.result.file_path}`;
}

export async function downloadFile(fileId, destPath, options = {}) {
  const fileUrl = await getFileUrl(fileId, options);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  await Bun.write(destPath, response);
}

// ─── Sidekick extension commands ─────────────────────────────────────────────
// These are exposed to sidekicks via `clappie sidekick <command>`.
// First arg is always chatId (injected by server), rest are positional from CLI.

export const sidekickCommands = {
  async react(chatId, messageId, emoji) {
    await setReaction(chatId, messageId, emoji || '');
    return { reacted: true, emoji: emoji || '(removed)' };
  },

  async combo(chatId, messageId, ...emojis) {
    const results = [];
    for (const e of emojis) {
      try {
        await setReaction(chatId, messageId, e);
        results.push({ emoji: e, ok: true });
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        results.push({ emoji: e, ok: false, error: err.message });
      }
    }
    return { combo: true, results };
  },

  async sticker(chatId, stickerSet, indexOrRandom) {
    let fileId;
    if (stickerSet && !stickerSet.startsWith('/') && !/^[A-Za-z0-9_-]{20,}$/.test(stickerSet)) {
      // Looks like a set name, not a direct file_id
      const setData = await getStickerSet(stickerSet);
      if (!setData.ok || !setData.result?.stickers?.length) {
        throw new Error('Sticker set not found');
      }
      const stickers = setData.result.stickers;
      const idx = indexOrRandom === 'random'
        ? Math.floor(Math.random() * stickers.length)
        : (!isNaN(parseInt(indexOrRandom)) ? Math.min(parseInt(indexOrRandom), stickers.length - 1) : 0);
      fileId = stickers[idx].file_id;
    } else {
      fileId = stickerSet;
    }
    const result = await sendSticker(chatId, fileId);
    return { sent: true, fileId, ...result };
  },

  async 'send-file'(chatId, type, filePath, caption) {
    const typeMap = {
      photo: sendPhoto,
      document: sendDocument,
      voice: sendVoice,
      video: sendVideo,
      animation: sendDocument,
      sticker: sendSticker,
    };
    const fn = typeMap[type];
    if (!fn) throw new Error(`Unsupported file type: ${type}. Supported: ${Object.keys(typeMap).join(', ')}`);
    await fn(chatId, filePath, caption);
    return { sent: true, type };
  },
};

export default {
  send,
  setReaction,
  sendPhoto,
  sendDocument,
  sendVoice,
  sendVideo,
  sendSticker,
  getStickerSet,
  getFileUrl,
  downloadFile,
  sidekickCommands,
};
