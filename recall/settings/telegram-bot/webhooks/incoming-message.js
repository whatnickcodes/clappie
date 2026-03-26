// Telegram incoming-message override — intercepts /researcher commands
// Falls through to default behavior for all other messages

import { parseMessage, getScope, isAllowedUser } from '../../../../.claude/skills/telegram-bot/webhooks/parse.js';
import { downloadFile } from '../../../../.claude/skills/telegram-bot/webhooks/send.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export default {
  path: '{webhook-path}',
  name: 'incoming-message',
  description: 'Handle Telegram messages with /researcher command routing',
  events: ['*'],
  action: 'run',

  run: async (payload, ctx) => {
    const msg = parseMessage(payload);
    if (!msg) return { handled: true };

    // Check allowed users
    const allowedUsers = ctx.loadSkillSettingList('users');
    if (allowedUsers.length > 0 && !isAllowedUser(msg.userId, allowedUsers)) {
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

    // ── /researcher command routing ──────────────────────────────────
    const text = (msg.text || '').trim();
    if (text.startsWith('/researcher')) {
      const query = text.replace(/^\/researcher\s*/, '').trim();
      if (!query) {
        // Empty query — tell user to provide a question
        return {
          sidekick: true,
          source: 'researcher-investigate',
          conversationId: msg.chatId,
          userId: msg.userId,
          content: 'The user sent /researcher with no query. Reply asking what they want researched.',
          context: `telegram user ${msg.userId}`,
          scope: `researcher:${msg.chatId}:${Date.now()}`,
          messageId: msg.messageId,
          username: msg.username,
          firstName: msg.firstName,
          attachments: downloadedAttachments,
        };
      }

      return {
        sidekick: true,
        source: 'researcher-investigate',
        conversationId: msg.chatId,
        userId: msg.userId,
        content: query,
        context: `telegram user ${msg.userId}`,
        scope: `researcher:${msg.chatId}:${Date.now()}`,
        messageId: msg.messageId,
        username: msg.username,
        firstName: msg.firstName,
        attachments: downloadedAttachments,
        replyTo: msg.replyTo,
      };
    }

    // ── Default: normal sidekick spawn ──────────────────────────────
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
