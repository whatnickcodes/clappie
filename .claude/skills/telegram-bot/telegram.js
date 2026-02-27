#!/usr/bin/env bun
// Telegram bot CLI - clappie telegram <command>

import * as api from './webhooks/send.js';

export const meta = {
  name: 'telegram',
  description: 'Telegram bot integration',
  commands: [
    { cmd: 'send <chatId> <message>', desc: 'Send a message' },
    { cmd: 'photo <chatId> <path> [caption]', desc: 'Send a photo' },
    { cmd: 'document <chatId> <path> [caption]', desc: 'Send a document' },
    { cmd: 'voice <chatId> <path> [caption]', desc: 'Send a voice message' },
    { cmd: 'video <chatId> <path> [caption]', desc: 'Send a video' },
    { cmd: 'sticker <chatId> <id>', desc: 'Send a sticker' },
    { cmd: 'react <chatId> <msgId> <emoji>', desc: 'React to a message' },
  ],
};

const c = { reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m' };

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    switch (cmd) {
      case 'send': {
        const [chatId, ...msg] = args;
        if (!chatId || !msg.length) throw new Error('Usage: clappie telegram send <chatId> <message>');
        await api.send(chatId, msg.join(' '));
        console.log(`${c.green}✓${c.reset} Sent`);
        break;
      }
      case 'photo': {
        const [chatId, path, ...caption] = args;
        if (!chatId || !path) throw new Error('Usage: clappie telegram photo <chatId> <path>');
        await api.sendPhoto(chatId, path, caption.join(' ') || undefined);
        console.log(`${c.green}✓${c.reset} Photo sent`);
        break;
      }
      case 'document':
      case 'doc': {
        const [chatId, path, ...caption] = args;
        if (!chatId || !path) throw new Error('Usage: clappie telegram document <chatId> <path>');
        await api.sendDocument(chatId, path, caption.join(' ') || undefined);
        console.log(`${c.green}✓${c.reset} Document sent`);
        break;
      }
      case 'voice': {
        const [chatId, path, ...caption] = args;
        if (!chatId || !path) throw new Error('Usage: clappie telegram voice <chatId> <path>');
        await api.sendVoice(chatId, path, caption.join(' ') || undefined);
        console.log(`${c.green}✓${c.reset} Voice sent`);
        break;
      }
      case 'video': {
        const [chatId, path, ...caption] = args;
        if (!chatId || !path) throw new Error('Usage: clappie telegram video <chatId> <path>');
        await api.sendVideo(chatId, path, caption.join(' ') || undefined);
        console.log(`${c.green}✓${c.reset} Video sent`);
        break;
      }
      case 'sticker': {
        const [chatId, sticker] = args;
        if (!chatId || !sticker) throw new Error('Usage: clappie telegram sticker <chatId> <id>');
        await api.sendSticker(chatId, sticker);
        console.log(`${c.green}✓${c.reset} Sticker sent`);
        break;
      }
      case 'react': {
        const [chatId, msgId, emoji] = args;
        if (!chatId || !msgId || !emoji) throw new Error('Usage: clappie telegram react <chatId> <msgId> <emoji>');
        await api.setReaction(chatId, parseInt(msgId, 10), emoji);
        console.log(`${c.green}✓${c.reset} Reacted`);
        break;
      }
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        console.log(`\n${c.cyan}Telegram Bot${c.reset}\n`);
        meta.commands.forEach(c => console.log(`  ${c.cmd.padEnd(35)} ${c.desc}`));
        console.log('');
        break;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

main();
