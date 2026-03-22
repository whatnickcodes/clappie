// Sidekick CLI commands - extracted from clappie.js
// All sidekick-related operations go through the sidekick server HTTP API

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import config from './config.js';

const SIDEKICK_STATE_PATH = join(dirname(import.meta.path), 'state.js');
const SIDEKICK_TMUX_PATH = join(dirname(import.meta.path), 'tmux.js');
const PROJECT_ROOT = join(dirname(import.meta.path), '..', '..', '..', '..', '..');

function getPort() {
  return process.env.SIDEKICK_PORT || 7777;
}

// -------------------------------------------------------------------
// send - Send message to user via sidekick
// -------------------------------------------------------------------

export async function send(sidekickId, message, options = {}) {
  const port = getPort();

  try {
    const payload = { sidekickId, message };
    if (options.replyToMessageId) {
      payload.replyToMessageId = options.replyToMessageId;
    }

    const response = await fetch(`http://localhost:${port}/outbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.ok) {
      console.log('✓ Message sent');
    } else {
      console.error(`✗ Failed: ${data.error || 'Unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// skillCommand - Generic handler for skill extension commands
// Skills register commands via sidekickCommands in their send.js
// -------------------------------------------------------------------

export async function skillCommand(sidekickId, command, args = []) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/skill-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidekickId, command, args }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`✓ ${command}`);
    } else {
      console.error(`✗ Failed: ${data.error || 'Unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// complete - End sidekick with summary
// -------------------------------------------------------------------

export async function complete(sidekickId, summary) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidekickId, summary }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log('✓ Sidekick complete - session terminating...');
    } else {
      console.error(`✗ Failed: ${data.error || 'Unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// log - Log an action (silent failure - shouldn't block sidekick)
// -------------------------------------------------------------------

export async function log(sidekickId, action) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidekickId, action }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`✗ Log failed: ${data.error || 'Unknown error'}`);
    }
  } catch {
    // Silent fail - logging shouldn't block the sidekick
  }
}

// -------------------------------------------------------------------
// report - Send message to main Claude terminal
// -------------------------------------------------------------------

