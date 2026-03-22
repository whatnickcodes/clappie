// Slack send functions - used by Sidekick to reply

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
  return process.env.SLACK_BOT_TOKEN;
}

function parseChatId(chatId) {
  const parts = chatId.split(':');
  if (parts.length >= 2) {
    return { channel: parts[0], threadTs: parts.slice(1).join(':') };
  }
  return { channel: chatId, threadTs: null };
}

// Main send function - called by Sidekick
export async function send(chatId, message, options = {}) {
  const botToken = options.botToken || getBotToken();
  const { channel, threadTs } = parseChatId(chatId);

  const payload = { channel, text: message };
  if (threadTs) payload.thread_ts = threadTs;

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!result.ok) throw new Error(`Slack API error: ${result.error}`);
  return result;
}

export async function setReaction(chatId, messageTs, emoji, options = {}) {
  const botToken = options.botToken || getBotToken();
  const { channel } = parseChatId(chatId);

  const response = await fetch('https://slack.com/api/reactions.add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify({
      channel,
      timestamp: messageTs,
      name: emoji.replace(/:/g, ''),
    }),
  });

  const result = await response.json();
  if (!result.ok && result.error !== 'already_reacted') {
    throw new Error(`Slack reactions.add error: ${result.error}`);
  }
  return result;
}

async function uploadFile(chatId, filePath, caption, options = {}) {
  const botToken = options.botToken || getBotToken();
  const { channel, threadTs } = parseChatId(chatId);
  const file = Bun.file(filePath);
  const filename = filePath.split('/').pop();

  // Get upload URL
  const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${botToken}`,
    },
    body: new URLSearchParams({ filename, length: String(file.size) }),
  });

  const urlData = await urlRes.json();
  if (!urlData.ok) throw new Error(`Slack getUploadURL failed: ${urlData.error}`);

  // Upload file
  const uploadRes = await fetch(urlData.upload_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!uploadRes.ok) throw new Error(`Slack upload failed: ${uploadRes.status}`);

  // Complete upload
  const completePayload = {
    files: [{ id: urlData.file_id, title: caption || filename }],
    channel_id: channel,
  };
  if (threadTs) completePayload.thread_ts = threadTs;
  if (caption) completePayload.initial_comment = caption;

  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify(completePayload),
  });

  const result = await completeRes.json();
  if (!result.ok) throw new Error(`Slack completeUpload failed: ${result.error}`);
  return result;
}

export async function sendPhoto(chatId, filePath, caption, options = {}) {
  return uploadFile(chatId, filePath, caption, options);
}

export async function sendDocument(chatId, filePath, caption, options = {}) {
  return uploadFile(chatId, filePath, caption, options);
}

export async function downloadFile(fileId, destPath, options = {}) {
  const botToken = options.botToken || getBotToken();

  const infoRes = await fetch(`https://slack.com/api/files.info?file=${fileId}`, {
    headers: { 'Authorization': `Bearer ${botToken}` },
  });

  const info = await infoRes.json();
  if (!info.ok) throw new Error(`Slack files.info failed: ${info.error}`);

  const downloadUrl = info.file.url_private_download || info.file.url_private;
  if (!downloadUrl) throw new Error('No download URL for file');

  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${botToken}` },
  });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  await Bun.write(destPath, response);
}

// ─── Sidekick extension commands ─────────────────────────────────────────────
// These are exposed to sidekicks via `clappie sidekick <command>`.
// First arg is always chatId (injected by server), rest are positional from CLI.

export const sidekickCommands = {
  async react(chatId, messageTs, emoji) {
    await setReaction(chatId, messageTs, emoji);
    return { reacted: true, emoji };
  },

  async 'send-file'(chatId, type, filePath, caption) {
    const typeMap = {
      photo: sendPhoto,
      document: sendDocument,
    };
    const fn = typeMap[type];
    if (!fn) throw new Error(`Unsupported file type: ${type}. Supported: ${Object.keys(typeMap).join(', ')}`);
    await fn(chatId, filePath, caption);
    return { sent: true, type };
  },
};

export default { send, setReaction, sendPhoto, sendDocument, downloadFile, sidekickCommands };
