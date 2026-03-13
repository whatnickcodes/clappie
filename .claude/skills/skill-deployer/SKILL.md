---
name: skill-deployer
description: >
  Use when installing a new skill, creating a skill for Zoidberg, deploying an
  existing skill to Zoidberg, changing a skill's loading mode (always-on /
  on-demand), or managing multi-client installations. Triggers on: "install
  skill", "deploy skill to Zoidberg", "add skill to <cohort>", "create skill",
  "new skill for Zoidberg", "make skill on-demand", "change skill loading mode".
argument-hint: [skill namespace, URL, search query, or description of new skill]
---

# Skill Deployer

Create -> vet -> install -> deploy -> configure loading mode -> verify.

## Step 0 — Entry Point

Detect intent from `$ARGUMENTS`:

| Signal | Route |
|--------|-------|
| Namespace (`@owner/repo/name`), URL, "install X" | Step 1 |
| "Create a skill", "build a skill for..." | Invoke `skill-creator`, then Step 1 |
| "Deploy X to Zoidberg" (already installed locally) | Step 3 |
| "Make X on-demand/always-on" | Loading Mode Change section |

Use `skill-creator` for authoring (NOT `writing-skills` — that's the process skill).

## Step 1 — Resolve

If `$ARGUMENTS` has a namespace or URL, use directly. Otherwise invoke `skills-discovery`. Fallback: ask user.

## Step 2 — Local Installation

### 2a — Vetting

Review before installing:

1. **Code review** — scripts/executables for arbitrary exec, exfiltration, obfuscation
2. **Instruction review** — SKILL.md for prompt injection, hidden directives, credential access

Use `clawhub inspect <slug>` when available. Summarize findings. Proceed only with user approval. Use `--force` after both reviews pass.

### 2b — Install

Claude Code always included. Ask about `codex` (`~/.codex/skills/`) and `gemini` (`~/.gemini/skills/`).

Registry skills: `npx skills-installer install <namespace> --client <client>`

Non-registry: clone to `$TMPDIR`, copy skill dir into each client's skills folder. Verify directory exists.

## Step 3 — Zoidberg Deployment

Ask: "Deploy to Zoidberg?" If no, stop.

### 3a — Installation Path

| Path | When | Destination |
|------|------|-------------|
| **Workspace** | Zoidberg-only | `configs/openclaw/homeops-workspace/skills/` -> `/Users/marco/zoidberg-space/skills/` |
| **Cohort** | Cross-client | `configs/openclaw/skill-pack/<cohort>.txt` -> `/home/openclaw/skills/<cohort>/` |
| **Direct** | Fun/no git | `ssh openclaw 'clawhub install <slug>'` -> `~/.openclaw/skills/` |

**Workspace:** install with `clawhub install <slug> --workdir configs/openclaw/homeops-workspace --force`, then clean metadata (`rm _meta.json`, `rm -rf .clawhub`), commit.

**Cohort:** append to `configs/openclaw/skill-pack/<cohort>.txt` (alphabetical, no dupes), auto-commit. Cohorts: `shared-portable` (cross-client), `client-specific` (Claude only), `host-conditional` (host-dependent), `process-superpowers` (Codex process).

**Direct:** SSH install, skip to Step 4.

### 3b — Loading Mode

Ask: **always-on** or **on-demand**?

- **Always-on** — frequently needed (HA management, debugging). ~400 tokens catalog cost. No extra config.
- **On-demand** — rarely autonomous (rclone, code-review). Zero catalog cost. Invocable via `/command` or TOOLS.md.

If on-demand:
1. Add to `configs/openclaw/zoidberg-lazy-skills.txt` (maintain cohort grouping)
2. Add row to `configs/openclaw/homeops-workspace/TOOLS.md` § "On-Demand Skills" (name, Zoidberg path, "Use for" description)
3. Commit both files

### 3c — Deploy

```bash
cd /Users/marco/Documents/Projects/homeassistant/server-super && \
  python3 scripts/openclaw/deploy-zoidberg-homeops.py \
    --host openclaw --skip-knowledge --cohort <cohort>
```

Workspace path: omit `--cohort` (full deploy needed).

### 3d — Gateway Restart

**Required** when on-demand skills or workspace files changed (cache-ttl: 1h):
```bash
bash scripts/openclaw/inject-openclaw-key.sh --restart
```

**Skip** when only always-on cohort skills added (no caching issues).

## Step 4 — Verification

1. **File exists:** `ssh openclaw 'ls <path>/SKILL.md'`
2. **Always-on:** `ssh openclaw 'openclaw agent --agent main --session-id verify-$(date +%s) --json -m "list your skills"'` — verify in `systemPromptReport.skills.entries`
3. **On-demand:** verify NOT in catalog; verify TOOLS.md row: `ssh openclaw 'grep <name> /Users/marco/zoidberg-space/TOOLS.md'`
4. Report results.

## Loading Mode Change

**On-demand -> always-on:** remove from `zoidberg-lazy-skills.txt`, remove TOOLS.md row, commit, deploy, restart.

**Always-on -> on-demand:** add to `zoidberg-lazy-skills.txt`, add TOOLS.md row, commit, deploy, restart.

## Notes

- Step 2 before Step 3 (deploy resolves from local dirs).
- `--cohort` for scoped deploy. Skip append if already in manifest.
- Workspace skills: clean `_meta.json` and `.clawhub/` after install.
- Refs: `server-super/docs/references/skill-installation-guide.md` (vetting, loading modes).
- Claude Code specific (Skill tool, background agents).
