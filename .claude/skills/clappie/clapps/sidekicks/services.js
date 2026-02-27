// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SERVICES - Sidekick server status checks                                   ║
// ║                                                                           ║
// ║  Note: Tunnel is now handled by Tailscale background, not here.            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { $ } from 'bun';

// ─────────────────────────────────────────────────────────────────────────────
// SERVER STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function isServerRunning() {
  // Check if something is listening on port 7777
  try {
    const result = await $`lsof -i :7777 -sTCP:LISTEN 2>/dev/null`.text();
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getStatus() {
  const serverRunning = await isServerRunning();

  return {
    server: serverRunning,
    ready: serverRunning,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

export async function healthCheck() {
  try {
    const response = await fetch('http://localhost:7777/health');
    if (response.ok) {
      const data = await response.json();
      return { ok: true, ...data };
    }
    return { ok: false, error: 'Health check failed' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  isServerRunning,
  getStatus,
  healthCheck,
};
