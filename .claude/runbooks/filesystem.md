# Filesystem Access & Washnotes

## Access Scope

Full read/write/exec on the Zoidberg host within the `wash` account boundary.

## homeops repo: restricted writes

Read anything in `/home/wash/homeops`. Write only to:

    /home/wash/homeops/washnotes/

All other paths in that repo are read-only. GitHub push validation enforces this.

## When to write washnotes

- After a substantive investigation confirming an operational pattern, failure mode, or root cause.
- After detecting a doc/reality mismatch during health checks.
- During heartbeat or autonomous sessions: write without asking (operator not present).

## How to write washnotes

1. Create/edit `.md` files under `washnotes/` in the local clone.
2. Push directly to `main` (not a wash/* branch — washnotes are auto-validated by scope).
3. Pull `main` afterward to stay current.
