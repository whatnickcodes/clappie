// Slack events route - receives events, returns sidekick input

import { parseMessage, getScope, isAllowedUser } from '../parse.js';
import { downloadFile } from '../send.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export default {
  path: '{webhook-path}',
  name: 'incoming-message',
  description: 'Handle incoming Slack messages and reactions',
  events: ['*'],  // Catch-all (messages, reactions, etc.)
  action: 'run',

  run: async (payload, ctx) => {
    const msg = parseMessage(payload);
    if (!msg) return { handled: true };

    // URL verification
    if (msg._challenge) {
      return { handled: true, challenge: msg._challenge };
    }

    // Check allowed users
    const allowedUsers = ctx.loadSkillSettingList('users');
    if (allowedUsers.length > 0 && !isAllowedUser(msg.userId, allowedUsers)) {
      console.log(`[slack] User ${msg.userId} not allowed`);
      return { handled: true };
    }

    // Download attachments
    const downloadedAttachments = [];
    if (msg.attachments?.length > 0) {
      const filesDir = join(ctx.projectRoot, 'recall', 'files');
      if (!existsSync(filesDir)) mkdirSync(filesDir, { recursive: true });

      for (const att of msg.attachments) {
        if (att.fileId) {
          try {
            const ext = att.fileName?.includes('.') ? att.fileName.slice(att.fileName.lastIndexOf('.')) : '';
            const localPath = join(filesDir, `slack-${att.fileId}${ext}`);
            await downloadFile(att.fileId, localPath);
            downloadedAttachments.push({ ...att, localPath });
          } catch (err) {
            console.error(`[slack] Download failed: ${err.message}`);
          }
        }
      }
    }

    // Build conversation ID
    // - Threads: channel:threadTs (reply in thread)
    // - Main chat: just channel (reply in main, like Telegram DM)
    let conversationId = msg.chatId;
    if (msg.threadTs) {
      conversationId = `${msg.chatId}:${msg.threadTs}`;
    }

    return {
      sidekick: true,
      conversationId,
      userId: msg.userId,
      content: msg.text,
      context: `slack channel ${msg.chatId}`,
      scope: getScope(msg),
      messageId: msg.messageId,
      ts: msg.ts,
      threadTs: msg.threadTs,
      attachments: downloadedAttachments,
      // Reaction-specific fields (if present)
      isReaction: msg.isReaction || false,
      reaction: msg.reaction || null,
    };
  }
};
