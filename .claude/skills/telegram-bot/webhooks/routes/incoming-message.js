// Telegram webhook handler - receives updates, returns sidekick input

import { parseMessage, getScope, isAllowedUser } from '../parse.js';
import { downloadFile } from '../send.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export default {
  path: '{webhook-path}',
  name: 'incoming-message',
  description: 'Handle incoming Telegram messages',
  events: ['*'],  // Catch-all
  action: 'run',

  run: async (payload, ctx) => {
    const msg = parseMessage(payload);
    if (!msg) return { handled: true };

    // Check allowed users
    const allowedUsers = ctx.loadSkillSettingList('users');
    if (allowedUsers.length > 0 && !isAllowedUser(msg.userId, allowedUsers)) {
      console.log(`[telegram] User ${msg.userId} not allowed`);
      return { handled: true };
    }

    // Skip reactions
    if (msg.isReaction) return { handled: true };

    // Download attachments
    const downloadedAttachments = [];
    if (msg.attachments?.length > 0) {
      const filesDir = join(ctx.projectRoot, 'recall', 'files');
      if (!existsSync(filesDir)) mkdirSync(filesDir, { recursive: true });

      for (const att of msg.attachments) {
        if (att.fileId) {
          try {
            const ext = getExt(att);
            const filename = `tg-${att.fileUniqueId || Date.now()}${ext}`;
            const localPath = join(filesDir, filename);
            await downloadFile(att.fileId, localPath);
            downloadedAttachments.push({ ...att, localPath });
          } catch (err) {
            console.error(`[telegram] Download failed: ${err.message}`);
          }
        } else {
          downloadedAttachments.push(att);
        }
      }
    }

    return {
      sidekick: true,
      conversationId: msg.chatId,
      userId: msg.userId,
      content: msg.text,
      context: `telegram user ${msg.userId}`,
      scope: getScope(msg),
      messageId: msg.messageId,
      username: msg.username,
      firstName: msg.firstName,
      attachments: downloadedAttachments,
      replyTo: msg.replyTo,
      isCallback: msg.isCallback,
    };
  }
};

function getExt(att) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'video/mp4': '.mp4',
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
  };
  if (att.mimeType && map[att.mimeType]) return map[att.mimeType];
  if (att.fileName) {
    const idx = att.fileName.lastIndexOf('.');
    if (idx > 0) return att.fileName.slice(idx);
  }
  return { photo: '.jpg', video: '.mp4', voice: '.ogg' }[att.type] || '';
}
