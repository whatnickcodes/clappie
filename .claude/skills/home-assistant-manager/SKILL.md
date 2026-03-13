---
name: home-assistant-manager
description: Expert-level Home Assistant configuration management with efficient deployment workflows (git and rapid scp iteration), remote CLI access via SSH and hass-cli, automation verification protocols, log analysis, reload vs restart optimization, and comprehensive Lovelace dashboard management for tablet-optimized UIs. Includes template patterns, card types, debugging strategies, and real-world examples.
---

# Home Assistant Manager

Expert-level Home Assistant configuration management with efficient workflows, remote CLI access, and verification protocols.

## Core Capabilities

- Remote Home Assistant instance management via SSH and hass-cli
- Smart deployment workflows (git-based and rapid iteration)
- Configuration validation and safety checks
- Automation testing and verification
- Log analysis and error detection
- Reload vs restart optimization
- Lovelace dashboard development and optimization
- Template syntax patterns and debugging
- Tablet-optimized UI design
- Updated for **HA 2026.2** (Add-ons→Apps terminology, Quick Search Ctrl/Cmd+K, purpose-specific triggers)

## Prerequisites

1. SSH access to HA instance (`root@homeassistant.local`)
2. `hass-cli` installed with HASS_SERVER/HASS_TOKEN env vars
3. Git repo connected to HA `/config` directory
4. Context7 MCP server (recommended)

## Remote Access Patterns

### hass-cli (REST API)
```bash
hass-cli state list                    # List entities
hass-cli state get sensor.name         # Get state
hass-cli service call automation.reload
hass-cli service call automation.trigger --arguments entity_id=automation.name
```

### SSH (HA CLI)
```bash
ssh root@homeassistant.local "ha core check"    # Validate config
ssh root@homeassistant.local "ha core restart"  # Restart HA
ssh root@homeassistant.local "ha core logs | grep -i error | tail -20"
```

## Deployment Workflows

### Git Workflow (Final Changes)
```bash
ssh root@homeassistant.local "ha core check"           # 1. Validate
git add file.yaml && git commit -m "..." && git push   # 2. Commit
ssh root@homeassistant.local "cd /config && git pull"  # 3. Pull to HA
hass-cli service call automation.reload                # 4. Reload (or restart)
```

### scp Workflow (Rapid Iteration)
```bash
scp automations.yaml root@homeassistant.local:/config/  # Deploy
hass-cli service call automation.reload                  # Reload
# Iterate until working, then commit to git
```

**scp** → rapid testing, UI work | **git** → final changes, version control

## Reload vs Restart

**Prefer reload when possible.**

| Reloadable | Command |
|------------|---------|
| Automations | `automation.reload` |
| Scripts | `script.reload` |
| Scenes | `scene.reload` |
| Templates | `template.reload` |
| Groups | `group.reload` |
| Themes | `frontend.reload_themes` |

**Require restart:** Min/Max sensors, new integrations, core config changes, MQTT platforms

## Automation Verification

**Always verify after deployment:**

```bash
# 1. Deploy & reload
ssh root@homeassistant.local "cd /config && git pull"
hass-cli service call automation.reload

# 2. Manually trigger (instant feedback)
hass-cli service call automation.trigger --arguments entity_id=automation.name

# 3. Check logs
ssh root@homeassistant.local "ha core logs | grep -i 'automation_name' | tail -20"

# 4. Verify outcome
hass-cli state get sensor.new_sensor
```

**Log indicators:** Success = `Initialized trigger`, `Running automation actions` | Error = `Error executing script`, `TypeError`

**2026.2 triggers:** Test `person.arrives_home` via Developer Tools → States or `hass-cli state set person.name home`

## Dashboard Management

**Key concepts:**
- Dashboard files: `.storage/lovelace.<name>` (JSON)
- Must register in `.storage/lovelace_dashboards` for sidebar
- Changes don't require restart (browser refresh only)

### Dashboard Workflow
```bash
# Rapid iteration
scp .storage/lovelace.dashboard root@homeassistant.local:/config/.storage/
# Refresh browser (Ctrl+F5) — no restart needed

# New dashboard: create file + register + restart
scp .storage/lovelace.new root@homeassistant.local:/config/.storage/
scp .storage/lovelace_dashboards root@homeassistant.local:/config/.storage/
ssh root@homeassistant.local "ha core restart"
```

### View Types
- **Panel view** → full-screen (vacuum maps, cameras), no margins
- **Sections view** → multi-card layouts, responsive grid, ~10% margins

### Card Types

| Card | Use Case | Key Props |
|------|----------|-----------|
| `distribution` (2026.2) | Proportional viz (energy) | `entities: [{entity, name}]` |
| `entity` (2026.2) | Single entity | `tap_action`, `hold_action`, `double_tap_action` |
| `tile` | Climate/controls | `features: [{type: "climate-hvac-modes"}]` |
| `custom:mushroom-light-card` | Touch-friendly lights | `use_light_color`, `show_brightness_control` |
| `custom:mushroom-template-card` | Dynamic content | `primary`, `secondary` (Jinja2), `icon_color` |

**Mushroom template example:**
```json
{"type": "custom:mushroom-template-card", "primary": "Doors", "secondary": "{{ states.binary_sensor | selectattr('state','eq','on') | list | length }} open", "icon_color": "{{ 'red' if open > 0 else 'green' }}"}
```

### Template Patterns

```jinja2
# Count open sensors
{% set open = ['binary_sensor.door1', 'binary_sensor.door2'] | select('is_state', 'on') | list | length %}

# Color-code by threshold
{% set days = state_attr('sensor.x', 'days') | int %}
{{ 'red' if days <= 1 else 'amber' if days <= 3 else 'green' }}
```
**Always use `| int` or `| float`** to avoid type errors in comparisons.

### Tablet Tips
- 3-4 columns for 11" tablets, min 44x44px touch targets
- Use panel view for full-screen (vacuum maps), sections view for grids

### Common Pitfalls

| Problem | Fix |
|---------|-----|
| Dashboard not in sidebar | Register in `.storage/lovelace_dashboards` + restart |
| "Configuration Error" | Check HACS install, browser console (F12), test templates |
| Template type errors | Use `| int` or `| float` filters |
| Margins on vacuum map | Switch to panel view |

### Debugging
1. **Browser F12** → "Custom element doesn't exist" = card not installed
2. **Validate JSON:** `python3 -m json.tool .storage/lovelace.file > /dev/null`
3. **Test templates:** Settings → Developer Tools → Template (live preview in 2026.2)
4. **Hard refresh:** Ctrl+F5 / Cmd+Shift+R

## Quick Reference

```bash
# Core
ssh root@homeassistant.local "ha core check"     # Validate
ssh root@homeassistant.local "ha core restart"   # Restart
ssh root@homeassistant.local "ha core logs | grep -i error | tail -20"

# State/Services
hass-cli state get entity.name
hass-cli service call automation.reload
hass-cli service call automation.trigger --arguments entity_id=automation.name

# Deploy
scp file.yaml root@homeassistant.local:/config/                    # Quick test
git push && ssh root@homeassistant.local "cd /config && git pull"  # Final
```

**2026.2:** Use Ctrl/Cmd+K in browser for Quick Search (entities, devices, commands).

## Best Practices

- `ha core check` before restart
- Prefer reload over restart
- Test automations via manual trigger
- scp for iteration → git for final
- Validate JSON: `python3 -m json.tool file.json > /dev/null`
- Test templates in Settings → Developer Tools (live preview in 2026.2)
