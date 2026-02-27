// Telegram message parsing

export function extractAttachments(message) {
  const attachments = [];

  if (message.photo?.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    attachments.push({
      type: 'photo',
      fileId: largest.file_id,
      fileUniqueId: largest.file_unique_id,
      mimeType: 'image/jpeg',
    });
  }

  if (message.document) {
    attachments.push({
      type: 'document',
      fileId: message.document.file_id,
      fileName: message.document.file_name,
      mimeType: message.document.mime_type,
    });
  }

  if (message.voice) {
    attachments.push({
      type: 'voice',
      fileId: message.voice.file_id,
      duration: message.voice.duration,
      mimeType: message.voice.mime_type,
    });
  }

  if (message.video) {
    attachments.push({
      type: 'video',
      fileId: message.video.file_id,
      mimeType: message.video.mime_type,
    });
  }

  if (message.video_note) {
    attachments.push({
      type: 'video_note',
      fileId: message.video_note.file_id,
      mimeType: 'video/mp4',
    });
  }

  if (message.sticker) {
    attachments.push({
      type: 'sticker',
      emoji: message.sticker.emoji,
      setName: message.sticker.set_name,
    });
  }

  if (message.location) {
    attachments.push({
      type: 'location',
      latitude: message.location.latitude,
      longitude: message.location.longitude,
    });
  }

  return attachments;
}

export function parseMessage(body) {
  const message = body.message || body.edited_message;
  if (message) {
    const parsed = {
      userId: String(message.from?.id),
      chatId: String(message.chat?.id),
      text: message.text || message.caption || '',
      username: message.from?.username,
      firstName: message.from?.first_name,
      messageId: message.message_id,
      isEdit: !!body.edited_message,
      attachments: extractAttachments(message),
      raw: body,
    };

    if (message.reply_to_message) {
      const reply = message.reply_to_message;
      parsed.replyTo = {
        messageId: reply.message_id,
        text: reply.text || reply.caption || '',
        fromUserId: String(reply.from?.id),
        isFromBot: reply.from?.is_bot || false,
      };
    }

    return parsed;
  }

  if (body.callback_query) {
    return {
      userId: String(body.callback_query.from?.id),
      chatId: String(body.callback_query.message?.chat?.id),
      text: body.callback_query.data,
      messageId: body.callback_query.message?.message_id,
      isCallback: true,
      attachments: [],
      raw: body,
    };
  }

  if (body.message_reaction) {
    const reaction = body.message_reaction;
    const emojis = (reaction.new_reaction || [])
      .filter(r => r.type === 'emoji')
      .map(r => r.emoji);

    return {
      userId: String(reaction.user?.id),
      chatId: String(reaction.chat?.id),
      text: emojis.length > 0 ? `[Reacted with ${emojis.join(' ')}]` : '[Removed reaction]',
      messageId: reaction.message_id,
      isReaction: true,
      reaction: { emojis },
      attachments: [],
      raw: body,
    };
  }

  return null;
}

export function getScope(msg) {
  return `telegram-bot:${msg.chatId}`;
}

export function isAllowedUser(userId, allowedUsers) {
  if (!allowedUsers?.length) return false;
  return allowedUsers.includes(String(userId));
}

export default { extractAttachments, parseMessage, getScope, isAllowedUser };