export async function report(sidekickId, message) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidekickId, message }),
    });

    const data = await response.json();
    if (data.ok) {
      if (data.fallback) {
        console.log('✓ Report saved to dirty/ (no live main pane found)');
      } else {
        console.log('✓ Report delivered to main terminal');
      }
    } else {
      console.error(`✗ Failed: ${data.error || 'Unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// spawn - Create and deploy a new sidekick
// -------------------------------------------------------------------

export async function spawn(prompt, options = {}) {
  // Dynamically import sidekick modules
  const state = await import(SIDEKICK_STATE_PATH);
  const tmux = await import(SIDEKICK_TMUX_PATH);

  const name = options.name || '';
  const squad = options.squad || '';
  const emoji = options.emoji || '';
  const model = options.model || '';
  const superCC = options.superCC || false;
  const sourceOverride = options.source || '';
  const promptModeOverride = options.promptMode || '';
  const contextFile = options.contextFile || '';
  const simulationId = options.simulationId || '';
  const identity = options.identity || '';
  const displayName = options.displayName || '';

  // Extract routing hints from prompt dynamically
  // Discovers all skills with send capability and matches "<skillname> user/channel X"
  let source = sourceOverride || 'internal';
  let chatId = '';
  let userId = '';

  // Discover skills with send capability (skip if source explicitly set)
  const webhookSkills = sourceOverride ? [] : config.discoverWebhookSkills().filter(s => s.hasSend);

  for (const skill of webhookSkills) {
    // Get base name without -bot suffix for matching (telegram-bot → telegram)
    const baseName = skill.name.replace(/-bot$/, '');

    // Try to match "<skillname> user <id>" or "<skillname> channel <id>" patterns
    // Examples: "telegram user 123", "slack channel #general", "discord user 456"
    const pattern = new RegExp(`${baseName}\\s+(?:user|channel)?\\s*([#\\w-]+|\\d{5,})`, 'i');
    const match = prompt.match(pattern);

    if (match) {
      source = skill.name;  // Use full skill folder name
      chatId = match[1];
      // For numeric IDs (like Telegram), also set userId
      if (/^\d+$/.test(chatId)) {
        userId = chatId;
      }
      break;  // First match wins
    }
  }

  // Resolve model: explicit flag > default setting > bare claude
  let resolvedModel = model;
  if (!resolvedModel) {
    try {
      const defaultModelPath = join(PROJECT_ROOT, 'recall', 'settings', 'sidekicks', 'default-model.txt');
      if (existsSync(defaultModelPath)) {
        resolvedModel = readFileSync(defaultModelPath, 'utf8').trim();
      }
    } catch {}
  }

  // Resolve prompt mode: explicit flag > default setting > 'message'
  let resolvedPromptMode = promptModeOverride;
  if (!resolvedPromptMode) {
    try {
      const defaultPath = join(PROJECT_ROOT, 'recall', 'settings', 'sidekicks', 'prompt-mode.txt');
      if (existsSync(defaultPath)) {
        resolvedPromptMode = readFileSync(defaultPath, 'utf8').trim();
      }
    } catch {}
  }
  if (!resolvedPromptMode || !['system', 'message'].includes(resolvedPromptMode)) {
    resolvedPromptMode = 'message';
  }

  // Create sidekick
  const sidekick = state.createSidekick(source, {
    userId,
    chatId,
    initialText: prompt,
    name,
    squad,
    emoji,
  });

  // Mark it as AI-initiated + store model + flags
  state.updateSidekick(sidekick.id, {
    aiInitiated: true,
    ...(resolvedModel ? { model: resolvedModel } : {}),
    ...(superCC ? { superCC: 'true' } : {}),
    ...(resolvedPromptMode !== 'message' ? { promptMode: resolvedPromptMode } : {}),
    ...(simulationId ? { simulationId } : {}),
  });

  console.log(`✓ Sidekick created: ${sidekick.id}${name ? ` (${name})` : ''}${resolvedModel ? ` [${resolvedModel}]` : ''}${superCC ? ' [super-cc]' : ''}${resolvedPromptMode === 'system' ? ' [system-prompt]' : ''}`);
  console.log(`  Source: ${source}${chatId ? ` (${chatId})` : ''}${squad ? ` Squad: ${squad}` : ''}`);

  // Spawn the session
  let paneId;
  try {
    paneId = await tmux.spawnSession({
      ...sidekick,
      id: sidekick.id,
      initialText: prompt,
      aiInitiated: true,
      name,
      squad,
      model: resolvedModel,
      promptMode: resolvedPromptMode,
      superCC: superCC ? 'true' : undefined,
      contextFile,
      simulationId,
      identity,
      displayName,
    });
    state.updateSidekick(sidekick.id, { paneId, status: 'active' });
    console.log(`✓ Deployed in pane: ${paneId}`);
  } catch (err) {
    state.updateSidekick(sidekick.id, { status: 'failed', error: err.message });
    console.error(`✗ Failed to deploy: ${err.message}`);
    process.exit(1);
  }

  // Notify server about spawn (for super-cc forwarding)
  try {
    const port = getPort();
    const label = name || sidekick.id;
    const squadInfo = squad ? ` squad ${squad}` : '';
    const preview = prompt.slice(0, 60);
    await fetch(`http://localhost:${port}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'spawn',
        message: `${label} spawned${squadInfo}: "${preview}"`,
        excludeIds: [sidekick.id],
      }),
    });
  } catch {
    // Server might not be running — that's fine
  }

  return { id: sidekick.id, paneId };
}

// -------------------------------------------------------------------
// end - Graceful stop (30s grace period)
// -------------------------------------------------------------------

export async function end(target) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`✓ Ending ${data.ending} sidekick(s): ${data.sidekicks.join(', ')}`);
      console.log(`  30 second grace period — sidekicks wrapping up`);
    } else {
      console.error(`✗ ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// kill - Force stop (immediate)
// -------------------------------------------------------------------

export async function kill(target) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`✓ Killed ${data.killed} sidekick(s): ${data.sidekicks.join(', ')}`);
    } else {
      console.error(`✗ ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// message - Send text to another sidekick (inter-sidekick or user→sidekick)
// -------------------------------------------------------------------

export async function message(target, text, options = {}) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: options.from || '', target, text }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`✓ Delivered to ${data.delivered} sidekick(s)`);
    } else {
      console.error(`✗ ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// broadcast - Send text to all sidekicks (or filtered by squad)
// -------------------------------------------------------------------

export async function broadcast(text, options = {}) {
  const port = getPort();

  try {
    const response = await fetch(`http://localhost:${port}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: options.from || '', fromId: options.fromId || '', text, squad: options.squad || '' }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`✓ Broadcast to ${data.delivered} sidekick(s)`);
    } else {
      console.error(`✗ ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// list - Show active sidekicks
// -------------------------------------------------------------------

export async function list(options = {}) {
  const port = getPort();

  try {
    const url = new URL(`http://localhost:${port}/list`);
    if (options.squad) url.searchParams.set('squad', options.squad);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) {
      console.error(`✗ ${data.error}`);
      process.exit(1);
    }

    if (data.sidekicks.length === 0) {
      console.log('No active sidekicks');
      return;
    }

    // Print table
    console.log(`  ${'NAME'.padEnd(20)} ${'SOURCE'.padEnd(14)} ${'AGE'.padStart(6)}  SQUAD`);
    console.log(`  ${'─'.repeat(20)} ${'─'.repeat(14)} ${'─'.repeat(6)}  ${'─'.repeat(20)}`);
    for (const m of data.sidekicks) {
      const name = m.name || '(unnamed)';
      const squad = m.squad || '';
      const age = m.age < 60 ? `${m.age}m` : `${Math.floor(m.age / 60)}h${m.age % 60}m`;
      console.log(`  ${name.padEnd(20)} ${m.source.padEnd(14)} ${age.padStart(6)}  ${squad}`);
    }
  } catch (err) {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
  }
}
