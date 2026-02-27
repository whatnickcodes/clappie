# Parties — Gamified AI Swarm Simulations

Parties layers gamified simulations on top of sidekicks. You orchestrate **games** (scenario blueprints) into **simulations** (running instances with shared ledgers), assigning **identities** (persistent AI characters) and nurturing **emerged memories** (AI self-documentation across sessions).

**Division of labor:**
- **CLI (scripts):** Deterministic ops — ledger creation, dice rolls, state mutations, prompt assembly, agent spawning.
- **Claude (you):** Interpretation — reading game rules, setting initial state, providing context, monitoring sims.

## Quick Reference

```bash
# Discovery
clappie parties games                    # List games + active simulations
clappie parties rules <game>             # Print shared rules + suggested state
clappie parties cards <game>             # List players (model/identity/squad)
clappie parties card <game> <name>       # Print a player's private rules

# Simulation lifecycle: init → set state → launch
clappie parties init <game> [context]    # Create ledger, print suggested state
clappie parties set <key> <val> --sim X  # Set shared state
clappie parties set <who> <key> <val> --sim X  # Set player state
clappie parties launch <sim>             # Spawn agents + start (FAILS if state empty)
clappie parties show <sim>               # Print full ledger
clappie parties end <sim>                # End sim + kill all agents

# State ops (auto-detect sim from CLAPPIE_SIMULATION_ID or CLAPPIE_SIDEKICK_ID)
clappie parties get [who] [key]          # Read state ("me" for self)
clappie parties set <who> <key> <val> [reason]
clappie parties give <who> <key> <val> [reason]
clappie parties take <who> <key> <val> [reason]
clappie parties transfer <from> <to> <key> <amt> [reason]

# Utilities
clappie parties roll <spec>              # 1d6, 2d8+3, coin, pick "a,b,c"
clappie parties identity list
clappie parties identity show <name>

# All state commands accept --sim <id> to override auto-detection
```

## Game File Format

Game files live in `recall/parties/games/<name>.txt`. Three section types:

```
[SHARED RULES]
PREMISE:
A quiz show with a witty host and contestants competing for prize money.

MECHANICS:
- money: +200 per correct answer, -100 per wrong.
- streak: Consecutive correct answers. Resets on wrong.

RULES:
- Host asks one question at a time
- Contestants answer via message to host
- Game ends after 10 rounds

[CARD: Host | Opus]
You are the Host. You ask questions, judge answers, and manage the game.
Use give/take to update contestant scores.

[CARD: Fighter | Sonnet | @red]
You fight for the red team. Attack blue team members.

[CARD: Healer | Haiku | @blue]
You heal blue team members. Keep your squad alive.

[SUGGESTED STATE]
Everyone starts with 0 money and 0 streak.
Host doesn't need money or streak state.
```

### Sections

- **`[SHARED RULES]`** — Everyone sees this. Game premise, mechanics, rules.
- **`[CARD: Name | Model | @squad | super-cc]`** — Only that player sees this. Pipe segments after name are optional, any order. `@` prefix = squad, `super-cc` = sees all messages, otherwise = model.
- **`[SUGGESTED STATE]`** — Natural language for YOU to interpret when setting initial state.

### Player Metadata

- **Model** — `[CARD: Name | Model]`. Optional, defaults to sonnet.
- **Squad** — `[CARD: Name | @red]`. Team assignment for games with opposing sides.
- **Super-CC** — `[CARD: Name | super-cc]`. Sees all messages between all players, including DMs. Good for referees/hosts.
- **Identity** — `Identity: <name>` line inside the card content. Links a persistent identity.

## Running a Simulation

Three steps: **init**, **set state**, **launch**.

### Step 1: Init

```bash
clappie parties init <game> [extra context...]
```

Creates the ledger with all participants registered. Prints the `[suggested state]` section for you to interpret.

```bash
clappie parties init the-heist
clappie parties init the-heist use identities vex and mara
clappie parties init gameshow "today's challenge: fizzbuzz but everyone starts with 500 gold"
```

### Step 2: Set Initial State (MANDATORY)

**Read the suggested state from init output.** Interpret it — factoring in the user's extra context — and set all starting values.

```bash
SIM="<sim-id-from-init>"

# Shared state
clappie parties set vault_locks 3 --sim $SIM
clappie parties set alert 0 --sim $SIM

# Per-player state
clappie parties set mastermind money 0 --sim $SIM
clappie parties set mastermind status planning --sim $SIM
clappie parties set thief money 0 --sim $SIM
clappie parties set lookout money 0 --sim $SIM
```

**You are the interpreter.** If the user said "give everyone double gold", you double it. If they said "start with high alert", you set `alert 5` instead of `alert 0`. The CLI doesn't guess — you read the rules and decide.

### Step 3: Launch

```bash
clappie parties launch <sim-id>
```

**Launch will FAIL if state is empty.** This is a hard gate — you cannot skip step 2.

For each participant, launch:
1. Builds a context file with shared rules + private rules + identity pointer
2. Spawns a sidekick with `--context-file`, `--simulation-id`, `--identity` flags
3. Updates the ledger with the sidekick ID
4. Sets status to `active` and broadcasts START to all agents

## Ledger Commands Reference

This block is **auto-injected** via `--source parties` on spawn. Reference only:

```
═══ PARTIES COMMANDS ═══

# Read your state
clappie parties get me
clappie parties get me money

# Read someone else's state (logged if outside your squad)
clappie parties get alice money

# Modify state
clappie parties set me status "poisoned" "bitten by snake"
clappie parties give me items "sword"
clappie parties take me money 50 "bought sword"
clappie parties transfer me alice gold 100 "payment"

# Roll dice
clappie parties roll 1d20
clappie parties roll coin
clappie parties roll pick "fight,flee,negotiate"

# Talk to others
clappie sidekick message <name> "your message"
clappie sidekick broadcast "message to everyone"

═══════════════════════════
```

## Identity System

Identities and player roles are separate concepts:

- **Player role** = what you do in THIS game (mastermind, contestant, lookout). Defined in `[private rules: Name]`.
- **Identity** = who you ARE across games. Personality, values, quirks. Defined in identity templates.

Example: "Vex" is an identity — sharp, impatient, names everything after weather. In one game Vex plays the mastermind, in the next a quiz contestant, in the next a negotiator. The identity carries through; the role changes.

### Identity Templates

`recall/parties/identities/<name>.txt` — the character sheet. Personality, traits, style.

### Emerged Memories

`recall/parties/identities/emerged/<name>.txt` — the agent's soul, fully owned by the AI.

Persists between sessions. The identity template seeds it on first use, but the AI rewrites it freely. Over time it diverges from the template.

### Identity Injection

When a player's private rules include `Identity: vex`, `launch` passes `--identity vex` to the sidekick. This shows in the pane title (e.g., `mastermind (vex)`) and the identity file path is included in the context file.

## Ending a Simulation

```bash
clappie parties end <sim-id>
```

This marks the simulation as completed, kills all agents, and compiles a grouped log.

For identity-bearing agents, message them first to save emerged memory:
```bash
clappie sidekick message <name> "Simulation ending. Update your emerged memory."
# Wait ~30 seconds
clappie parties end <sim-id>
```

## Resuming a Simulation

```bash
clappie parties show <sim-id>
```

Prints the full ledger. Re-spawn participants manually with current state + event summary if needed.
