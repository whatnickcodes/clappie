// Telegram webhook signature verification
// Telegram sends secret token in X-Telegram-Bot-Api-Secret-Token header

import crypto from 'crypto';

export default function verify(req, rawBody, env) {
  const token = req.headers.get('x-telegram-bot-api-secret-token');
  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !secret) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}
