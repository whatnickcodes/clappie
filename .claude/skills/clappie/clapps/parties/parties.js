#!/usr/bin/env bun
// Parties — gamified AI swarm simulation skill
// CLI handles deterministic ops (ledger, dice, state, spawning).
// Two-step flow: init (build ledger) → launch (spawn agents + start).

export const meta = {
  name: 'parties',
  description: 'Gamified AI swarm simulations',
  commands: [
    { cmd: 'games', desc: 'List games + active simulations' },
    { cmd: 'init <game>', desc: 'Parse game, build ledger with participants' },
    { cmd: 'launch <sim>', desc: 'Spawn all agents and start the simulation' },
    { cmd: 'show <sim>', desc: 'Print full ledger' },
    { cmd: 'end <sim>', desc: 'End simulation and kill agents' },
    { cmd: 'rules <game>', desc: 'Print shared rules + suggested state' },
    { cmd: 'cards <game>', desc: 'List players in a game' },
    { cmd: 'card <game> <name>', desc: 'Print a player\'s private rules' },
    { cmd: 'get [who] [key]', desc: 'Read state value(s)' },
    { cmd: 'set <key> <val>', desc: 'Set shared state' },
    { cmd: 'set <who> <key> <val> [reason]', desc: 'Set player state' },
    { cmd: 'give <who> <key> <val> [reason]', desc: 'Add to state (numeric/list)' },
    { cmd: 'take <who> <key> <val> [reason]', desc: 'Remove from state (numeric/list)' },
    { cmd: 'transfer <from> <to> <key> <amt> [reason]', desc: 'Atomic transfer between participants' },
    { cmd: 'roll <spec>', desc: 'Roll dice: 1d6, 2d8+3, coin, pick "a,b,c"' },
    { cmd: 'identity list', desc: 'List all identities' },
    { cmd: 'identity show <name>', desc: 'Show identity + emerged memory' },
  ],
};

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const CLAPPIE_JS = join(PROJECT_ROOT, '.claude', 'skills', 'clappie', 'clappie.js');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function parseFlags(args, ...flags) {
  const result = {};
  const flagIndices = new Set();
  for (const flag of flags) {
    const idx = args.indexOf(`--${flag}`);
    result[flag] = idx !== -1 ? args[idx + 1] : undefined;
    if (idx !== -1) { flagIndices.add(idx); flagIndices.add(idx + 1); }
  }
  result.positional = args.filter((_, i) => !flagIndices.has(i));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DICE ROLLING
// ─────────────────────────────────────────────────────────────────────────────

function rollDice(spec) {
  spec = spec.trim().toLowerCase();

  if (spec === 'coin') {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    return { spec: 'coin', result, display: `🪙 ${result}` };
  }

  if (spec.startsWith('pick')) {
    const items = spec.replace(/^pick\s*/, '').replace(/^["']|["']$/g, '').split(',').map(s => s.trim()).filter(Boolean);
    if (items.length === 0) throw new Error('pick requires comma-separated options');
    const chosen = items[Math.floor(Math.random() * items.length)];
    return { spec: `pick(${items.join(',')})`, result: chosen, display: `🎲 picked: ${chosen}` };
  }

  const match = spec.match(/^(\d+)?d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Invalid dice spec: ${spec}. Use NdS, NdS+M, coin, or pick "a,b,c"`);

  const count = parseInt(match[1] || '1');
  const sides = parseInt(match[2]);
  const modifier = parseInt(match[3] || '0');

  if (count < 1 || count > 100) throw new Error('Dice count must be 1-100');
  if (sides < 2 || sides > 1000) throw new Error('Dice sides must be 2-1000');

  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
  const rollsStr = rolls.length > 1 ? ` [${rolls.join(', ')}]` : '';
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : '';

  return {
    spec: `${count}d${sides}${modStr}`,
    result: sum,
    rolls,
    modifier,
    display: `🎲 ${count}d${sides}${modStr} = ${bold(String(sum))}${rollsStr}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT — Parse game, build full ledger with participants + initial state
// ─────────────────────────────────────────────────────────────────────────────

async function cmdInit(gameName, extraContext) {
  const { readGame, listPlayers, readPlayerMeta, readSuggestedState, ensureEmergedFile } = await import('./lib/game.js');
  const { createLedger, readLedger, writeLedger, acquireLock, releaseLock } = await import('./lib/ledger.js');

  // Read game and create ledger
  readGame(gameName); // validates game exists
  const { simulationId } = createLedger(gameName);

  // Parse [private rules: Name] sections and register participants
  const players = listPlayers(gameName);
  if (players.length === 0) {
    console.log(yellow(`⚠ No [private rules: ...] sections found in ${gameName}. Ledger created with no participants.`));
    console.log(`${green('✓')} Ledger: ${cyan(simulationId)}`);
    return;
  }

  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);

    for (const playerName of players) {
      const meta = readPlayerMeta(gameName, playerName);
      const slug = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const participant = { model: meta?.model || 'sonnet', displayName: playerName };

      if (meta?.identity) {
        participant.identity = meta.identity;
        ensureEmergedFile(meta.identity);
      }
      if (meta?.squad) {
        participant.squad = meta.squad;
      }
      if (meta?.superCC) {
        participant.superCC = true;
      }

      ledger.participants[slug] = participant;
      ledger.events.push(`${new Date().toISOString().slice(11, 16)} | system | registered ${slug} [${participant.model}]${meta?.identity ? ` identity=${meta.identity}` : ''}`);
    }

    if (extraContext) {
      ledger.meta.context = extraContext;
    }
    writeLedger(simulationId, ledger);
  } finally {
    releaseLock(simulationId);
  }

  // Print summary + suggested state for AI to interpret
  console.log(bold(`\n═══ INIT: ${gameName} ═══\n`));
  console.log(`${green('✓')} Ledger: ${cyan(simulationId)}`);
  console.log(`  Participants: ${players.map(p => cyan(p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))).join(', ')}`);
  if (extraContext) {
    console.log(`  Context: ${dim(extraContext)}`);
  }

  const suggestedState = readSuggestedState(gameName);
  if (suggestedState) {
    console.log(bold(`\n═══ SUGGESTED STATE ═══\n`));
    console.log(suggestedState);
  }

  console.log(yellow(`\n⚠ SET INITIAL STATE before launching.`));
  console.log(`  clappie parties set <key> <val> --sim ${simulationId}`);
  console.log(`  clappie parties set <who> <key> <val> --sim ${simulationId}`);
  console.log(dim(`\nThen: clappie parties launch ${simulationId}\n`));
}

// ─────────────────────────────────────────────────────────────────────────────
// LAUNCH — Spawn all agents and start the simulation
// ─────────────────────────────────────────────────────────────────────────────

async function cmdLaunch(simId) {
  const { readLedger, writeLedger, acquireLock, releaseLock } = await import('./lib/ledger.js');
  const { readSharedRules, readPrivateRules } = await import('./lib/game.js');

  if (!simId) {
    console.error('Usage: parties launch <simulation-id>');
    process.exit(1);
  }

  const ledger = readLedger(simId);

  if (ledger.meta.status === 'active') {
    console.log(dim(`Simulation ${simId} is already active`));
    return;
  }
  if (ledger.meta.status !== 'loading') {
    console.log(dim(`Simulation ${simId} status is ${ledger.meta.status}, cannot launch`));
    return;
  }

  const gameName = ledger.meta.game;
  const participants = Object.entries(ledger.participants);

  if (participants.length === 0) {
    console.error(`✗ No participants in simulation ${simId}. Run init first.`);
    process.exit(1);
  }

  // Hard gate: state must be set before launching
  if (Object.keys(ledger.state).length === 0) {
    console.error(`✗ State is empty. Set initial state before launching.`);
    console.error(`  Read suggested state: clappie parties rules ${gameName}`);
    console.error(`  Set state: clappie parties set <who> <key> <val> --sim ${simId}`);
    process.exit(1);
  }

  // Read shared rules once
  let sharedRules = '';
  try { sharedRules = readSharedRules(gameName) || ''; } catch {}

  console.log(bold(`\n═══ LAUNCH: ${simId} ═══\n`));

  // Pre-compute team structure for communication section
  const hasSquads = participants.some(([, info]) => info.squad);
  const squads = {};
  if (hasSquads) {
    for (const [s, info] of participants) {
      const team = info.squad || 'unassigned';
      if (!squads[team]) squads[team] = [];
      squads[team].push(s);
    }
  }

  // Spawn each participant
  for (const [slug, info] of participants) {
    // slug is the ledger key (already slugified at init)
    // info.displayName is the original card name for game file lookups + pane title

    // Build context file: shared rules + private rules + communication + identity
    const contextLines = [];

    if (ledger.meta.context) {
      contextLines.push(`═══ TASK ═══\n\n${ledger.meta.context}`);
    }

    if (sharedRules) {
      contextLines.push(`═══ GAME RULES ═══\n\n${sharedRules}`);
    }

    // Read private rules (use displayName for game file lookup)
    try {
      const privateRules = readPrivateRules(gameName, info.displayName || slug);
      if (privateRules) {
        // Strip metadata lines (already parsed into ledger)
        const cleaned = privateRules
          .split('\n')
          .filter(l => !l.match(/^(Model|Identity):\s/i))
          .join('\n')
          .trim();
        if (cleaned) {
          contextLines.push(`═══ YOUR ROLE ═══\n\n${cleaned}`);
        }
      }
    } catch {}

    // Communication section — adapts to team structure
    const commLines = [`You are: ${slug}`];
    const others = participants.filter(([s]) => s !== slug).map(([s]) => s);

    if (info.superCC) {
      // Super-CC — full visibility, sees all messages and all teams
      if (hasSquads) {
        for (const [team, members] of Object.entries(squads)) {
          if (team === 'unassigned') {
            const otherUnassigned = members.filter(s => s !== slug);
            if (otherUnassigned.length > 0) commLines.push(`Other players: ${otherUnassigned.join(', ')}`);
          } else {
            commLines.push(`Team ${team}: ${members.join(', ')}`);
          }
        }
      } else {
        commLines.push(`Other players: ${others.join(', ')}`);
      }
      commLines.push('');
      commLines.push('You have FULL VISIBILITY — you see all messages between all players, including DMs.');
      commLines.push('');
      commLines.push('Commands:');
      commLines.push('  clappie sidekick message <name> "text"   — DM one player');
      commLines.push('  clappie sidekick broadcast "text"         — message everyone');
    } else if (hasSquads && info.squad) {
      // On a team — show teammates vs other teams
      const myTeam = squads[info.squad].filter(s => s !== slug);
      const otherTeams = Object.entries(squads).filter(([team]) => team !== info.squad);

      commLines.push(`Your team: ${info.squad}`);
      if (myTeam.length > 0) {
        commLines.push(`Teammates: ${myTeam.join(', ')}`);
      }
      for (const [team, members] of otherTeams) {
        if (team === 'unassigned') {
          commLines.push(`Other players: ${members.join(', ')}`);
        } else {
          commLines.push(`Team ${team}: ${members.join(', ')}`);
        }
      }
      commLines.push('');
      commLines.push('Commands:');
      commLines.push('  clappie sidekick message <name> "text"   — DM one player');
      commLines.push('  clappie sidekick broadcast "text"         — message ALL players (both teams!)');
      commLines.push('');
      commLines.push('Use DMs for team strategy. Broadcasts are heard by everyone, including opponents.');
    } else if (hasSquads) {
      // No team in a game with teams — sees team structure but not all messages
      for (const [team, members] of Object.entries(squads)) {
        if (team === 'unassigned') {
          const otherUnassigned = members.filter(s => s !== slug);
          if (otherUnassigned.length > 0) commLines.push(`Other players: ${otherUnassigned.join(', ')}`);
        } else {
          commLines.push(`Team ${team}: ${members.join(', ')}`);
        }
      }
      commLines.push('');
      commLines.push('Commands:');
      commLines.push('  clappie sidekick message <name> "text"   — DM one player');
      commLines.push('  clappie sidekick broadcast "text"         — message everyone');
    } else {
      // No teams — simple list
      commLines.push(`Other players: ${others.join(', ')}`);
      commLines.push('');
      commLines.push('Commands:');
      commLines.push('  clappie sidekick message <name> "text"   — DM one player');
      commLines.push('  clappie sidekick broadcast "text"         — message everyone');
    }

    contextLines.push(`═══ COMMUNICATION ═══\n\n${commLines.join('\n')}`);

    // Identity file pointer — absolute path so dumb models can't guess wrong
    if (info.identity) {
      contextLines.push(`Identity file: ${PROJECT_ROOT}/recall/parties/identities/emerged/${info.identity}.txt\nThis is YOUR file. Read it now, update it as you play.`);
    } else {
      contextLines.push(`You have NO identity file. Do NOT create one. Do NOT write files outside of commands.`);
    }

    // Write context file
    const contextPath = `/tmp/party-ctx-${simId}-${slug}.txt`;
    writeFileSync(contextPath, contextLines.join('\n\n'), 'utf8');

    // Spawn sidekick
    const spawnArgs = [
      'bun', CLAPPIE_JS, 'sidekick', 'spawn',
      '--name', slug,
      ...(info.displayName ? ['--display-name', info.identity ? `${info.displayName} => ${info.identity}` : info.displayName] : []),
      '--source', 'parties',
      ...(info.squad ? ['--squad', info.squad] : []),
      '--context-file', contextPath,
      '--simulation-id', simId,
      ...(info.model ? ['--model', info.model] : []),
      ...(info.identity ? ['--identity', info.identity] : []),
      ...(info.superCC ? ['--super-cc'] : []),
      '(party)', // minimal prompt text (context file has the real content)
    ];

    const result = spawnSync(spawnArgs[0], spawnArgs.slice(1), { encoding: 'utf8' });

    // Parse sidekick ID from output
    const idMatch = result.stdout?.match(/Sidekick created: (\S+)/);
    const sidekickId = idMatch ? idMatch[1] : null;

    if (sidekickId) {
      // Update ledger with sidekick ID
      await acquireLock(simId);
      try {
        const fresh = readLedger(simId);
        if (fresh.participants[slug]) {
          fresh.participants[slug].sidekick = sidekickId;
        }
        fresh.events.push(`${new Date().toISOString().slice(11, 16)} | system | spawned ${slug} → ${sidekickId}`);
        writeLedger(simId, fresh);
      } finally {
        releaseLock(simId);
      }
      console.log(`  ${green('✓')} ${cyan(info.displayName || slug)} ${dim(`[${info.model || 'sonnet'}]`)} → ${dim(sidekickId)}`);
    } else {
      console.log(`  ${red('✗')} ${cyan(info.displayName || slug)} failed to spawn`);
      if (result.stderr) console.log(`    ${dim(result.stderr.trim().slice(0, 100))}`);
    }
  }

  // Set status to active
  await acquireLock(simId);
  try {
    const fresh = readLedger(simId);
    fresh.meta.status = 'active';
    fresh.events.push(`${new Date().toISOString().slice(11, 16)} | system | simulation started — all agents launched`);
    writeLedger(simId, fresh);
  } finally {
    releaseLock(simId);
  }

  // Broadcast START
  const msg = `🟢 ALL AGENTS LOADED — SIMULATION START! You may now act freely.`;
  spawnSync('bun', [CLAPPIE_JS, 'sidekick', 'broadcast', msg], { stdio: 'inherit' });

  console.log(`\n${green('✓')} Simulation ${cyan(simId)} launched with ${participants.length} agents`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOW — Print full ledger (replaces resume)
// ─────────────────────────────────────────────────────────────────────────────

async function cmdShow(simId) {
  const { readLedger, formatLedger } = await import('./lib/ledger.js');

  if (!simId) {
    console.error('Usage: parties show <simulation-id>');
    process.exit(1);
  }

  const ledger = readLedger(simId);

  // Always compile the grouped log (works live during sim or after)
  try {
    const { compileGroupedLog } = await import('./lib/grouped-log.js');
    const logPath = compileGroupedLog(ledger, simId);
    if (logPath) console.log(dim(`Grouped log updated: ${logPath}`));
  } catch {}

  console.log(bold(`\n═══ LEDGER: ${simId} ═══\n`));
  console.log(formatLedger(ledger));
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS / END / GAMES / RULES / CARDS — unchanged
// ─────────────────────────────────────────────────────────────────────────────

async function cmdEnd(simId) {
  const { readLedger, writeLedger, acquireLock, releaseLock } = await import('./lib/ledger.js');

  await acquireLock(simId);
  let ledger;
  try {
    ledger = readLedger(simId);
    if (ledger.meta.status === 'completed') {
      console.log(dim(`Simulation ${simId} is already completed`));
      try {
        const { existsSync } = await import('fs');
        const logPath = join(PROJECT_ROOT, 'recall', 'logs', 'parties', `${simId}.txt`);
        if (!existsSync(logPath)) {
          const { compileGroupedLog } = await import('./lib/grouped-log.js');
          const result = compileGroupedLog(ledger, simId);
          if (result) console.log(`${green('✓')} Grouped log: ${dim(result)}`);
        } else {
          console.log(dim(`Grouped log: ${logPath}`));
        }
      } catch {}
      return;
    }
    ledger.meta.status = 'completed';
    ledger.events.push(`${new Date().toISOString().slice(11, 16)} | system | simulation ended`);
    writeLedger(simId, ledger);
  } finally {
    releaseLock(simId);
  }

  console.log(`${green('✓')} Simulation ${cyan(simId)} marked as completed`);

  // Kill sidekicks directly (slugify — card names may have spaces)
  const names = Object.entries(ledger.participants)
    .filter(([, info]) => info.sidekick)
    .map(([name]) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));

  if (names.length > 0) {
    for (const name of names) {
      try {
        const result = spawnSync('bun', [CLAPPIE_JS, 'sidekick', 'kill', name], { encoding: 'utf8' });
        if (result.stdout?.includes('Killed')) {
          console.log(`${green('✓')} Killed ${cyan(name)}`);
        } else {
          console.log(dim(`  ${name}: already stopped`));
        }
      } catch {}
    }
  }

  try {
    const { compileGroupedLog } = await import('./lib/grouped-log.js');
    const logPath = compileGroupedLog(ledger, simId);
    if (logPath) console.log(`${green('✓')} Grouped log: ${dim(logPath)}`);
  } catch (e) {
    console.log(yellow(`⚠ Could not compile grouped log: ${e.message}`));
  }
}

async function cmdGames() {
  const { listGames } = await import('./lib/game.js');
  const { listActiveSimulations } = await import('./lib/ledger.js');

  // Active sims first
  const sims = listActiveSimulations();
  if (sims.length > 0) {
    console.log(bold('\nActive Simulations\n'));
    for (const sim of sims) {
      console.log(`  ${cyan(sim.id)}`);
      console.log(`    Game: ${sim.game}  Started: ${dim(sim.started)}`);
      console.log(`    Participants: ${sim.participants.join(', ')}`);
    }
  }

  // Available games
  const games = listGames();
  if (games.length === 0) {
    if (sims.length === 0) {
      console.log(dim('No games found and no active simulations'));
      console.log(dim(`Create games in recall/parties/games/<name>.txt`));
    }
    return;
  }
  console.log(bold('\nGames\n'));
  for (const name of games) { console.log(`  ${cyan(name)}`); }
  console.log('');
}

async function cmdRules(gameName) {
  const { readSharedRules, readSuggestedState } = await import('./lib/game.js');
  if (!gameName) { console.error('Usage: parties rules <game>'); process.exit(1); }
  const rules = readSharedRules(gameName);
  if (rules) {
    console.log(bold(`\n═══ SHARED RULES: ${gameName} ═══\n`));
    console.log(rules);
  }
  const suggested = readSuggestedState(gameName);
  if (suggested) {
    console.log(bold(`\n═══ SUGGESTED STATE ═══\n`));
    console.log(suggested);
  }
  console.log('');
}

async function cmdCards(gameName) {
  const { listPlayers, readPlayerMeta } = await import('./lib/game.js');
  if (!gameName) { console.error('Usage: parties cards <game>'); process.exit(1); }
  const players = listPlayers(gameName);
  if (players.length === 0) { console.log(dim('No players in this game')); return; }
  console.log(bold(`\nPlayers in ${gameName}\n`));
  for (const name of players) {
    const meta = readPlayerMeta(gameName, name);
    const model = meta?.model ? dim(` [${meta.model}]`) : '';
    const identity = meta?.identity ? dim(` identity=${meta.identity}`) : '';
    const squad = meta?.squad ? dim(` @${meta.squad}`) : '';
    const superCC = meta?.superCC ? yellow(' super-cc') : '';
    console.log(`  ${cyan(name)}${model}${identity}${squad}${superCC}`);
  }
  console.log('');
}

async function cmdCard(gameName, cardName) {
  const { readPrivateRules } = await import('./lib/game.js');
  if (!gameName || !cardName) { console.error('Usage: parties card <game> <card>'); process.exit(1); }
  const rules = readPrivateRules(gameName, cardName);
  if (!rules) { console.error(`Player "${cardName}" not found in ${gameName}`); process.exit(1); }
  console.log(bold(`\n═══ ${cardName} (${gameName}) ═══\n`));
  console.log(rules);
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE OPERATIONS — unchanged
// ─────────────────────────────────────────────────────────────────────────────

async function cmdGet(args) {
  const { readLedger, getState, resolveSimulationId, resolveName, resolveActor, isSameSquad } = await import('./lib/ledger.js');
  const { sim: simId, positional } = parseFlags(args, 'sim');
  const resolvedSimId = resolveSimulationId(simId);
  const ledger = readLedger(resolvedSimId);
  const who = positional[0] ? resolveName(positional[0], ledger) : null;
  const key = positional[1] || null;

  if (!who) {
    for (const [path, val] of Object.entries(ledger.state)) { console.log(`${path} = ${val}`); }
    return;
  }

  const result = getState(ledger, who, key);
  const actor = resolveActor(ledger);
  if (actor !== 'user' && actor !== who && !isSameSquad(ledger, actor, who)) {
    console.log(yellow(`(👀 outside your squad)`));
    const { appendEvent } = await import('./lib/ledger.js');
    appendEvent(resolvedSimId, actor, `peek at ${who}${key ? '.' + key : ''}`);
  }

  if (result === null) { console.log(dim('(no value)')); }
  else if (typeof result === 'object') { for (const [k, v] of Object.entries(result)) { console.log(`${who}.${k} = ${v}`); } }
  else { console.log(result); }
}

async function cmdSet(args) {
  const { setState, setSharedState, resolveSimulationId, readLedger, resolveName, resolveActor } = await import('./lib/ledger.js');
  const { notifyStateChange } = await import('./lib/notify.js');
  const { sim: simId, positional } = parseFlags(args, 'sim');

  // Support both: set <key> <value> (shared) and set <who> <key> <value> (per-participant)
  if (positional.length >= 3) {
    // Per-participant: set <who> <key> <value> [reason]
    const who = positional[0], key = positional[1], value = positional[2], reason = positional[3] || '';
    const resolvedSimId = resolveSimulationId(simId);
    const ledger = readLedger(resolvedSimId);
    const resolvedWho = resolveName(who, ledger);
    const actor = resolveActor(ledger);
    const result = await setState(resolvedSimId, resolvedWho, key, value, actor, reason);
    console.log(`${resolvedWho}.${key} = ${result.new} ${dim(`(was ${result.old})`)}`);
    await notifyStateChange(result.ledger, resolvedWho, key, result.old, result.new, reason || null, actor);
  } else if (positional.length === 2) {
    // Shared: set <key> <value>
    const key = positional[0], value = positional[1];
    const resolvedSimId = resolveSimulationId(simId);
    const actor = resolveActor(readLedger(resolvedSimId));
    const result = await setSharedState(resolvedSimId, key, value, actor);
    console.log(`${key} = ${result.new} ${dim(`(was ${result.old})`)}`);
  } else {
    console.error('Usage: parties set <key> <value> [--sim id]');
    console.error('       parties set <who> <key> <value> [reason] [--sim id]');
    process.exit(1);
  }
}

async function cmdGive(args) {
  const { giveState, resolveSimulationId, readLedger, resolveName, resolveActor } = await import('./lib/ledger.js');
  const { notifyStateChange } = await import('./lib/notify.js');
  const { sim: simId, positional } = parseFlags(args, 'sim');
  const who = positional[0], key = positional[1], value = positional[2], reason = positional[3] || '';
  if (!who || !key || value === undefined) { console.error('Usage: parties give <who> <key> <val> [reason] [--sim id]'); process.exit(1); }
  const resolvedSimId = resolveSimulationId(simId);
  const ledger = readLedger(resolvedSimId);
  const resolvedWho = resolveName(who, ledger);
  const actor = resolveActor(ledger);
  const result = await giveState(resolvedSimId, resolvedWho, key, value, actor, reason);
  console.log(`${resolvedWho}.${key} = ${result.new} ${dim(`(was ${result.old})`)}`);
  await notifyStateChange(result.ledger, resolvedWho, key, result.old, result.new, reason, actor);
}

async function cmdTake(args) {
  const { takeState, resolveSimulationId, readLedger, resolveName, resolveActor } = await import('./lib/ledger.js');
  const { notifyStateChange } = await import('./lib/notify.js');
  const { sim: simId, positional } = parseFlags(args, 'sim');
  const who = positional[0], key = positional[1], value = positional[2], reason = positional[3] || '';
  if (!who || !key || value === undefined) { console.error('Usage: parties take <who> <key> <val> [reason] [--sim id]'); process.exit(1); }
  const resolvedSimId = resolveSimulationId(simId);
  const ledger = readLedger(resolvedSimId);
  const resolvedWho = resolveName(who, ledger);
  const actor = resolveActor(ledger);
  const result = await takeState(resolvedSimId, resolvedWho, key, value, actor, reason);
  console.log(`${resolvedWho}.${key} = ${result.new} ${dim(`(was ${result.old})`)}`);
  await notifyStateChange(result.ledger, resolvedWho, key, result.old, result.new, reason, actor);
}

async function cmdTransfer(args) {
  const { transferState, resolveSimulationId, readLedger, resolveName, resolveActor } = await import('./lib/ledger.js');
  const { notifyStateChange } = await import('./lib/notify.js');
  const { sim: simId, positional } = parseFlags(args, 'sim');
  const from = positional[0], to = positional[1], key = positional[2], amount = positional[3], reason = positional[4] || '';
  if (!from || !to || !key || amount === undefined) { console.error('Usage: parties transfer <from> <to> <key> <amt> [reason] [--sim id]'); process.exit(1); }
  const resolvedSimId = resolveSimulationId(simId);
  const ledger = readLedger(resolvedSimId);
  const resolvedFrom = resolveName(from, ledger);
  const resolvedTo = resolveName(to, ledger);
  const actor = resolveActor(ledger);
  const result = await transferState(resolvedSimId, resolvedFrom, resolvedTo, key, amount, actor, reason);
  console.log(`${resolvedFrom}.${key} = ${result.from.new} ${dim(`(was ${result.from.old})`)}`);
  console.log(`${resolvedTo}.${key} = ${result.to.new} ${dim(`(was ${result.to.old})`)}`);
  await notifyStateChange(result.ledger, resolvedFrom, key, result.from.old, result.from.new, reason, actor);
  await notifyStateChange(result.ledger, resolvedTo, key, result.to.old, result.to.new, reason, actor);
}

async function cmdRoll(args) {
  const { sim: simId, positional } = parseFlags(args, 'sim');
  const spec = positional.join(' ');
  if (!spec) { console.error('Usage: parties roll <spec>\n  Examples: 1d6, 2d8+3, coin, pick "red,blue,green"'); process.exit(1); }
  const result = rollDice(spec);
  console.log(result.display);
  if (simId || process.env.CLAPPIE_SIDEKICK_ID || process.env.CLAPPIE_SIMULATION_ID) {
    try {
      const { resolveSimulationId, readLedger, resolveActor, appendEvent } = await import('./lib/ledger.js');
      const resolvedSimId = resolveSimulationId(simId);
      const ledger = readLedger(resolvedSimId);
      const actor = resolveActor(ledger);
      appendEvent(resolvedSimId, actor, `roll ${result.spec} = ${result.result}`);
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY — unchanged
// ─────────────────────────────────────────────────────────────────────────────

async function cmdIdentityList() {
  const { listIdentities } = await import('./lib/game.js');
  const identities = listIdentities();
  if (identities.length === 0) { console.log(dim('No identities found')); console.log(dim(`Create them in recall/parties/identities/<name>.txt`)); return; }
  console.log(bold('\nIdentities\n'));
  for (const id of identities) {
    const emerged = id.hasEmerged ? green(' ✦ emerged') : '';
    console.log(`  ${cyan(id.name)}${emerged}`);
  }
  console.log('');
}

async function cmdIdentityShow(name) {
  const { readIdentity, readEmergedMemory } = await import('./lib/game.js');
  if (!name) { console.error('Usage: parties identity show <name>'); process.exit(1); }
  const identity = readIdentity(name);
  console.log(bold(`\n═══ IDENTITY: ${name} ═══\n`));
  console.log(identity);
  const emerged = readEmergedMemory(name);
  if (emerged) { console.log(bold(`\n═══ EMERGED MEMORY ═══\n`)); console.log(emerged); }
  else { console.log(dim('\n(no emerged memory yet)\n')); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'init':
        if (!args[1]) { console.error('Usage: parties init <game> [extra context...]'); process.exit(1); }
        await cmdInit(args[1], args.slice(2).join(' ') || null);
        break;

      case 'launch':
        await cmdLaunch(args[1]);
        break;

      case 'show':
        if (!args[1]) { console.error('Usage: parties show <simulation-id>'); process.exit(1); }
        await cmdShow(args[1]);
        break;


      case 'end':
        if (!args[1]) { console.error('Usage: parties end <simulation-id>'); process.exit(1); }
        await cmdEnd(args[1]);
        break;

      case 'games':
        await cmdGames();
        break;

      case 'rules':
        await cmdRules(args[1]);
        break;

      case 'cards':
        await cmdCards(args[1]);
        break;

      case 'card':
        await cmdCard(args[1], args[2]);
        break;

      case 'get':
        await cmdGet(args.slice(1));
        break;

      case 'set':
        await cmdSet(args.slice(1));
        break;

      case 'give':
        await cmdGive(args.slice(1));
        break;

      case 'take':
        await cmdTake(args.slice(1));
        break;

      case 'transfer':
        await cmdTransfer(args.slice(1));
        break;

      case 'roll':
        await cmdRoll(args.slice(1));
        break;

      case 'identity':
        if (args[1] === 'list') { await cmdIdentityList(); }
        else if (args[1] === 'show') { await cmdIdentityShow(args[2]); }
        else { console.error('Usage: parties identity <list|show <name>>'); process.exit(1); }
        break;

      default:
        console.log(`${bold('Parties')} — Gamified AI Swarm Simulations

${bold('Simulation:')}
  ${green('init <game>')}                    Parse game, build ledger with participants
  ${green('launch <sim>')}                   Spawn all agents and start simulation
  ${green('show <sim>')}                     Print full ledger
  ${green('status [sim]')}                   Show simulation status
  ${green('end <sim>')}                      Mark simulation completed

${bold('Game Files:')}
  ${green('games')}                          List available game files
  ${green('rules <game>')}                   Print universal rules section
  ${green('cards <game>')}                   List character cards + metadata
  ${green('card <game> <card>')}             Print a specific card

${bold('State Operations:')}
  ${green('get [who] [key]')}                Read state ("me" = auto-detect)
  ${green('set <who> <key> <val> [reason]')} Set state value
  ${green('give <who> <key> <val> [reason]')} Add to numeric / append to list
  ${green('take <who> <key> <val> [reason]')} Subtract / remove from list
  ${green('transfer <from> <to> <key> <amt>')} Atomic give+take

${bold('Utilities:')}
  ${green('roll <spec>')}                    1d6, 2d8+3, coin, pick "a,b,c"
  ${green('identity list')}                  List all identities
  ${green('identity show <name>')}           Show identity + emerged memory

${bold('Options:')}
  ${dim('--sim <id>')}    Specify simulation (auto-detected inside sidekicks)

${bold('Flow:')}
  1. ${cyan('clappie parties init the-heist')}     # builds ledger
  2. ${cyan('clappie parties launch <sim-id>')}     # spawns agents + starts
`);
    }
  } catch (err) {
    console.error(`${red('✗')} ${err.message}`);
    process.exit(1);
  }
}
