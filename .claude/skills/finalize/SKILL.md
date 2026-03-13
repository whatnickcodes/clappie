---
name: finalize
description: >
  Wrap up a session by thoroughly updating project documentation (CLAUDE.md,
  memory files, docs/references), committing all changes, and pushing to the
  remote. Invoke manually at end of session. Any text after /finalize is
  treated as context describing what was done or what to focus on.
  This skill should NOT be invoked automatically by Claude.
disable-model-invocation: false
argument-hint: "[context or instructions]"
---

# Finalize Session

Wrap up the current session: update documentation, commit, and push.
Text provided after `/finalize` is context about the session — use it to
guide which documentation needs updating and what the commit message
should convey.

## Autonomy

Proceed through all phases without asking for confirmation. Stop and ask
the user ONLY when encountering:

- Merge conflicts
- Uncommitted changes that clearly predate this session and look unfamiliar
- Missing remote when the context implies pushing was expected
- Ambiguous or contradictory information about what changed

## Phase 1 — Assess

1. Review the conversation history and the user's context text (`<user_provided_args>`) to
   build a mental model of what was accomplished this session.
2. Run `git status` and `git diff` (staged + unstaged) to see the current
   state. If this is not a git repository, skip directly to Phase 2 and
   later skip Phase 3 entirely.
3. Identify which documentation layers exist in the project:
   - `CLAUDE.md` files (any level: repo root, parent dirs)
   - Auto-memory directory (`~/.claude/projects/.../memory/MEMORY.md`)
   - `docs/`, `docs/references/`, `docs/plans/`
   - `runbooks/`
   - Any other documentation conventions visible in the repo

## Phase 2 — Update Documentation

Work through each documentation layer. **Skip any layer that does not
exist or has nothing new to record.** Never create documentation files
or directories that do not already exist — only update what is there.

Follow existing project conventions. If the project's CLAUDE.md defines
information-recording principles (e.g., L1/L2/L3 tiers, frequency
thresholds), respect them.

### 2a. Memory files

- Locate the project's auto-memory `MEMORY.md` via the path shown in
  the system prompt (e.g., `~/.claude/projects/.../memory/MEMORY.md`).
- If no memory directory or `MEMORY.md` exists, **skip this step
  entirely** — do not create one.
- If it exists, update it with new learnings, patterns, gotchas, or
  corrections discovered this session.
- Remove or correct any entries that turned out to be wrong.
- Keep it concise — under 200 lines (content beyond line 200 is
  truncated when loaded).

### 2b. CLAUDE.md

- Update project-level `CLAUDE.md` if any of the following changed:
  architectural facts, deployment details, version numbers, conventions,
  reference-index entries, quick-command tables, diagnostics tables.
- Do not touch CLAUDE.md files that belong to the claude-mem plugin
  (per the user's global instructions).
- If nothing relevant changed, skip.

### 2c. docs / references / runbooks

- Update files in `docs/references/`, `docs/plans/`, `runbooks/`, or
  similar directories if session work directly affected their content
  (e.g., a known issue was fixed, a new procedure was established, a
  plan was completed).
- If nothing relevant changed, skip.

### 2d. Other documentation

- Update any other documentation files (README, architecture docs, etc.)
  only if directly impacted by session work.

## Phase 3 — Git Sync

Skip this entire phase if the project is not a git repository.

### 3a. Stage changes

- Run `git status` to review all modified/untracked files.
- Stage all files that are part of this session's work (documentation
  updates from Phase 2 + any prior code changes from the session).
- Prefer staging specific files by name over `git add -A`.
- Do NOT stage files that look like secrets (`.env`, credentials, tokens).

### 3b. Commit

- If there are no staged changes (everything was already committed),
  skip to 3c.
- Write a clear commit message summarizing the session's work. Use the
  conversation context and `<user_provided_args>` to inform the message.
- End the commit message with:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- Use a HEREDOC for the commit message to preserve formatting.

### 3c. Push

- Check if a remote is configured (`git remote -v`).
- If a remote exists, push the current branch.
- If no remote exists, skip and inform the user that changes are
  committed locally only.
- If the current branch has no upstream, use `git push -u origin HEAD`.

## Phase 3.5 — Housekeeping

Purge transient artifacts generated during the session.

### Claude Code backup files

Claude Code's Write/Edit tools create `._YYYY-MM-DDN` backup files
alongside every file they modify. These accumulate across sessions and
are redundant with git history.

After git operations complete (or after Phase 2 if not a git repo),
delete them from the project tree:

```bash
find . -name "*._????-??-??*" -type f -delete
```

Include the count of deleted files in the Phase 4 report.

## Phase 4 — Report

Provide a brief summary of what was done:

- Which documentation files were updated (and what changed)
- Which files were committed (list them)
- Whether the push succeeded
- Number of backup files purged (if any)
- Any items that were skipped and why
