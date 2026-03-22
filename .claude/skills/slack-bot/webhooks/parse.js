// Slack message parsing

export function extractAttachments(event) {
  const attachments = [];
  if (!event.files?.length) return attachments;

  for (const file of event.files) {
    attachments.push({
      type: file.mimetype?.startsWith('image/') ? 'photo' : 'document',
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimetype,
      url: file.url_private_download || file.url_private,
    });
  }
  return attachments;
}

export function parseMessage(body) {
  // URL verification challenge
  if (body.type === 'url_verification') {
    return { _challenge: body.challenge };
  }

  if (body.type !== 'event_callback') return null;

  const event = body.event;
  if (!event) return null;

  // Handle reaction events
  if (event.type === 'reaction_added' || event.type === 'reaction_removed') {
    // Only handle reactions to messages
    if (event.item?.type !== 'message') return null;

    const emoji = event.reaction;
    const isAdded = event.type === 'reaction_added';

    return {
      userId: String(event.user),
      chatId: String(event.item.channel),
      text: isAdded ? `[Reacted with :${emoji}:]` : `[Removed :${emoji}:]`,
      messageId: event.item.ts,
      threadTs: null,  // Reactions don't have thread context directly
      ts: event.event_ts,
      isReaction: true,
      reaction: {
        emoji,
        added: isAdded,
        targetTs: event.item.ts,  // The message that was reacted to
      },
      attachments: [],
      raw: body,
    };
  }

  // Handle regular messages
  if (event.type !== 'message') return null;
  if (event.bot_id || event.subtype === 'bot_message') return null;
  if (event.subtype && event.subtype !== 'file_share') return null;

  let text = event.text || '';
  text = text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();

  const isThreadReply = event.thread_ts && event.thread_ts !== event.ts;

  return {
    userId: String(event.user),
    chatId: String(event.channel),
    text,
    messageId: event.ts,
    threadTs: isThreadReply ? event.thread_ts : null,
    ts: event.ts,
    attachments: extractAttachments(event),
    raw: body,
  };
}

export function getScope(msg) {
  // Threads: scope by parent message (threadTs is stable)
  if (msg.threadTs) return `slack-bot:${msg.chatId}:${msg.threadTs}`;
  // Main chat: scope by channel only (all messages route to same sidekick until complete)
  return `slack-bot:${msg.chatId}`;
}

export function isAllowedUser(userId, allowedUsers) {
  if (!allowedUsers?.length) return false;
  return allowedUsers.includes(String(userId));
}

export default { extractAttachments, parseMessage, getScope, isAllowedUser };
