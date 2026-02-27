#!/usr/bin/env bun
// Minimal static file server for projects
// Usage: bun static-server.js <dir> <port>

import { join } from 'path';

const dir = process.argv[2] || '.';
const port = parseInt(process.argv[3]) || 3000;

const MIME = {
  html: 'text/html', css: 'text/css', js: 'text/javascript',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', mp4: 'video/mp4',
  webm: 'video/webm', pdf: 'application/pdf', txt: 'text/plain',
};

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    path = decodeURIComponent(path);

    const file = Bun.file(join(dir, path));
    if (await file.exists()) {
      const ext = path.split('.').pop();
      return new Response(file, {
        headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
      });
    }

    // Try index.html for SPA routing
    const index = Bun.file(join(dir, 'index.html'));
    if (await index.exists()) {
      return new Response(index, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Serving ${dir} on http://localhost:${port}`);
