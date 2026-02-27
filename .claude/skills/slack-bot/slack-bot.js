#!/usr/bin/env bun
// Slack bot CLI - clappie slack-bot <command>

import * as api from './webhooks/send.js';

export const meta = {
  name: 'slack-bot',
  description: 'Slack bot integration',
  commands: [
    { cmd: 'send <channel> <message>', desc: 'Send a message' },
    { cmd: 'thread <channel:ts> <message>', desc: 'Reply in thread' },
    { cmd: 'photo <channel> <path> [caption]', desc: 'Send an image' },
    { cmd: 'document <channel> <path> [caption]', desc: 'Send a file' },
    { cmd: 'react <channel> <ts> <emoji>', desc: 'Add reaction' },
  ],
};

const c = { reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m' };

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    switch (cmd) {
      case 'send': {
        const [channel, ...msg] = args;
        if (!channel || !msg.length) throw new Error('Usage: clappie slack-bot send <channel> <message>');
        await api.send(channel, msg.join(' '));
        console.log(`${c.green}✓${c.reset} Sent`);
        break;
      }
      case 'thread': {
        const [channelTs, ...msg] = args;
        if (!channelTs || !msg.length) throw new Error('Usage: clappie slack-bot thread <channel:ts> <message>');
        await api.send(channelTs, msg.join(' '));
        console.log(`${c.green}✓${c.reset} Replied in thread`);
        break;
      }
      case 'photo': {
        const [channel, path, ...caption] = args;
        if (!channel || !path) throw new Error('Usage: clappie slack-bot photo <channel> <path>');
        await api.sendPhoto(channel, path, caption.join(' ') || undefined);
        console.log(`${c.green}✓${c.reset} Photo sent`);
        break;
      }
      case 'document':
      case 'doc': {
        const [channel, path, ...caption] = args;
        if (!channel || !path) throw new Error('Usage: clappie slack-bot document <channel> <path>');
        await api.sendDocument(channel, path, caption.join(' ') || undefined);
        console.log(`${c.green}✓${c.reset} Document sent`);
        break;
      }
      case 'react': {
        const [channel, ts, emoji] = args;
        if (!channel || !ts || !emoji) throw new Error('Usage: clappie slack-bot react <channel> <ts> <emoji>');
        await api.setReaction(channel, ts, emoji);
        console.log(`${c.green}✓${c.reset} Reacted`);
        break;
      }
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        console.log(`\n${c.cyan}Slack Bot${c.reset}\n`);
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

// Only run if this is the main entry point (not when imported)
if (import.meta.main) {
  main();
}
