// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CONFIG - Skill-agnostic webhook configuration                            ║
// ║                                                                           ║
// ║  Discovers skills dynamically from .claude/skills/*/webhook.json          ║
// ║  Settings stored in recall/settings/<skill>/                              ║
// ║  Secrets come from env vars defined in each skill's webhook.json          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import router from './router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SKILLS_DIR = join(PROJECT_ROOT, '.claude', 'skills');
const SETTINGS_DIR = join(PROJECT_ROOT, 'recall', 'settings');

// ─────────────────────────────────────────────────────────────────────────────
// SKILL DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover all skills that have webhook.json (webhook-capable skills)
 * Returns array of { name, config, hasSend, secretEnvVars }
 */
export function discoverWebhookSkills() {
  const skills = [];
  if (!existsSync(SKILLS_DIR)) return skills;

  try {
    for (const dir of readdirSync(SKILLS_DIR)) {
      const webhookPath = join(SKILLS_DIR, dir, 'webhook.json');
      if (existsSync(webhookPath)) {
        try {
          const config = JSON.parse(readFileSync(webhookPath, 'utf-8'));

          // Collect all env vars this skill needs
          const secretEnvVars = [];
          if (config.signing?.secretEnvVar) {
            secretEnvVars.push(config.signing.secretEnvVar);
          }
          // Some skills may define additional required env vars
          if (config.requiredEnvVars) {
            secretEnvVars.push(...config.requiredEnvVars);
          }

          skills.push({
            name: dir,
            config,
            hasSend: !!config.send,  // Has messaging capability
            secretEnvVars,
            skillDir: join(SKILLS_DIR, dir),
          });
        } catch (err) {
          console.error(`[config] Error loading ${webhookPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[config] Error scanning skills: ${err.message}`);
  }

  return skills;
}

/**
 * Check if a skill has all required env vars configured
 */
export function skillHasCredentials(skill) {
  for (const envVar of skill.secretEnvVars) {
    if (!process.env[envVar]) {
      return false;
    }
  }
  return skill.secretEnvVars.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL SETTINGS (delegates to router)
// ─────────────────────────────────────────────────────────────────────────────

export function isSkillEnabled(skillName) {
  return router.loadSkillSetting(skillName, 'enabled') === 'true';
}

export function setSkillEnabled(skillName, enabled) {
  router.saveSkillSetting(skillName, 'enabled', enabled ? 'true' : 'false');
  return true;
}

export function getSkillWebhookPath(skillName) {
  return router.loadSkillWebhookPath(skillName);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEKICK SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export function getPort() {
  return router.getPort();
}

// Allowed file send paths (one directory per line)
// File MUST exist to enable file sending. No file = feature disabled.
export function getAllowedSendPaths() {
  const settingsPath = join(SETTINGS_DIR, 'sidekicks', 'allowed-send-file-paths.txt');
  if (!existsSync(settingsPath)) return null;

  try {
    const content = readFileSync(settingsPath, 'utf8').trim();
    if (!content) return null;

    const paths = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (paths.length === 0) return null;

    return paths.map(p => p.startsWith('/') ? p : join(PROJECT_ROOT, p));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // Skill discovery
  discoverWebhookSkills,
  skillHasCredentials,

  // Skill settings
  isSkillEnabled,
  setSkillEnabled,
  getSkillWebhookPath,

  // Sidekick settings
  getPort,
  getAllowedSendPaths,

  // Paths
  PROJECT_ROOT,
  SKILLS_DIR,
  SETTINGS_DIR,
};
