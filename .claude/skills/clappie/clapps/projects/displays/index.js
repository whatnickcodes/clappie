// Projects - Serve projects via Tailscale funnel
//
// Serve on a local port, funnel via custom external ports (8443, 8444, ...).
// Webhooks stay on :443, projects get their own ports. No path conflicts.
//
// Run: clappie display push projects

import {
  View,
  Label,
  Alert,
  Divider,
} from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects');
const STATIC_SERVER = join(__dirname, '..', 'static-server.js');

export const maxWidth = 80;

// ─────────────────────────────────────────────────────────────────────────────
// TAILSCALE
// ─────────────────────────────────────────────────────────────────────────────

function getTailscaleHostname() {
  try {
    const json = execSync('tailscale status --json 2>/dev/null', { encoding: 'utf8' });
    const data = JSON.parse(json);
    return data.Self?.DNSName?.replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}

function isTailscaleUp() {
  try {
    const json = execSync('tailscale status --json 2>/dev/null', { encoding: 'utf8' });
    const data = JSON.parse(json);
    return data.BackendState === 'Running';
  } catch {
    return false;
  }
}

function addFunnel(localPort, externalPort) {
  try {
    execSync(`tailscale funnel --bg --https ${externalPort} ${localPort} 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function removeFunnel(externalPort) {
  try {
    execSync(`tailscale funnel --https ${externalPort} off 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

function getProjects() {
  if (!existsSync(PROJECTS_DIR)) return [];

  return readdirSync(PROJECTS_DIR)
    .filter(name => {
      if (name.startsWith('.')) return false;
      const full = join(PROJECTS_DIR, name);
      try { return statSync(full).isDirectory(); } catch { return false; }
    })
    .map(name => {
      const dir = join(PROJECTS_DIR, name);
      const info = { name, dir, files: [] };
      try { info.files = readdirSync(dir); } catch {}

      if (info.files.includes('package.json')) {
        info.type = 'node';
        try {
          const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
          info.description = pkg.description || '';
          info.hasDevScript = !!(pkg.scripts?.dev || pkg.scripts?.start);
        } catch {}
      } else if (info.files.includes('index.html')) {
        info.type = 'static';
      } else if (info.files.includes('index.js') || info.files.includes('server.js')) {
        info.type = 'script';
      } else {
        info.type = 'unknown';
      }

      return info;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isPortListening(port) {
  try {
    const result = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// External ports for tailscale serve (one per project)
const EXTERNAL_PORTS = [8443, 8444, 8445, 8446, 8447, 8448];

function findFreePort(usedPorts) {
  for (const port of [3000, 3001, 3002, 3003, 5000, 5001, 8080, 8081, 8082]) {
    if (!usedPorts.has(port) && !isPortListening(port)) {
      return port;
    }
  }
  return null;
}

function findFreeExternalPort(usedExtPorts) {
  for (const port of EXTERNAL_PORTS) {
    if (!usedExtPorts.has(port)) return port;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ROW
// ─────────────────────────────────────────────────────────────────────────────

function ProjectRow({ project, serving, publicUrl, onToggle }) {
  return {
    type: 'project-row',
    focusable: true,
    label: project.name,

    render(focused = false) {
      const c = colors();
      const text = ansi.fg.rgb(...c.text);
      const muted = ansi.fg.rgb(...c.textMuted);
      const primary = ansi.fg.rgb(...c.primary);
      const green = ansi.fg.rgb(100, 200, 100);
      const reset = ansi.reset;

      const lines = [];

      // Main row: status + name + type
      const dot = serving
        ? `${green}●${reset}`
        : `${muted}○${reset}`;

      const name = focused
        ? `${primary}${project.name}${reset}`
        : `${text}${project.name}${reset}`;

      const typeLabels = { node: 'node', static: 'static', script: 'script' };
      const tag = typeLabels[project.type] ? `  ${muted}${typeLabels[project.type]}${reset}` : '';

      lines.push(`  ${dot}  ${name}${tag}`);

      // Button on same line
      const btn = serving
        ? (focused ? `${primary}[Stop]${reset}` : `${muted}[Stop]${reset}`)
        : (focused ? `${primary}[Serve]${reset}` : `${muted}[Serve]${reset}`);

      lines[0] += `  ${btn}`;

      return lines;
    },

    getWidth() {
      return maxWidth;
    },

    onKey(key) {
      if (key === 'ENTER' || key === ' ') {
        onToggle();
        return true;
      }
      return false;
    },

    onClick() {
      onToggle();
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function create(ctx) {
  ctx.setTitle('Projects');
  ctx.setDescription('Serve via Tailscale');

  const view = new View(ctx);
  let projects = [];
  let serving = {};     // projectName -> { port, extPort, url }
  let hostname = null;
  let tsUp = false;
  let pollInterval = null;

  function loadProjects() {
    projects = getProjects();
    hostname = getTailscaleHostname();
    tsUp = isTailscaleUp();
  }

  function startServing(project) {
    if (!tsUp) {
      ctx.toast('Tailscale not connected');
      return;
    }

    const usedPorts = new Set(Object.values(serving).map(s => s.port));
    const port = findFreePort(usedPorts);
    if (!port) {
      ctx.toast('No free port');
      return;
    }

    const usedExtPorts = new Set(Object.values(serving).map(s => s.extPort));
    const extPort = findFreeExternalPort(usedExtPorts);
    if (!extPort) {
      ctx.toast('No free external port');
      return;
    }

    // Build serve command based on type
    let cmd;
    if (project.type === 'static' || project.type === 'unknown') {
      // Use the static server for HTML projects
      cmd = `bun "${STATIC_SERVER}" "${project.dir}" ${port}`;
    } else if (project.type === 'node' && project.hasDevScript) {
      cmd = `cd "${project.dir}" && PORT=${port} bun run dev`;
    } else if (project.type === 'script') {
      const entry = project.files.includes('server.js') ? 'server.js' : 'index.js';
      cmd = `cd "${project.dir}" && PORT=${port} bun run ${entry}`;
    }

    // Start the local server
    const child = spawn('bash', ['-c', cmd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Funnel via custom external port (webhooks stay on :443)
    const funnelOk = addFunnel(port, extPort);

    const url = funnelOk && hostname
      ? `https://${hostname}:${extPort}`
      : null;

    serving[project.name] = { port, extPort, url };

    if (url) {
      ctx.toast(`Live: ${url}`);
    } else {
      ctx.toast(`Serving on :${port} (funnel failed)`);
    }

    setTimeout(() => render(), 300);
  }

  function stopServing(project) {
    const info = serving[project.name];
    if (!info) return;

    // Kill the process on that port
    try {
      const pids = execSync(`lsof -ti :${info.port} 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (pids) {
        execSync(`kill ${pids.split('\n').join(' ')} 2>/dev/null`);
      }
    } catch {}

    // Remove funnel
    removeFunnel(info.extPort);

    delete serving[project.name];
    ctx.toast(`Stopped ${project.name}`);
    render();
  }

  function render() {
    view.clear();

    // Tailscale status
    if (!tsUp) {
      view.add(Alert({
        variant: 'warning',
        message: 'Tailscale not connected — run: clappie background start tailscale'
      }));
      view.space();
    } else if (hostname) {
      const c = colors();
      const green = ansi.fg.rgb(100, 200, 100);
      const muted = ansi.fg.rgb(...c.textMuted);
      const reset = ansi.reset;
      view.add(Label({ text: `  ${green}●${reset}  ${muted}Tailscale · ${hostname}${reset}` }));

      // Show live project URLs — easy to copy, away from buttons
      const liveProjects = Object.entries(serving);
      if (liveProjects.length > 0) {
        view.space();
        for (const [name, info] of liveProjects) {
          if (info.url) {
            view.add(Label({ text: `     ${green}${name}${reset}  ${muted}${info.url}${reset}` }));
          }
        }
      }

      view.space();
      view.add(Divider({}));
      view.space();
    }

    if (projects.length === 0) {
      view.add(Alert({
        variant: 'info',
        message: 'No projects yet'
      }));
      view.space();
      view.add(Label({ text: 'Create a directory in projects/ to get started', dim: true }));
      view.render();
      return;
    }

    // Project list
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const info = serving[project.name];

      view.add(ProjectRow({
        project,
        serving: info || null,
        publicUrl: info?.url || null,
        onToggle: () => {
          if (info) {
            stopServing(project);
          } else {
            startServing(project);
          }
        },
      }));

      if (i < projects.length - 1) {
        view.space();
      }
    }

    // Summary
    const liveCount = Object.keys(serving).length;
    if (liveCount > 0) {
      const c = colors();
      const green = ansi.fg.rgb(100, 200, 100);
      const muted = ansi.fg.rgb(...c.textMuted);
      const reset = ansi.reset;

      view.space();
      view.add(Divider({}));
      view.space();
      view.add(Label({
        text: `  ${green}${liveCount}${reset} ${muted}project${liveCount > 1 ? 's' : ''} live${reset}`
      }));
    }

    view.render();
  }

  return {
    init() {
      loadProjects();
      render();

      // Poll for changes
      pollInterval = setInterval(() => {
        const newProjects = getProjects();
        const changed = newProjects.length !== projects.length ||
          newProjects.some((p, i) => p.name !== projects[i]?.name);

        // Also recheck tailscale
        const newTsUp = isTailscaleUp();
        if (changed || newTsUp !== tsUp) {
          projects = newProjects;
          tsUp = newTsUp;
          if (newTsUp && !hostname) hostname = getTailscaleHostname();
          render();
        }
      }, 3000);
    },

    render,

    onKey(key) {
      if (key === 'r' || key === 'R') {
        loadProjects();
        render();
        return true;
      }
      return view.handleKey(key);
    },

    cleanup() {
      if (pollInterval) clearInterval(pollInterval);
    }
  };
}
